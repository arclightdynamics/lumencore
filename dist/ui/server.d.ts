import http from 'http';
export declare function createUiServer(): http.Server;
export interface UiServerOptions {
    port?: number;
    host?: string;
}
/**
 * Start the dashboard server. Loopback-only by default (127.0.0.1) — the
 * dashboard reads local SQLite and is never meant to be exposed.
 */
export declare function startUiServer(opts?: UiServerOptions): Promise<http.Server>;
export declare function shutdownUiServer(server: http.Server): void;
//# sourceMappingURL=server.d.ts.map