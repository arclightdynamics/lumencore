import { Memory, MemoryCategory, MemoryScope, SearchOptions, ContextOptions } from '../types/index.js';
export declare class SearchService {
    private projectPath;
    private projectId;
    constructor(projectPath: string);
    private getDbForScope;
    private rowToMemory;
    search(options: SearchOptions): Memory[];
    /**
     * Combine a memory's BM25 relevance with soft importance and recency priors.
     * Relevance dominates; the priors only multiply it by a small factor so a
     * highly relevant memory can never be buried by a more important or newer but
     * less relevant one.
     */
    private finalScore;
    /**
     * Find existing memories that overlap with a prospective one — candidates the
     * host LLM should consider for supersession/merge. Same category is a strong
     * signal, so it's filtered when provided; already-superseded memories are
     * skipped. Detection never throws: if FTS is unavailable we return nothing
     * rather than block a write.
     */
    findConflicts(options: {
        title: string;
        content: string;
        category?: MemoryCategory;
        scope?: MemoryScope;
        excludeId?: string;
        limit?: number;
    }): Memory[];
    /**
     * Build an FTS MATCH expression for conflict detection. Unlike the normal
     * search escaper, this drops tokens shorter than 3 chars (stopword-ish noise
     * like "to"/"of") and dedups, so overlap is judged on the distinctive words.
     */
    private buildConflictMatch;
    getContext(options?: ContextOptions): string;
    private formatMemoryForContext;
    private escapeFtsQuery;
}
//# sourceMappingURL=search.d.ts.map