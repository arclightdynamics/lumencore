# LumenCore Roadmap — "the best free memory MCP"

> Drafted 2026-05-24 with Aria. Synthesizes a deep audit of the current codebase
> against the 2026 agent-memory landscape (mem0, Letta, Zep/Graphiti, Cognee,
> Memori, doobidoo/mcp-memory-service, agentmemory, MemPalace, MemOS, and the
> Anthropic reference memory server).

---

## TL;DR positioning

LumenCore should be the **smallest, frictionless, MCP-native memory layer** for
solo devs and small teams — `npm install`, no Docker, no API keys, no
external services required — plus the **only one that ships a browsable UI
and a "talk to your memory" chatbot** when bundled with Scryfall.

The pitch:

> *Other memory tools are headless — your agent queries them silently.
> LumenCore is the only one you can sit down and have a conversation with about
> what your agents know.*

---

## Where we are today (honest snapshot)

| Layer            | Current state                                                  |
| ---------------- | -------------------------------------------------------------- |
| Runtime          | Node.js MCP server, `better-sqlite3`                           |
| Storage          | SQLite per-project (sha256-hashed path) + optional global DB   |
| Schema           | Single `memories` table: id, project_id, scope, category, title, content, tags (JSON string), importance 1–5, timestamps |
| Retrieval        | SQLite FTS5 (BM25) → re-sorted in JS by importance, then recency *(loses the relevance signal!)* |
| MCP tools        | `remember`, `recall`, `forget`, `list_memories`, `lumencore_activate` |
| MCP resources    | Read-only views for decisions, patterns, concepts, recent      |
| Auto-bootstrap   | Scans project structure, configs, tech stack on first activation |
| Install footprint| Tiny — Node + SQLite, no API keys, no Docker                   |

---

## Where we win right now

- **Smallest viable surface area** in the category. No Docker, no API keys, no
  Qdrant, no Postgres, no embedding model download. `npm install` → working.
- **Dual project + global scope** — genuinely rare. mem0/Memori think in users
  and sessions; Graphiti thinks in graphs; the Anthropic reference server is
  one big JSON blob. Almost nobody else does "this memory belongs to this repo,
  that one is global" as a first-class axis.
- **Clean, small codebase** — clear separation of server/services/storage/types,
  WAL-mode SQLite, FTS5 with triggers kept in sync, graceful shutdown, sensible
  XDG paths.
- **Good LLM-facing tool descriptions** — the `lumencore_activate` nudge is
  well-tuned.

## Where we are behind (concrete gaps)

| Gap                              | What competitors do                                  | Severity |
| -------------------------------- | ---------------------------------------------------- | -------- |
| No semantic retrieval            | mem0, Memori, Graphiti, doobidoo, sqlite-memory ship hybrid FTS + vector | **High** |
| Relevance score discarded        | Hybrid + recency *prior*, not hard re-sort           | **High** |
| No passive fact extraction       | mem0/Memori auto-capture structured state every turn | **High** |
| No conflict resolution           | Graphiti's signature feature; mem0 ships LLM-judge   | **High** |
| No supersession / temporal validity | Graphiti's signature feature                      | Medium   |
| No consolidation / forgetting    | doobidoo's autonomous consolidation                  | Medium   |
| **No browsable UI**              | agentmemory, MemPalace, OpenClaw Memory Viewer ship dashboards | **High** |
| No multi-client auto-install     | `engram` is the bar — auto-detects all MCP clients   | **High** |
| Tags as JSON string              | Normalized tag tables, indexable                     | Low      |
| No per-agent provenance/namespace | Letta tracks per-agent provenance                   | Low      |
| Project ID is opaque hash        | Easy to lose memories when repo is moved/recloned    | Medium   |

---

## V1 design — the "use the host LLM for the smart parts" insight

Most competitors ship their own embedding model or LLM. **We don't have to** —
every LumenCore user is, by definition, connecting LumenCore to a host LLM
(Claude in Claude Code, GPT in Cursor, etc.). That LLM is already thinking.
We exploit it.

### Where the host LLM does the work for us

| Job                         | How we use the host LLM                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| Semantic gap in retrieval   | `recall` returns FTS candidates. If empty/weak, the agent calls again with synonyms / reformulated query. The LLM's intelligence replaces embeddings for v1. |
| Conflict resolution         | New `check_conflicts` tool: returns the new memory + overlapping ones + structured prompt. Host LLM decides supersede / merge / coexist in its next turn. |
| Passive extraction          | New `capture_turn` tool: agent calls it after each meaningful exchange with the last turn's text. Server uses heuristics + the agent's structured response to store facts. |
| Importance scoring on write | Agent fills in importance/category/tags — they already know what matters.  |

### Where we still need our own infra

| Job              | Plan                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| Fast retrieval   | Keep FTS5. Tune `bm25` weights. **Stop the importance/recency hard re-sort** — apply them as soft multipliers, not overrides. |
| Embedding (later)| Optional, behind a flag. Bundle a tiny model via `transformers.js` (~30 MB quantized MiniLM/e5-small). No Ollama required. |
| LLM-judge (later)| Optional. Default behavior: write both, surface "potential conflict" in UI. Power users can wire OpenAI/Ollama for auto-resolution. |

---

## V1 shipping plan — ranked by leverage

### 1. `lumencore install` auto-installer ⭐ headline feature

Single command that detects every MCP client on the machine and writes the
correct config:

- Claude Code (`~/.claude/`)
- Claude Desktop (`~/Library/Application Support/Claude/`)
- Cursor (`~/.cursor/mcp.json`)
- Cline (VSCode settings)
- Windsurf
- Zed
- Continue
- Codex CLI
- Aider

**No competitor in the memory category does this cleanly.** `engram` does it
for itself; we'd be first in the memory niche.

- Touches: new `src/install/` tree, per-client config writers
- Effort: medium

### 2. Fix retrieval relevance (drop the hard re-sort)

The current code computes BM25 then sorts by importance/recency, throwing
relevance away. Convert importance and recency into **soft priors** that boost
the BM25 score rather than overriding it.

- Touches: `src/services/search.ts`
- Effort: small
- Impact: immediate quality jump on every `recall`

### 3. Schema enrichment

Add: `source` (which agent wrote this), `confidence`, `supersedes_id`,
`superseded_by_id`, `last_accessed`, `access_count`, `expires_at`,
`project_path` (mirror of hash for human readability). Normalize tags into
their own table. Add an `update_memory` MCP tool (the service supports it,
the MCP layer doesn't expose it).

- Touches: `src/storage/database.ts` (migration), `src/services/memory.ts`,
  `src/types/index.ts`, `src/server.ts`
- Effort: small-to-medium

### 4. `check_conflicts` MCP tool (host LLM as judge)

On every `remember` call, search for overlapping memories. If hits, the server
returns a structured "possible conflict" envelope with the new memory + the
candidates + a suggested adjudication prompt. The host LLM resolves on its
next turn by calling `supersede_memory(old_id, new_id)`, `update_memory`, or
ignoring.

- Touches: `src/services/memory.ts`, `src/server.ts`
- Effort: small (logic is mostly server-side; the LLM does the thinking)

### 5. `capture_turn` MCP tool (host LLM as extractor)

Agent calls it after each meaningful exchange. Returns a structured "what to
remember" suggestion, agent confirms by writing the actual `remember` calls.
Pattern matches mem0's UX without needing mem0's infrastructure.

- Touches: `src/services/extraction.ts` (new), `src/server.ts`
- Effort: small

### 6. Fix self-registration — dogfood on LumenCore's own repo

LumenCore is registered as an MCP server for sibling projects (scryfall,
chronoflow, `/mnt/c/Users/Owner`) but **not for its own repo** — so
`lumencore_activate` is unavailable while developing LumenCore itself, the one
place `CLAUDE.md` mandates it. Note that `.claude/settings.local.json`
allow-lists the tools, but allow-listing only grants *permission*; it does not
*register* the server. The auto-installer (item 1) must cover the active repo,
and `lumencore install` should detect and warn when the current project has no
lumencore server configured.

- Touches: `src/install/` (with item 1), self-detection logic
- Effort: small

> The web UI (old item 6) and Scryfall bundle (old item 7) have moved to
> **V2+ moonshots** — still the long-term differentiators, just not part of 1.0.

---

## V2+ moonshots (not for the first release)

- **Browsable web UI** ⭐ — *Dashboard route shipped via `lumencore ui` (dependency-free, design-faithful, real data). Remaining routes below.* — local dashboard (`lumencore ui`):
  browse by project / scope / category / tag / recency, full-text search,
  inline edit / merge / supersede / delete, timeline view, tag-cloud / graph
  view (memories linked by shared tags or supersession), markdown rendering.
  Reads SQLite directly; no backend beyond file-watch + websocket for live
  updates. *The demo that wins HN.* (was V1 item 6)
- **Scryfall integration — the bundle** ⭐ — Scryfall connects via MCP and ships
  a built-in chatbot pane: query memory in natural language ("what did we decide
  about the gemini bump?"), show what was retrieved (transparency),
  accept / reject / edit the result, drop new memories from the conversation.
  The killer combo: **memory you can SEE and INTERROGATE**, not just queried
  silently. Needs a small `lumencore chat` HTTP endpoint. (was V1 item 7)
- **Bundled local embeddings** via `transformers.js` (~30 MB), optional flag
- **Optional Ollama / OpenAI embeddings** for power users
- **Temporal validity windows** — every fact carries a `valid_from`/`valid_to`,
  matches Graphiti's strongest feature
- **Memory graph layer** — typed edges (`supersedes`, `contradicts`, `refines`,
  `exemplifies`, `mentions`, `derived_from`), multi-hop retrieval
- **Obsidian projection** — every memory mirrored as a markdown file with
  frontmatter and `[[wikilinks]]`. LumenCore = agent brain, Obsidian = human
  face on top of the same data
- **Episodic replay / sleep consolidation** — periodically re-summarize old
  episodes, consolidate repeated patterns into semantic memories
- **Per-agent trust weighting** — Aria's casual obs and Orion's deliberated
  decisions carry different epistemic weight
- **Contradictions inbox** — surface detected conflicts to Frank for
  adjudication rather than silently picking one

---

## Suggested build order

1. [x] **Fix retrieval re-sort** (item 2) — smallest, biggest immediate win
2. [x] **Schema enrichment** (item 3) — foundation for everything else
3. [x] **`check_conflicts` tool** (item 4) — kills the "silent contradictions" problem
4. [x] **`capture_turn` tool** (item 5) — matches mem0 UX
5. [x] **Auto-installer** (item 1) — distribution unlock *(16 clients: JSON + TOML + YAML)*
6. [ ] **Self-registration fix** (item 6) — dogfood on our own repo
7. [x] **Web dashboard** (`lumencore ui`) — **all design routes shipped**: Dashboard,
   Project, Memory-edit, Graph, Global, Search, Timeline, Live, Settings, Cmd+K

Items 1–4 can ship as a `0.3.0` release. Items 5–7 are the `1.0` release.

> **Status 2026-05-24:** 0.3.0 feature-complete & tested. `lumencore install`
> auto-configures **16 clients** — JSON (Claude Code, Claude Desktop, Cursor,
> Cline, Roo, Windsurf, VS Code/Copilot, Zed, Gemini CLI, LM Studio, Junie,
> Amazon Q, Warp), TOML (Codex), YAML (Goose, Continue) — with detection,
> ask-each-run scope, merge-aware writes + `.bak` backups, idempotent.
> `lumencore ui` serves the Linear-style web app (from the Claude Design handoff)
> on 127.0.0.1:4317 as a dependency-free SPA reading real cross-project data:
> **Dashboard** (stats, recently written/recalled, projects), **Project view**
> (filter by category/importance/tag, sort, search), and **Memory detail** (view
> + edit title/content/tags/importance, delete, supersede — project memories;
> global is read-only), and a **live force-directed Graph** (`/graph`,
> dependency-free canvas: nodes = memories colored by category, edges = shared
> tags + supersession, new memories spring in, recalled memories pulse via the
> access-tracking — polls every 4s). Remaining: self-registration fix; stretch
> routes (Timeline / Cmd+K palette / Live agents).
>
> **Networked LumenCore — CORE (2026-05-24).** `lumencore serve-http` exposes an
> HTTP memory API (token auth; projects keyed by stable **name**) so remote agents
> can share one brain over LAN/Tailscale. This is part of core.
>
> **Hermes / OpenClaw integrations — pulled OUT of core (2026-05-24).** Per
> decision, the Hermes/OpenClaw-specific glue is **not** in the core installer.
> The Hermes memory-provider plugin is kept aside in
> `integrations/hermes-agent/lumencore/` (optional, not compiled). It was deployed
> to sentinel (`lumencore-http.service` on the Tailnet still active) but Hermes is
> currently reverted to `provider: holographic` — the plugin is installed-but-dormant.
> OpenClaw (`openclaw.json` `agents.defaults.mcpServers`) remains a design note only.

> **Shipped 2026-05-24 — per-project scope policy.** `.lumencore.json` at the
> repo root holds `{ name, allowGlobal }`. `lumencore init` writes it: interactive
> (TTY) asks "may this project contribute to GLOBAL memory?", or `--allow-global`
> / `--local-only` / `--yes` for scripts; default is **local-only** (privacy-safe).
> `MemoryService.create` refuses `scope:"global"` from a local-only project
> (install-wide `project-only` still wins over everything). The `name` field is
> the first step toward **stable project identity** — the same `.lumencore.json`
> will key memories by name (not path hash) for networked LAN sharing, closing
> the "repo moved/recloned → wrong identity" gap.

## Dashboard polish backlog (from live testing — 2026-05-24)

Ranked. Item 1 is the root cause of most of what looked broken.

1. **[✓ DONE 2026-05-24] Project names show as hashes everywhere.** Root cause:
   legacy memories had `project_path` empty. Shipped: (a) `lumencore backfill`
   reverse-maps each hash dir via `getProjectId(path)` over roots from
   `~/.claude.json` (+ extra roots as args) — **named 139/175 memories across 23
   projects**; (b) `MemoryService.backfillProjectPath()` runs on `serve` so each
   project self-heals on connect. Remaining 36 rows live in 11 dirs whose paths
   aren't in `~/.claude.json` — name them with `lumencore backfill <root> …`.
2. **[✓ DONE 2026-05-24] Graph hairball.** Overhauled: per-project **gravity
   wells** (nodes cluster by repo), **zoom** (scroll) + **pan** (drag background),
   **cluster labels** above each project, stronger capped repulsion + same-project
   vs cross-project spring lengths, drag-vs-click discrimination, "Reset view".
   Edges thin with zoom. (Eyeball when running — canvas paint isn't unit-tested.)
3. **[✓ DONE 2026-05-24] Dead sidebar links → real routes** (all live):
   - `/global` — browse global-scope memories (reuses project view; `/api/global`).
   - `/search` — live FTS across all projects + global (`/api/search?q=`); results
     show their project. (Cross-DB BM25 ranking is approximate — acceptable.)
   - `/timeline` — memories grouped by day (`/api/timeline`).
   - `/live` — streaming write/recall activity feed, polls 3s (`/api/activity`).
   - `/settings` — config (scope, data dir, paths, version) + theme/accent toggles
     with localStorage persistence (`/api/settings`).
   - **Cmd+K palette** — **[✓ DONE]** ⌘K (or click the top-bar search) opens a
     command palette: fuzzy "go to" nav, jump to any project, and live memory
     search (`/api/search`); ↑↓/↵/esc keyboard-driven. ⌘⇧T toggles theme.
   **All design routes are now built.**
4. **[✓ DONE 2026-05-24] UX guard:** unbuilt sidebar links (Global, Timeline,
   Live, Search, Settings) now render dimmed with a "soon" tag instead of being
   silently dead. They light up as #3 builds each route.

The web UI and Scryfall bundle have moved to **V2+ moonshots** — they remain the
long-term differentiators, just not part of the first 1.0.

---

## Out of scope (deliberate non-goals)

- Cloud sync / hosted offering (Zep/mem0 own that; LumenCore is local-first)
- Multi-tenant / org features (single-user tool)
- Required external services (no Postgres, no Qdrant, no Docker, no API keys
  on default install)
- Required Ollama install (would break our zero-install moat)
