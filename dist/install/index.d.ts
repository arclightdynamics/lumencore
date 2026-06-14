import { InstallContext, McpClient, ServerEntry } from './types.js';
export { CLIENTS, MANUAL_CLIENTS, SERVER_NAME } from './clients.js';
export { writeServer } from './writer.js';
export type { InstallContext, McpClient, ManualClient, ScopeTarget, ServerEntry } from './types.js';
export declare function buildContext(projectDir: string): InstallContext;
export declare function isInstalled(client: {
    detectPaths: (c: InstallContext) => string[];
}, ctx: InstallContext): boolean;
export declare function detectClients(ctx: InstallContext): McpClient[];
export declare function detectManualClients(ctx: InstallContext): import("./types.js").ManualClient[];
/** Is an executable named `name` resolvable on PATH? */
export declare function onPath(name: string): boolean;
/**
 * How clients should launch the server. Prefer the globally-installed binary;
 * fall back to `npx -y lumencore serve` so install works without a global install.
 */
export declare function resolveServerEntry(): ServerEntry;
//# sourceMappingURL=index.d.ts.map