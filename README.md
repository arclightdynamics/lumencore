# LumenCore

**The local-first memory layer for AI agents — one you can actually sit down and watch.**

LumenCore is a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI coding assistants (Claude Code, Cursor, and ~15 others) persistent memory across sessions — architectural decisions, code patterns, domain concepts, and project history. No Docker, no API keys, no cloud. Just `npm install` and a SQLite file on your machine.

What makes it different from other memory tools:

- 🧠 **Deliberate memory** — agents store knowledge by *choosing* to, not by silently vacuuming every turn.
- 🖥️ **A real dashboard** — `lumencore ui` is a Linear-style local web app to browse, search, edit, and **watch a live force-directed graph** of what your agents know.
- 🔌 **One-command install** — auto-detects ~15 MCP clients and wires them up; **WSL-aware** (bridges Windows tools to your WSL brain).
- 🌐 **Networked** — optionally serve one shared brain across machines over your LAN/Tailscale.
- ⚖️ **Conflict-aware** — detects overlapping memories and supports supersession, so old facts don't silently contradict new ones.
- 🔒 **Local & private** — everything stays in local SQLite; the default install makes zero network calls.

---

## Install

```bash
npm install -g lumencore
lumencore install        # detect your AI clients and connect them (interactive)
```

`lumencore install` finds the MCP clients you have and registers LumenCore with each. On **WSL**, it also offers to connect your **Windows-side** clients to the same WSL brain.

```bash
lumencore install --list        # show what's detected (incl. Windows-side on WSL)
lumencore install --yes         # connect everything detected, no prompts
lumencore install --dry-run     # preview, write nothing
lumencore install --client cursor --global
lumencore install --no-windows  # (on WSL) skip the Windows bridge
```

Every write is **merge-aware** (your existing config is preserved) and **backed up** (`*.lumencore.bak`) first.

### Supported clients

Auto-configured by `lumencore install`:

| Format | Clients |
|--------|---------|
| JSON | Claude Code, Claude Desktop, Cursor, Cline, Roo Code, VS Code / Copilot, Zed, Gemini CLI, LM Studio, Junie, Amazon Q, Warp |
| TOML | OpenAI Codex CLI |
| YAML | Goose, Continue.dev |

Detected but manual (no writable config): Witsy, Cherry Studio.

---

## Quick start

```bash
cd /your/project
lumencore init           # writes CLAUDE.md + .lumencore.json, scans the project
lumencore ui             # open the dashboard at http://localhost:4317
```

Then just use your agent. When it makes a decision worth keeping, it calls `remember`; when it needs context, it calls `recall`.

---

## CLI commands

| Command | What it does |
|---------|--------------|
| `lumencore install` | Detect AI clients and register LumenCore (WSL-aware, multi-select) |
| `lumencore ui` | Launch the local web dashboard (`127.0.0.1:4317`) |
| `lumencore serve` | Start the stdio MCP server (used by local clients) |
| `lumencore serve-http` | Start the **networked** memory API (share one brain over LAN/Tailscale) |
| `lumencore init` | Set up the current project (CLAUDE.md, `.lumencore.json`, scan) |
| `lumencore backfill` | Name legacy memories by reverse-mapping project hashes → paths |
| `lumencore setup` | Global setup wizard (memory scope, data dir) |
| `lumencore status` | Show config + memory stats |
| `lumencore export` | Export memories to JSON (`--global`, `--all`, `-o file`) |
| `lumencore reset --force` | Delete all data |

---

## MCP tools (what your agent can call)

| Tool | Purpose |
|------|---------|
| `lumencore_activate` | Load project context at session start (auto-called) |
| `remember` | Store a memory (category, title, content, tags, importance, scope, source, confidence, expires_at) |
| `recall` | Full-text search; bumps access tracking |
| `list_memories` | Browse memories |
| `update_memory` | Edit a memory in place |
| `forget` | Delete a memory |
| `supersede_memory` | Mark one memory as replaced by another (links both) |
| `check_conflicts` | Find memories overlapping a prospective one, before writing |
| `capture_turn` | After an exchange, suggest what's worth remembering (you confirm) |
| `init_project` | Scan + capture a new project |

> **Deliberate by design:** LumenCore never auto-captures your edits or chat. Memory only changes when the agent explicitly calls `remember` / `update_memory` / etc. `capture_turn` *suggests*; the agent confirms.

---

## How memory works

**Categories:** `decision` · `pattern` · `concept` · `note` · `task`
**Importance:** 1–5. **Scope:** `project` (default) or `global` (shared across projects).

Each memory also tracks `source`, `confidence`, `tags`, `access_count` / `last_accessed`, optional `expires_at`, and supersession links (`supersedes` / `superseded_by`).

### Retrieval
FTS5 full-text search ranked by **BM25 relevance** (title/tag matches weighted above body), then nudged by **soft priors** — importance and recency multiply the score but never override relevance. (Recently-recalled is driven by the access tracking, so the dashboard shows what your agents actually use.)

### Conflicts & supersession
On every `remember`, LumenCore looks for overlapping memories and returns a "possible conflict" envelope. The agent resolves it next turn with `supersede_memory` (old → new), `update_memory`, or by letting them coexist. Superseded memories drop out of future recalls and conflict checks.

### Per-project policy — `.lumencore.json`
`lumencore init` writes a small file at the repo root:

```json
{ "name": "my-project", "allowGlobal": false }
```

- `name` — a stable project identity (survives path moves / reclones).
- `allowGlobal` — may agents in this repo write **global** memories? Default **false** (local-only, privacy-safe). Set it with `lumencore init --allow-global`. Global writes from a local-only project are refused server-side.

---

## The dashboard — `lumencore ui`

A dependency-free, Linear-style local web app at **`http://localhost:4317`** (loopback only). Reads your SQLite directly.

| Route | |
|-------|---|
| **Dashboard** | stats · recently written · recently recalled · projects |
| **Project** | filter by category / importance / tag, sort, search |
| **Memory** | view + edit (title, content, tags, importance), delete, supersede; markdown preview |
| **Graph** | live force-directed graph — nodes = memories (colored by category), edges = shared tags + supersession, clustered by project; **new memories spring in, recalled ones pulse**; zoom / pan |
| **Global · Search · Timeline · Live** | global-scope browse · cross-project FTS · group-by-day · streaming write/recall feed |
| **Settings** | data dir, scope, version, dark/light + accent toggle |
| **⌘K** | command palette — jump to any project, search memories, navigate |

---

## Networked memory (shared brain)

Run one LumenCore as a memory server that remote agents share over your LAN/Tailscale:

```bash
lumencore serve-http --host <tailnet-ip> --port 4318 --token <secret>
```

Exposes a small HTTP API — `GET /v1/health`, `GET /v1/recall`, `POST /v1/remember`, `GET /v1/list` — with Bearer-token auth. Projects are addressed by **stable name**, so the same logical project resolves identically from any machine.

> Note: this is a REST API for custom integrations (see `integrations/`). Generic MCP-over-HTTP for arbitrary MCP clients is on the roadmap.

### WSL → Windows
On WSL, `lumencore install` detects your Windows-side clients (under `/mnt/c/Users/<you>`) and registers them to launch LumenCore through `wsl.exe` — so your Windows tools and WSL tools share **one brain**, no duplicate install.

---

## Architecture & data

```
 client (Claude Code / Cursor / …)
   │  MCP (stdio)            ▲  HTTP (serve-http, optional)
   ▼                         │
 LumenCore  ──►  SQLite + FTS5  (one DB per project + a global DB)
```

```
{dataDir}/projects/{project-id}/memories.db
{dataDir}/global/memories.db
```

Config lives at `~/.config/lumencore/config.json` (XDG; platform-appropriate on macOS/Windows). All data is local — no external services on the default install.

---

## Optional integrations

The `integrations/` directory holds optional, out-of-core glue (not compiled into the CLI):

- **`integrations/hermes-agent/lumencore/`** — a memory-provider plugin for the Nous [Hermes Agent](https://github.com/NousResearch/hermes-agent) that makes a networked LumenCore (`serve-http`) Hermes's selectable `memory.provider`.

---

## Requirements

- Node.js ≥ 18
- An MCP-capable AI client

## License

MIT
