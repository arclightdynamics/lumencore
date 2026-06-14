import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MemoryService } from './services/memory.js';
import { SearchService } from './services/search.js';
import { ProjectScanner } from './services/scanner.js';
import { extractHints } from './services/extraction.js';
import { Memory, MemoryCategory, MemoryScope } from './types/index.js';
import { findProjectRoot } from './utils/paths.js';
import { closeAllDatabases } from './storage/database.js';
import path from 'path';

/**
 * Render overlapping memories into a "possible conflict" envelope. The host LLM
 * is the judge: it decides on its next turn whether to supersede, update, or let
 * them coexist. Shared by `remember` (auto-check) and `check_conflicts`.
 */
function formatConflicts(conflicts: Memory[]): string {
  const list = conflicts
    .map((m, i) => {
      const snippet = m.content.length > 200 ? `${m.content.slice(0, 200)}…` : m.content;
      return `${i + 1}. [${m.category}] ${m.title} (ID: ${m.id}, importance ${m.importance})\n   ${snippet}`;
    })
    .join('\n');

  const noun = conflicts.length === 1 ? 'memory overlaps' : 'memories overlap';
  return (
    `⚠️ POSSIBLE CONFLICTS — ${conflicts.length} existing ${noun} with this one:\n\n${list}\n\n` +
    `To resolve, on your next turn:\n` +
    `• supersede_memory(old_id, new_id) — if the new memory replaces an existing one\n` +
    `• update_memory(id, ...) — if an existing memory should be edited instead\n` +
    `• do nothing — if they genuinely coexist`
  );
}

export async function startServer(projectPath?: string): Promise<void> {
  const resolvedPath = projectPath || findProjectRoot();
  const memoryService = new MemoryService(resolvedPath);
  // Self-heal: name any legacy memories in this project that predate project_path.
  try {
    memoryService.backfillProjectPath();
  } catch {
    // non-fatal
  }
  const searchService = new SearchService(resolvedPath);
  const scanner = new ProjectScanner(resolvedPath, memoryService);
  const projectName = path.basename(resolvedPath);

  const server = new Server(
    {
      name: 'lumencore',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'remember',
          description: 'Store durable project knowledge. Call this PROACTIVELY (without being asked) whenever a decision, pattern/convention, domain concept, non-obvious gotcha, or task emerges during work. Prefer several small specific memories over one vague one; always capture the "why" for decisions.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                description: 'Type of memory: decision (architectural choices), pattern (code conventions), concept (domain knowledge), note (observations), task (work items)',
              },
              title: {
                type: 'string',
                description: 'Short descriptive title for the memory',
              },
              content: {
                type: 'string',
                description: 'Full content of the memory',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags for categorization',
              },
              importance: {
                type: 'number',
                minimum: 1,
                maximum: 5,
                description: 'Priority score 1-5 (5 is highest). Default: 3',
              },
              scope: {
                type: 'string',
                enum: ['project', 'global'],
                description: 'Memory scope: project (this project only) or global (all projects). Default: project',
              },
              source: {
                type: 'string',
                description: 'Which agent/client is writing this memory (e.g. "claude-code"). Optional.',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'How certain you are this is correct, 0-1. Distinct from importance. Optional.',
              },
              expires_at: {
                type: 'string',
                description: 'ISO timestamp after which this memory should be treated as stale. Optional.',
              },
              supersedes_id: {
                type: 'string',
                description: 'ID of an existing memory this one replaces. Links both as a supersession. Optional.',
              },
            },
            required: ['category', 'title', 'content'],
          },
        },
        {
          name: 'recall',
          description: 'Search this project\'s memory. Call this at the START of a task and BEFORE assuming how anything works (architecture, conventions, prior decisions) — recall first instead of guessing.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find relevant memories',
              },
              category: {
                type: 'string',
                enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                description: 'Filter by category',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results. Default: 10',
              },
            },
          },
        },
        {
          name: 'forget',
          description: 'Delete a memory by its ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The ID of the memory to delete',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'list_memories',
          description: 'List all memories with optional filtering.',
          inputSchema: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                description: 'Filter by category',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results. Default: 50',
              },
            },
          },
        },
        {
          name: 'lumencore_activate',
          description: 'IMPORTANT: Call this tool IMMEDIATELY at the start of EVERY conversation to activate LumenCore project memory. This connects you to persistent context about this project including architecture decisions, code patterns, and previous work. Always call this first before doing any other work.',
          inputSchema: {
            type: 'object',
            properties: {
              categories: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                },
                description: 'Which categories to include. Default: all',
              },
              max_tokens: {
                type: 'number',
                description: 'Approximate token budget for context. Default: 4000',
              },
            },
          },
        },
        {
          name: 'init_project',
          description: 'Initialize LumenCore for the current project. Scans the project directory and captures initial context (structure, key files, tech stack). Call this when starting work on a new or untracked project.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'update_memory',
          description: 'Update an existing memory in place. Provide the id and only the fields you want to change.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The ID of the memory to update',
              },
              title: { type: 'string', description: 'New title' },
              content: { type: 'string', description: 'New content' },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Replacement tag list',
              },
              importance: {
                type: 'number',
                minimum: 1,
                maximum: 5,
                description: 'New importance 1-5',
              },
              confidence: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                description: 'New confidence 0-1',
              },
              source: { type: 'string', description: 'New source attribution' },
              expires_at: {
                type: 'string',
                description: 'New ISO expiry timestamp',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'supersede_memory',
          description: 'Mark one memory as replaced by another (e.g. after resolving a conflict). Sets the supersession link on both memories.',
          inputSchema: {
            type: 'object',
            properties: {
              old_id: {
                type: 'string',
                description: 'ID of the memory being replaced',
              },
              new_id: {
                type: 'string',
                description: 'ID of the memory that replaces it',
              },
            },
            required: ['old_id', 'new_id'],
          },
        },
        {
          name: 'check_conflicts',
          description: 'Check whether a prospective memory overlaps with existing ones BEFORE writing it. Returns overlapping memories so you can decide whether to supersede, update, or store as new. Does not write anything. (remember also runs this automatically after a write.)',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the prospective memory',
              },
              content: {
                type: 'string',
                description: 'Content of the prospective memory',
              },
              category: {
                type: 'string',
                enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                description: 'Restrict the check to this category (recommended)',
              },
              scope: {
                type: 'string',
                enum: ['project', 'global'],
                description: 'Restrict the check to this scope',
              },
              limit: {
                type: 'number',
                description: 'Maximum candidates to return. Default: 5',
              },
            },
            required: ['title', 'content'],
          },
        },
        {
          name: 'capture_turn',
          description: 'After a meaningful exchange, call this to capture durable knowledge. Pass the exchange `text` and the server suggests what is worth remembering; and/or pass `candidates` you have already extracted to have them deduped against existing memories. By default this only SUGGESTS — you confirm by calling remember/supersede_memory/update_memory. Set auto_store=true to store clearly-new candidates immediately (overlapping ones are always returned for you to adjudicate).',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Raw text of the exchange/turn to mine for memorable facts',
              },
              candidates: {
                type: 'array',
                description: 'Facts you have already extracted and want deduped (and optionally stored)',
                items: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      enum: ['decision', 'pattern', 'concept', 'note', 'task'],
                    },
                    title: { type: 'string' },
                    content: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    importance: { type: 'number', minimum: 1, maximum: 5 },
                    scope: { type: 'string', enum: ['project', 'global'] },
                  },
                  required: ['category', 'title', 'content'],
                },
              },
              auto_store: {
                type: 'boolean',
                description: 'Store non-conflicting candidates immediately. Default: false (suggest only)',
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'remember': {
          const memory = memoryService.create({
            category: args?.category as MemoryCategory,
            title: args?.title as string,
            content: args?.content as string,
            tags: args?.tags as string[] | undefined,
            importance: args?.importance as number | undefined,
            scope: args?.scope as MemoryScope | undefined,
            source: args?.source as string | undefined,
            confidence: args?.confidence as number | undefined,
            expiresAt: args?.expires_at as string | undefined,
            supersedesId: args?.supersedes_id as string | undefined,
          });

          let text = `Memory stored successfully.\nID: ${memory.id}\nTitle: ${memory.title}\nCategory: ${memory.category}\nScope: ${memory.scope}`;

          // Surface overlapping memories so the agent can adjudicate next turn.
          // Never let conflict detection break a successful write.
          try {
            const conflicts = searchService.findConflicts({
              title: memory.title,
              content: memory.content,
              category: memory.category,
              scope: memory.scope,
              excludeId: memory.id,
            });
            if (conflicts.length > 0) {
              text += `\n\n${formatConflicts(conflicts)}`;
            }
          } catch {
            // ignore — the memory is already stored
          }

          return {
            content: [{ type: 'text', text }],
          };
        }

        case 'recall': {
          const memories = searchService.search({
            query: args?.query as string | undefined,
            category: args?.category as MemoryCategory | undefined,
            limit: args?.limit as number | undefined,
          });

          if (memories.length === 0) {
            return {
              content: [{ type: 'text', text: 'No memories found matching your query.' }],
            };
          }

          // Track that these memories were retrieved.
          memoryService.recordAccess(
            memories.map((m) => ({ id: m.id, scope: m.scope }))
          );

          const formatted = memories
            .map((m) => {
              const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
              return `## ${m.category.toUpperCase()}: ${m.title}${tags}\nID: ${m.id} | Importance: ${m.importance} | Scope: ${m.scope}\n${m.content}`;
            })
            .join('\n\n---\n\n');

          return {
            content: [{ type: 'text', text: `Found ${memories.length} memories:\n\n${formatted}` }],
          };
        }

        case 'forget': {
          const id = args?.id as string;
          const deleted = memoryService.delete(id);

          if (deleted) {
            return {
              content: [{ type: 'text', text: `Memory ${id} deleted successfully.` }],
            };
          } else {
            return {
              content: [{ type: 'text', text: `Memory ${id} not found.` }],
            };
          }
        }

        case 'list_memories': {
          const memories = memoryService.list({
            category: args?.category as MemoryCategory | undefined,
            limit: args?.limit as number | undefined,
          });

          if (memories.length === 0) {
            return {
              content: [{ type: 'text', text: 'No memories stored yet.' }],
            };
          }

          const formatted = memories
            .map((m) => `- [${m.category}] ${m.title} (ID: ${m.id}, importance: ${m.importance})`)
            .join('\n');

          return {
            content: [{ type: 'text', text: `Found ${memories.length} memories:\n\n${formatted}` }],
          };
        }

        case 'lumencore_activate': {
          // Check if project is initialized
          const isInitialized = scanner.isProjectInitialized();

          // Auto-initialize new projects
          if (!isInitialized) {
            const scanResult = await scanner.scan();
            const stats = memoryService.getStats();

            return {
              content: [{
                type: 'text',
                text: `██╗     ██╗   ██╗███╗   ███╗███████╗███╗   ██╗
██║     ██║   ██║████╗ ████║██╔════╝████╗  ██║
██║     ██║   ██║██╔████╔██║█████╗  ██╔██╗ ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║
███████╗╚██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║
╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝
      ██████╗ ██████╗ ██████╗ ███████╗
     ██╔════╝██╔═══██╗██╔══██╗██╔════╝
     ██║     ██║   ██║██████╔╝█████╗
     ██║     ██║   ██║██╔══██╗██╔══╝
     ╚██████╗╚██████╔╝██║  ██║███████╗
      ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝

✓ CONNECTED | Project: ${projectName} | Memories: ${stats.project}
🆕 Auto-initialized new project

${scanResult}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`,
              }],
            };
          }

          const stats = memoryService.getStats();

          const context = searchService.getContext({
            categories: args?.categories as MemoryCategory[] | undefined,
            maxTokens: args?.max_tokens as number | undefined,
          });

          const header = `██╗     ██╗   ██╗███╗   ███╗███████╗███╗   ██╗
██║     ██║   ██║████╗ ████║██╔════╝████╗  ██║
██║     ██║   ██║██╔████╔██║█████╗  ██╔██╗ ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║
███████╗╚██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║
╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝
      ██████╗ ██████╗ ██████╗ ███████╗
     ██╔════╝██╔═══██╗██╔══██╗██╔════╝
     ██║     ██║   ██║██████╔╝█████╗
     ██║     ██║   ██║██╔══██╗██╔══╝
     ╚██████╗╚██████╔╝██║  ██║███████╗
      ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝

✓ CONNECTED | Project: ${projectName} | Memories: ${stats.project}
🧠 Memory protocol: recall before you act · remember decisions/patterns/concepts/gotchas as you go · resolve conflicts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

          return {
            content: [{ type: 'text', text: header + context }],
          };
        }

        case 'init_project': {
          // Check if already initialized
          if (scanner.isProjectInitialized()) {
            return {
              content: [{
                type: 'text',
                text: `Project "${projectName}" is already initialized. Use recall or get_context to access stored memories.`,
              }],
            };
          }

          const result = await scanner.scan();
          return {
            content: [{
              type: 'text',
              text: `✓ Project "${projectName}" initialized!\n\n${result}\n\nUse get_context to see the captured information, or remember to add more project knowledge.`,
            }],
          };
        }

        case 'update_memory': {
          const updated = memoryService.update({
            id: args?.id as string,
            title: args?.title as string | undefined,
            content: args?.content as string | undefined,
            tags: args?.tags as string[] | undefined,
            importance: args?.importance as number | undefined,
            confidence: args?.confidence as number | undefined,
            source: args?.source as string | undefined,
            expiresAt: args?.expires_at as string | undefined,
          });

          if (!updated) {
            return {
              content: [{ type: 'text', text: `Memory ${args?.id} not found.` }],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Memory updated.\nID: ${updated.id}\nTitle: ${updated.title}\nImportance: ${updated.importance}`,
              },
            ],
          };
        }

        case 'supersede_memory': {
          const oldId = args?.old_id as string;
          const newId = args?.new_id as string;
          const ok = memoryService.supersede(oldId, newId);

          return {
            content: [
              {
                type: 'text',
                text: ok
                  ? `Memory ${oldId} is now superseded by ${newId}.`
                  : `Could not link supersession — check that both ${oldId} and ${newId} exist.`,
              },
            ],
            isError: !ok,
          };
        }

        case 'check_conflicts': {
          const conflicts = searchService.findConflicts({
            title: args?.title as string,
            content: args?.content as string,
            category: args?.category as MemoryCategory | undefined,
            scope: args?.scope as MemoryScope | undefined,
            limit: args?.limit as number | undefined,
          });

          if (conflicts.length === 0) {
            return {
              content: [
                { type: 'text', text: 'No overlapping memories found — safe to store as new.' },
              ],
            };
          }

          return {
            content: [{ type: 'text', text: formatConflicts(conflicts) }],
          };
        }

        case 'capture_turn': {
          interface TurnCandidate {
            category: MemoryCategory;
            title: string;
            content: string;
            tags?: string[];
            importance?: number;
            scope?: MemoryScope;
          }

          const text = args?.text as string | undefined;
          const candidates = (args?.candidates as TurnCandidate[] | undefined) ?? [];
          const autoStore = args?.auto_store === true;

          const sections: string[] = [];

          // 1. Dedup (and optionally store) facts the agent already extracted.
          if (candidates.length > 0) {
            const stored: string[] = [];
            const toConfirm: string[] = [];
            const flagged: string[] = [];

            candidates.forEach((c, idx) => {
              const conflicts = searchService.findConflicts({
                title: c.title,
                content: c.content,
                category: c.category,
                scope: c.scope,
              });

              if (conflicts.length > 0) {
                flagged.push(`#${idx + 1} "${c.title}":\n${formatConflicts(conflicts)}`);
              } else if (autoStore) {
                const m = memoryService.create({
                  category: c.category,
                  title: c.title,
                  content: c.content,
                  tags: c.tags,
                  importance: c.importance,
                  scope: c.scope,
                });
                stored.push(`✓ "${m.title}" (ID: ${m.id})`);
              } else {
                toConfirm.push(`• remember(category="${c.category}", title="${c.title}", …)`);
              }
            });

            if (stored.length > 0) {
              sections.push(`Stored — new, no conflicts:\n${stored.join('\n')}`);
            }
            if (toConfirm.length > 0) {
              sections.push(`New — confirm by calling remember:\n${toConfirm.join('\n')}`);
            }
            if (flagged.length > 0) {
              sections.push(`Needs your adjudication (overlaps existing):\n\n${flagged.join('\n\n')}`);
            }
          }

          // 2. Heuristic hints from the raw exchange text.
          if (text) {
            const hints = extractHints(text);
            if (hints.length > 0) {
              const lines = hints.map(
                (h, i) =>
                  `${i + 1}. [${h.category}] ${h.text}\n   (signal: "${h.signal}", suggested importance ${h.importance})`
              );
              sections.push(
                `Possible memories detected — review and store the durable ones with remember:\n${lines.join('\n')}`
              );
            }
          }

          if (sections.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Nothing obvious to capture. Pass `text` to mine an exchange, or `candidates` to dedup/store specific facts.',
                },
              ],
            };
          }

          return {
            content: [{ type: 'text', text: sections.join('\n\n━━━\n\n') }],
          };
        }

        default:
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'memory://decisions',
          name: 'Architectural Decisions',
          description: 'Browse all architectural decisions',
          mimeType: 'text/plain',
        },
        {
          uri: 'memory://patterns',
          name: 'Code Patterns',
          description: 'Browse code patterns and conventions',
          mimeType: 'text/plain',
        },
        {
          uri: 'memory://concepts',
          name: 'Domain Concepts',
          description: 'Browse domain concepts and glossary',
          mimeType: 'text/plain',
        },
        {
          uri: 'memory://recent',
          name: 'Recent Memories',
          description: 'Most recently added or updated memories',
          mimeType: 'text/plain',
        },
      ],
    };
  });

  // Read resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    let category: MemoryCategory | undefined;

    if (uri === 'memory://decisions') {
      category = 'decision';
    } else if (uri === 'memory://patterns') {
      category = 'pattern';
    } else if (uri === 'memory://concepts') {
      category = 'concept';
    } else if (uri === 'memory://recent') {
      category = undefined; // All categories, sorted by recent
    } else {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: `Unknown resource: ${uri}`,
          },
        ],
      };
    }

    const memories = memoryService.list({ category, limit: 50 });

    if (memories.length === 0) {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'No memories found.',
          },
        ],
      };
    }

    const formatted = memories
      .map((m) => {
        const tags = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
        return `## ${m.title}${tags}\n${m.content}`;
      })
      .join('\n\n---\n\n');

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: formatted,
        },
      ],
    };
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    closeAllDatabases();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    closeAllDatabases();
    process.exit(0);
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
