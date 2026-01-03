export type MemoryScope = 'project' | 'global';
export type MemoryCategory = 'decision' | 'pattern' | 'concept' | 'note' | 'task';
export interface Memory {
    id: string;
    projectId: string;
    scope: MemoryScope;
    category: MemoryCategory;
    title: string;
    content: string;
    tags: string[];
    importance: number;
    createdAt: string;
    updatedAt: string;
}
export interface CreateMemoryInput {
    category: MemoryCategory;
    title: string;
    content: string;
    tags?: string[];
    importance?: number;
    scope?: MemoryScope;
}
export interface UpdateMemoryInput {
    id: string;
    title?: string;
    content?: string;
    tags?: string[];
    importance?: number;
}
export interface SearchOptions {
    query?: string;
    category?: MemoryCategory;
    scope?: MemoryScope;
    limit?: number;
}
export interface ContextOptions {
    categories?: MemoryCategory[];
    maxTokens?: number;
}
export type ConfigMemoryScope = 'project-only' | 'project-and-global';
export interface LumenCoreConfig {
    memoryScope: ConfigMemoryScope;
    dataDir: string;
    defaultImportance: number;
    maxContextTokens: number;
}
export interface ConfigFile {
    version: number;
    config: LumenCoreConfig;
}
//# sourceMappingURL=index.d.ts.map