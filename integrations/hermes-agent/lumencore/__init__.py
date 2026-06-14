"""LumenCore memory plugin — Hermes Agent MemoryProvider.

Connects Hermes to a networked LumenCore instance (local-first SQLite memory,
served over HTTP / Tailscale by `lumencore serve-http`). Deliberate memory: the
agent stores facts with `lumencore_remember` and finds them with
`lumencore_recall`; recent context is prefetched before each turn.

Config (env vars, or $HERMES_HOME/lumencore.json overrides):
  LUMENCORE_URL     — base URL of `lumencore serve-http` (required)
  LUMENCORE_TOKEN   — bearer token (optional, recommended)
  LUMENCORE_PROJECT — project namespace for this agent (default: hermes)

Uses only the Python standard library (urllib) — no pip dependencies.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List

from agent.memory_provider import MemoryProvider
from tools.registry import tool_error

logger = logging.getLogger(__name__)

_BREAKER_THRESHOLD = 5
_BREAKER_COOLDOWN_SECS = 120


def _load_config() -> dict:
    from hermes_constants import get_hermes_home

    cfg = {
        "url": os.environ.get("LUMENCORE_URL", ""),
        "token": os.environ.get("LUMENCORE_TOKEN", ""),
        "project": os.environ.get("LUMENCORE_PROJECT", "hermes"),
    }
    path = get_hermes_home() / "lumencore.json"
    if path.exists():
        try:
            file_cfg = json.loads(path.read_text(encoding="utf-8"))
            cfg.update({k: v for k, v in file_cfg.items() if v not in (None, "")})
        except Exception:
            pass
    return cfg


RECALL_SCHEMA = {
    "name": "lumencore_recall",
    "description": (
        "Search this project's LumenCore memory for relevant past decisions, "
        "patterns, concepts, and notes. Use at the start of a task."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "What to search for."},
            "limit": {"type": "integer", "description": "Max results (default 8, max 50)."},
        },
        "required": ["query"],
    },
}

REMEMBER_SCHEMA = {
    "name": "lumencore_remember",
    "description": (
        "Store a durable memory in LumenCore. Use for decisions, conventions, "
        "domain concepts, and important notes worth keeping across sessions."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "category": {"type": "string", "enum": ["decision", "pattern", "concept", "note", "task"]},
            "title": {"type": "string", "description": "Short descriptive title."},
            "content": {"type": "string", "description": "Full content of the memory."},
            "tags": {"type": "array", "items": {"type": "string"}},
            "importance": {"type": "integer", "minimum": 1, "maximum": 5},
        },
        "required": ["category", "title", "content"],
    },
}


class LumencoreMemoryProvider(MemoryProvider):
    """Cross-session, cross-machine memory backed by a networked LumenCore."""

    def __init__(self):
        self._url = ""
        self._token = ""
        self._project = "hermes"
        self._timeout = 8.0
        self._prefetch_result = ""
        self._prefetch_lock = threading.Lock()
        self._prefetch_thread = None
        self._consecutive_failures = 0
        self._breaker_open_until = 0.0

    @property
    def name(self) -> str:
        return "lumencore"

    def is_available(self) -> bool:
        # No network calls here, per the plugin contract.
        return bool(_load_config().get("url"))

    def get_config_schema(self):
        return [
            {"key": "url", "description": "LumenCore serve-http base URL (e.g. http://sentinel:4318)", "required": True, "env_var": "LUMENCORE_URL"},
            {"key": "token", "description": "Bearer token", "secret": True, "env_var": "LUMENCORE_TOKEN"},
            {"key": "project", "description": "Project namespace for this agent", "default": "hermes", "env_var": "LUMENCORE_PROJECT"},
        ]

    def save_config(self, values, hermes_home):
        from pathlib import Path

        path = Path(hermes_home) / "lumencore.json"
        existing = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                existing = {}
        existing.update({k: v for k, v in values.items() if v is not None})
        path.write_text(json.dumps(existing, indent=2), encoding="utf-8")

    def initialize(self, session_id: str, **kwargs) -> None:
        cfg = _load_config()
        self._url = cfg.get("url", "").rstrip("/")
        self._token = cfg.get("token", "")
        # Gateway may scope per-user; otherwise use the configured project.
        self._project = kwargs.get("user_id") or cfg.get("project", "hermes")

    # ---- circuit breaker ----
    def _breaker_open(self) -> bool:
        if self._consecutive_failures < _BREAKER_THRESHOLD:
            return False
        if time.monotonic() >= self._breaker_open_until:
            self._consecutive_failures = 0
            return False
        return True

    def _ok(self) -> None:
        self._consecutive_failures = 0

    def _fail(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= _BREAKER_THRESHOLD:
            self._breaker_open_until = time.monotonic() + _BREAKER_COOLDOWN_SECS
            logger.warning("LumenCore breaker tripped; pausing %ds.", _BREAKER_COOLDOWN_SECS)

    # ---- http ----
    def _http(self, method: str, path: str, *, params=None, body=None):
        url = self._url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("content-type", "application/json")
        if self._token:
            req.add_header("authorization", "Bearer " + self._token)
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _recall(self, query: str, limit: int = 8):
        return self._http("GET", "/v1/recall", params={"project": self._project, "q": query, "limit": limit})

    def system_prompt_block(self) -> str:
        return (
            "# LumenCore Memory\n"
            f"Active · project '{self._project}'. Use lumencore_recall to find past "
            "decisions/patterns/concepts, and lumencore_remember to store durable ones."
        )

    def prefetch(self, query: str, *, session_id: str = "") -> str:
        if self._prefetch_thread and self._prefetch_thread.is_alive():
            self._prefetch_thread.join(timeout=3.0)
        with self._prefetch_lock:
            result = self._prefetch_result
            self._prefetch_result = ""
        return f"## LumenCore Memory\n{result}" if result else ""

    def queue_prefetch(self, query: str, *, session_id: str = "") -> None:
        if self._breaker_open() or not self._url:
            return

        def _run():
            try:
                results = self._recall(query, 5).get("results", [])
                if results:
                    lines = [
                        f"- [{m.get('category')}] {m.get('title')}: {(m.get('content') or '')[:160]}"
                        for m in results
                    ]
                    with self._prefetch_lock:
                        self._prefetch_result = "\n".join(lines)
                self._ok()
            except Exception as e:
                self._fail()
                logger.debug("LumenCore prefetch failed: %s", e)

        self._prefetch_thread = threading.Thread(target=_run, daemon=True, name="lumencore-prefetch")
        self._prefetch_thread.start()

    def sync_turn(self, user_content: str, assistant_content: str, *, session_id: str = "") -> None:
        # LumenCore favors deliberate memory — no automatic per-turn capture.
        return None

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        return [RECALL_SCHEMA, REMEMBER_SCHEMA]

    def handle_tool_call(self, tool_name: str, args: dict, **kwargs) -> str:
        if self._breaker_open():
            return json.dumps({"error": "LumenCore temporarily unavailable; will retry automatically."})
        if not self._url:
            return tool_error("LUMENCORE_URL is not configured.")
        try:
            if tool_name == "lumencore_recall":
                query = args.get("query", "")
                if not query:
                    return tool_error("Missing required parameter: query")
                results = self._recall(query, min(int(args.get("limit", 8)), 50)).get("results", [])
                self._ok()
                if not results:
                    return json.dumps({"result": "No relevant memories found."})
                items = [
                    {"id": m.get("id"), "category": m.get("category"), "title": m.get("title"),
                     "content": m.get("content"), "importance": m.get("importance"), "project": m.get("project")}
                    for m in results
                ]
                return json.dumps({"results": items, "count": len(items)})

            if tool_name == "lumencore_remember":
                body = {
                    "project": self._project,
                    "category": args.get("category"),
                    "title": args.get("title"),
                    "content": args.get("content"),
                    "tags": args.get("tags", []),
                    "importance": args.get("importance"),
                }
                if not (body["category"] and body["title"] and body["content"]):
                    return tool_error("category, title, content are required")
                out = self._http("POST", "/v1/remember", body=body)
                self._ok()
                return json.dumps({"result": "Stored.", "id": (out.get("memory") or {}).get("id")})
        except Exception as e:
            self._fail()
            return tool_error(str(e))

        return tool_error(f"Unknown tool: {tool_name}")

    def shutdown(self) -> None:
        if self._prefetch_thread and self._prefetch_thread.is_alive():
            self._prefetch_thread.join(timeout=5.0)


def register(ctx) -> None:
    """Register LumenCore as a memory provider plugin."""
    ctx.register_memory_provider(LumencoreMemoryProvider())
