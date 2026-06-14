/** A memory shaped for the dashboard UI. */
export interface UiMemory {
    id: string;
    title: string;
    body: string;
    category: string;
    importance: number;
    project: string;
    tags: string[];
    ageMins: number;
    accessCount: number;
}
export interface UiProject {
    id: string;
    name: string;
    path: string;
    count: number;
    recalls: number;
    lastWriteMins: number | null;
}
export interface DashboardPayload {
    stats: {
        memories: number;
        projects: number;
        globalCount: number;
        lastWriteMins: number | null;
        lastWrite: {
            id: string;
            project: string;
        } | null;
        lastRecallMins: number | null;
        lastRecall: {
            project: string;
        } | null;
        writtenLastHour: number;
    };
    recentWritten: UiMemory[];
    recentRecalled: UiMemory[];
    projects: UiProject[];
    generatedAt: string;
}
/**
 * Aggregate every project DB (plus the global DB) into a single dashboard
 * payload. Uses getDatabase() so each DB is brought to the current schema,
 * guaranteeing the project_path / last_accessed / access_count columns exist.
 */
export declare function buildDashboard(): DashboardPayload;
//# sourceMappingURL=aggregate.d.ts.map