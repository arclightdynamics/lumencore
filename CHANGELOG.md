# Changelog

All notable changes to LumenCore will be documented in this file.

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
