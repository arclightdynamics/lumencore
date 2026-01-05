# LumenCore

**Persistent project memory for AI agents.**

LumenCore is a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that gives AI coding assistants like Claude Code persistent memory across sessions. It solves the problem of context loss when conversations reset, allowing agents to retain architectural decisions, code patterns, domain knowledge, and project history.

## The Problem

AI coding assistants lose all context when a session ends. Every new conversation starts from scratch, requiring you to re-explain:
- Architectural decisions and their rationale
- Code conventions and patterns used in the project
- Domain-specific concepts and terminology
- Previous work and ongoing tasks

## The Solution

LumenCore provides a local memory layer that AI agents can read from and write to. When Claude Code connects to LumenCore, it can:
- **Remember** important decisions, patterns, and concepts
- **Recall** relevant context using full-text search
- **Activate** automatically at session start to load project knowledge

All data stays local on your machine in a SQLite database.

## Installation

```bash
npm install -g lumencore
```

## Quick Start

```bash
# 1. Add LumenCore to Claude Code (once per machine)
claude mcp add lumencore -- lumencore serve

# 2. Initialize in your project
cd /your/project
lumencore init

# 3. Start Claude - LumenCore activates automatically
claude
```

## What `lumencore init` Does

The `init` command sets up everything for seamless integration:

1. **Creates/updates CLAUDE.md** - Instructs Claude to activate LumenCore at conversation start
2. **Configures permissions** - Auto-allows all LumenCore tools (no permission prompts)
3. **Scans your project** - Captures structure, tech stack, and key files

## CLI Commands

```bash
lumencore init      # Initialize LumenCore in current project
lumencore setup     # Run the global setup wizard
lumencore serve     # Start the MCP server (used by Claude Code)
lumencore status    # Show configuration and memory stats
lumencore export    # Export memories to JSON for backup/migration
lumencore version   # Show installed version
lumencore reset     # Clear all data (use --force to confirm)
lumencore help      # Show help
```

### Export Options

```bash
lumencore export             # Export current project memories
lumencore export --global    # Export global memories only
lumencore export --all       # Export all memories
lumencore export -o backup.json  # Custom output file
```

## Tools Available to Claude

Once connected, Claude Code can use these tools:

### `lumencore_activate`
Called automatically at session start. Loads project context and scans new projects.

### `remember`
Store important project knowledge.

```
Parameters:
- category: "decision" | "pattern" | "concept" | "note" | "task"
- title: Short description
- content: Full details
- tags: Optional categorization tags
- importance: 1-5 (default 3)
```

**Example prompt:**
> "Remember that we decided to use Redux Toolkit for state management because it reduces boilerplate."

### `recall`
Search stored memories using full-text search.

```
Parameters:
- query: Search terms
- category: Filter by type (optional)
- limit: Max results (default 10)
```

**Example prompt:**
> "Recall any decisions about state management."

### `list_memories`
Browse all stored memories for the current project.

### `forget`
Delete a memory by ID.

## Memory Categories

| Category | Use For |
|----------|---------|
| `decision` | Architectural choices and their rationale |
| `pattern` | Code conventions, naming patterns, common approaches |
| `concept` | Domain knowledge, business logic, terminology |
| `note` | General observations and learnings |
| `task` | Work items, TODOs, progress tracking |

## How It Works

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   Claude Code   │ ◄──────────────────► │   LumenCore     │
└─────────────────┘                       │   MCP Server    │
                                          ├─────────────────┤
                                          │  Memory Service │
                                          ├─────────────────┤
                                          │  SQLite + FTS5  │
                                          └─────────────────┘
```

1. Claude Code connects to LumenCore via the MCP protocol
2. At session start, Claude calls `lumencore_activate` to load project context
3. During the session, Claude uses `remember` to store important discoveries
4. Claude uses `recall` to search for relevant knowledge when needed
5. Memories persist in SQLite with full-text search indexing

## Configuration

Run `lumencore setup` to configure:

1. **Memory scope**: Project-only (isolated) or project + global (shared knowledge)
2. **Data directory**: Where to store SQLite databases

Config is stored at:
- Linux: `~/.config/lumencore/config.json`
- macOS: `~/Library/Preferences/lumencore/config.json`
- Windows: `%APPDATA%\lumencore\config.json`

## Data Storage

Memories are stored in SQLite databases:
- **Project memories**: `{dataDir}/projects/{project-hash}/memories.db`
- **Global memories**: `{dataDir}/global/memories.db`

Each project is identified by a hash of its root path.

## Privacy

All data is stored locally on your machine. LumenCore does not send any data to external servers. The MCP server only communicates with the local Claude Code process via stdio.

## Requirements

- Node.js 18 or higher
- Claude Code with MCP support

## License

MIT
