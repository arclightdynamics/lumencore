export interface GraphNode {
    id: string;
    title: string;
    category: string;
    importance: number;
    accessCount: number;
    project: string;
    ageMins: number;
    superseded: boolean;
}
export interface GraphEdge {
    a: string;
    b: string;
    type: 'tag' | 'supersede';
}
export interface GraphPayload {
    nodes: GraphNode[];
    edges: GraphEdge[];
    projects: string[];
    generatedAt: string;
}
export declare function buildGraph(opts?: {
    limit?: number;
    project?: string;
}): GraphPayload;
//# sourceMappingURL=graph.d.ts.map