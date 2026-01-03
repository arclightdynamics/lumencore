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
}
//# sourceMappingURL=memory.d.ts.map