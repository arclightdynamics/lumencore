import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
import { MemoryService } from './services/memory.js';
import { SearchService } from './services/search.js';
import { ProjectScanner } from './services/scanner.js';
import { findProjectRoot } from './utils/paths.js';
import { closeAllDatabases } from './storage/database.js';
import path from 'path';
export async function startServer(projectPath) {
    const resolvedPath = projectPath || findProjectRoot();
    const memoryService = new MemoryService(resolvedPath);
    const searchService = new SearchService(resolvedPath);
    const scanner = new ProjectScanner(resolvedPath, memoryService);
    const projectName = path.basename(resolvedPath);
    const server = new Server({
        name: 'lumencore',
        version: '0.1.0',
    }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: 'remember',
                    description: 'Store a new memory or update existing. Use this to save important project knowledge.',
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
                        },
                        required: ['category', 'title', 'content'],
                    },
                },
                {
                    name: 'recall',
                    description: 'Search and retrieve memories by query or filters.',
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
                    name: 'get_context',
                    description: 'Get a summary of project knowledge for session bootstrapping. Call this at the start of a session to load relevant context.',
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
                        category: args?.category,
                        title: args?.title,
                        content: args?.content,
                        tags: args?.tags,
                        importance: args?.importance,
                        scope: args?.scope,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Memory stored successfully.\nID: ${memory.id}\nTitle: ${memory.title}\nCategory: ${memory.category}\nScope: ${memory.scope}`,
                            },
                        ],
                    };
                }
                case 'recall': {
                    const memories = searchService.search({
                        query: args?.query,
                        category: args?.category,
                        limit: args?.limit,
                    });
                    if (memories.length === 0) {
                        return {
                            content: [{ type: 'text', text: 'No memories found matching your query.' }],
                        };
                    }
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
                    const id = args?.id;
                    const deleted = memoryService.delete(id);
                    if (deleted) {
                        return {
                            content: [{ type: 'text', text: `Memory ${id} deleted successfully.` }],
                        };
                    }
                    else {
                        return {
                            content: [{ type: 'text', text: `Memory ${id} not found.` }],
                        };
                    }
                }
                case 'list_memories': {
                    const memories = memoryService.list({
                        category: args?.category,
                        limit: args?.limit,
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
                case 'get_context': {
                    // Check if project is initialized
                    const isInitialized = scanner.isProjectInitialized();
                    const stats = memoryService.getStats();
                    if (!isInitialized) {
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

🆕 NEW PROJECT DETECTED: ${projectName}

This project hasn't been initialized with LumenCore yet.
I can scan the project to capture:
• Directory structure
• Key configuration files
• Technology stack

Would you like me to initialize? If yes, call init_project.`,
                                }],
                        };
                    }
                    const context = searchService.getContext({
                        categories: args?.categories,
                        maxTokens: args?.max_tokens,
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
                default:
                    return {
                        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                        isError: true,
                    };
            }
        }
        catch (error) {
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
        let category;
        if (uri === 'memory://decisions') {
            category = 'decision';
        }
        else if (uri === 'memory://patterns') {
            category = 'pattern';
        }
        else if (uri === 'memory://concepts') {
            category = 'concept';
        }
        else if (uri === 'memory://recent') {
            category = undefined; // All categories, sorted by recent
        }
        else {
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
//# sourceMappingURL=server.js.map