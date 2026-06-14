# Changelog

All notable changes to LumenCore will be documented in this file.

## [1.0.0] - 2026-05-24

### Added
- **`lumencore install`** — auto-detects ~15 MCP clients and registers LumenCore
  (JSON/TOML/YAML), merge-aware with backups. **WSL-aware**: bridges Windows-side
  clients to the WSL brain via `wsl.exe`. First-run multi-select; `--list`, `--yes`,
  `--dry-run`, `--global/--project`, `--client`, `--no-windows`.
- **`lumencore ui`** — local web dashboard (`127.0.0.1:4317`): dashboard, project,
  memory view/edit, **live force-directed graph**, global, search, timeline, live
  activity, settings, and a ⌘K command palette.
- **`lumencore serve-http`** — networked memory API (token auth; projects by stable
  name) to share one brain across machines over LAN/Tailscale.
- **`lumencore backfill`** — names legacy memories by reverse-mapping project hashes.
- New MCP tools: `update_memory`, `supersede_memory`, `check_conflicts`, `capture_turn`.
- Schema: `source`, `confidence`, supersession, access tracking, `expires_at`,
  `project_path`, normalized tag tables (+ automatic migration of existing DBs).
- Per-project policy file `.lumencore.json` (`name`, `allowGlobal`) written by `init`.
- **Multi-harness instructions**: `init` writes the memory protocol to `AGENTS.md` +
  `CLAUDE.md` by default (AGENTS.md covers Codex, Cursor, Jules, Zed, …), with
  `--all-agents` / `--instructions` for Gemini, Copilot, Cursor-rules, Windsurf, Cline.
  Merge-aware (marked block), idempotent, preserves user content.
- **Animated installer**: `lumencore install` shows an animated, ashfall-style TUI
  (cyan "lumen" wave background, the LumenCore wordmark with a moving sheen, an
  in-frame client selector, animated writing). Falls back to plain output on
  non-TTY / `--no-anim` / any error.
- Stronger memory protocol in the CLAUDE.md template + tool descriptions so agents
  recall and remember proactively.

### Changed
- Retrieval now ranks by BM25 relevance with importance/recency as **soft priors**
  (previously a hard re-sort that discarded relevance); BM25 column weights tuned.
- README fully rewritten.

## [0.2.0] - 2025-01-05

### Added
- `lumencore version` command (also `--version`, `-v`)
- `lumencore export` command for backup and migration
  - `--global` flag to export global memories only
  - `--all` flag to export both project and global memories
  - `-o` / `--output` to specify custom output file
- Demo GIF scripts using vhs

### Changed
- Updated README with new commands and export options

## [0.1.0] - 2025-01-04

### Added
- Initial release
- MCP server for Claude Code integration
- `lumencore init` - Initialize project with CLAUDE.md and auto-allow tools
- `lumencore setup` - Global configuration wizard
- `lumencore serve` - Start MCP server
- `lumencore status` - Show configuration and memory stats
- `lumencore reset` - Clear all data
- `lumencore_activate` tool - Auto-activates at session start, scans new projects
- `remember` tool - Store project knowledge
- `recall` tool - Full-text search memories
- `list_memories` tool - Browse all memories
- `forget` tool - Delete memories
- SQLite storage with FTS5 full-text search
- Project-scoped memory isolation
- Auto-scan of project structure and tech stack
