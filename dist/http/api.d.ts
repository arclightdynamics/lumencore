import http from 'http';
export interface ApiOptions {
    host?: string;
    port?: number;
    token?: string;
}
/**
 * Networked memory API for remote agents (Hermes, OpenClaw, …) over a LAN /
 * Tailscale. Projects are addressed by a stable **name** (not a path hash), so
 * the same logical project resolves identically from any machine.
 *
 *   GET  /v1/health
 *   GET  /v1/recall?project=<name>&q=<query>&limit=&category=&scope=
 *   POST /v1/remember   { project, category, title, content, tags?, importance?, scope? }
 *   GET  /v1/list?project=<name>&limit=&category=
 *
 * All routes except /v1/health require `Authorization: Bearer <token>` when a
 * token is configured.
 */
export declare function createApiServer(token?: string): http.Server;
export declare function startHttpApi(opts?: ApiOptions): Promise<http.Server>;
export declare function shutdownHttpApi(server: http.Server): void;
//# sourceMappingURL=api.d.ts.map