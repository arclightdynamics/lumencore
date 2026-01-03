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
- **Bootstrap** new sessions with stored project knowledge

All data stays local on your machine in a SQLite database.

## Installation

```bash
# Install globally
npm install -g lumencore

# Run the setup wizard
lumencore setup
```

## Setup

The setup wizard will ask you two questions:

1. **Memory scope**: Choose between project-only memory (isolated per project) or project + global memory (shared knowledge across all projects).

2. **Data directory**: Where to store the SQLite databases. Defaults to:
   - Linux: `~/.local/share/lumencore`
   - macOS: `~/Library/Application Support/lumencore`
   - Windows: `%LOCALAPPDATA%\lumencore`

## Connecting to Claude Code

After setup, add LumenCore to Claude Code:

```bash
claude mcp add lumencore -- npx lumencore serve
```

Or manually add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "lumencore": {
      "command": "npx",
      "args": ["lumencore", "serve"]
    }
  }
}
```

## Usage

Once connected, Claude Code can use these tools:

### `remember`
Store important project knowledge.

```
Use remember to store:
- category: "decision" | "pattern" | "concept" | "note" | "task"
- title: Short description
- content: Full details
- tags: Optional categorization tags
- importance: 1-5 (default 3)
- scope: "project" | "global" (default "project")
```

**Example prompt:**
> "Remember that we decided to use Redux Toolkit for state management because it reduces boilerplate and includes RTK Query for API calls."

### `recall`
Search stored memories.

```
Use recall to search:
- query: Search terms
- category: Filter by type
- limit: Max results (default 10)
```

**Example prompt:**
> "Recall any decisions we made about state management."

### `get_context`
Load project knowledge at session start.

```
Use get_context to bootstrap:
- categories: Which types to include
- max_tokens: Token budget (default 4000)
```

**Example prompt:**
> "Get context for this project so you understand our patterns and decisions."

### `list_memories`
Browse all stored memories.

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

## CLI Commands

```bash
lumencore setup     # Run the setup wizard
lumencore serve     # Start the MCP server
lumencore status    # Show configuration and memory stats
lumencore reset     # Clear all data (use --force to confirm)
lumencore help      # Show help
```

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
2. The agent calls `get_context` to load relevant project knowledge
3. During the session, the agent uses `remember` to store new insights
4. Memories are persisted in SQLite with full-text search indexing
5. Future sessions can `recall` this knowledge

## Configuration

Config is stored at:
- Linux: `~/.config/lumencore/config.json`
- macOS: `~/Library/Preferences/lumencore/config.json`
- Windows: `%APPDATA%\lumencore\config.json`

```json
{
  "memoryScope": "project-only",
  "dataDir": "~/.local/share/lumencore",
  "defaultImportance": 3,
  "maxContextTokens": 4000
}
```

## Data Storage

Memories are stored in SQLite databases:
- **Project memories**: `{dataDir}/projects/{project-hash}/memories.db`
- **Global memories**: `{dataDir}/global/memories.db`

Each project is identified by a hash of its root path, so memories stay associated with the correct project even if you open it from different locations.

## Privacy

All data is stored locally on your machine. LumenCore does not send any data to external servers. The MCP server only communicates with the local Claude Code process via stdio.

## Requirements

- Node.js 18 or higher
- Claude Code with MCP support

## License

MIT
