interface Located {
    scope: 'project' | 'global';
    dbPath: string;
    hash: string | null;
    projectPath: string | null;
}
/** Find which DB (project or global) holds a memory id. */
export declare function locate(id: string): Located | null;
export interface ProjectView {
    project: {
        id: string;
        name: string;
        path: string;
        count: number;
        recalls: number;
        lastWriteMins: number | null;
    };
    memories: Array<{
        id: string;
        title: string;
        body: string;
        category: string;
        importance: number;
        tags: string[];
        ageMins: number;
        accessCount: number;
        superseded: boolean;
    }>;
    tags: string[];
}
export declare function buildProject(hash: string): ProjectView | null;
/** Global-scope memories, shaped like a project view so the UI can reuse it. */
export declare function buildGlobal(): ProjectView;
export interface SearchResponse {
    query: string;
    count: number;
    results: Array<{
        id: string;
        title: string;
        body: string;
        category: string;
        importance: number;
        project: string;
        tags: string[];
        ageMins: number;
        scope: 'project' | 'global';
    }>;
}
/** Full-text search across every project DB + global, ranked by BM25 relevance. */
export declare function searchAll(query: string, limit?: number): SearchResponse;
export declare function buildSettings(): {
    config: import("../index.js").LumenCoreConfig;
    version: string;
    configPath: string;
    dataDir: string;
};
export interface TimelineEntry {
    id: string;
    title: string;
    category: string;
    importance: number;
    project: string;
    updatedAt: string;
}
export declare function buildTimeline(limit?: number): {
    entries: TimelineEntry[];
};
export interface ActivityEvent {
    id: string;
    title: string;
    category: string;
    project: string;
    kind: 'write' | 'recall';
    ageMins: number;
}
export declare function buildActivity(limit?: number): {
    events: ActivityEvent[];
};
export interface MemoryDetail {
    id: string;
    title: string;
    body: string;
    category: string;
    importance: number;
    tags: string[];
    source: string | null;
    confidence: number | null;
    accessCount: number;
    createdAt: string;
    updatedAt: string;
    lastAccessed: string | null;
    expiresAt: string | null;
    supersedesId: string | null;
    supersededById: string | null;
    scope: 'project' | 'global';
    projectId: string | null;
    projectName: string;
    projectPath: string | null;
    editable: boolean;
}
export declare function getMemoryDetail(id: string): MemoryDetail | null;
export interface OpResult {
    ok: boolean;
    error?: string;
}
export declare function updateMemory(id: string, fields: {
    title?: string;
    content?: string;
    tags?: string[];
    importance?: number;
}): OpResult;
export declare function deleteMemory(id: string): OpResult;
export declare function supersedeMemory(oldId: string, newId: string): OpResult;
export {};
//# sourceMappingURL=detail.d.ts.map