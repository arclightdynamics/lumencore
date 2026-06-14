import { Memory, CreateMemoryInput, UpdateMemoryInput, MemoryScope } from '../types/index.js';
export declare class MemoryService {
    private projectPath;
    private projectId;
    constructor(projectPath: string);
    private getDbForScope;
    private rowToMemory;
    create(input: CreateMemoryInput): Memory;
    getById(id: string, scope?: MemoryScope): Memory | null;
    update(input: UpdateMemoryInput): Memory | null;
    delete(id: string): boolean;
    list(options?: {
        category?: string;
        scope?: MemoryScope;
        limit?: number;
    }): Memory[];
    getStats(): {
        project: number;
        global: number;
    };
    /** Mirror a memory's tags into the normalized tags / memory_tags tables. */
    private syncTags;
    /**
     * Record that one memory replaces another: sets superseded_by_id on the old
     * memory and supersedes_id on the new one. Works across project/global scope.
     */
    supersede(oldId: string, newId: string): boolean;
    /**
     * Set project_path on this project's rows that are missing it (legacy memories
     * written before the column existed). Self-heals project names in the dashboard
     * the next time the server starts. Returns the number of rows fixed.
     */
    backfillProjectPath(): number;
    /** Bump access_count / last_accessed for retrieved memories, grouped by scope. */
    recordAccess(accessed: Array<{
        id: string;
        scope: MemoryScope;
    }>): void;
}
//# sourceMappingURL=memory.d.ts.map