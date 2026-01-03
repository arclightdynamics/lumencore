import { Memory, SearchOptions, ContextOptions } from '../types/index.js';
export declare class SearchService {
    private projectPath;
    private projectId;
    constructor(projectPath: string);
    private getDbForScope;
    private rowToMemory;
    search(options: SearchOptions): Memory[];
    getContext(options?: ContextOptions): string;
    private formatMemoryForContext;
    private escapeFtsQuery;
}
//# sourceMappingURL=search.d.ts.map