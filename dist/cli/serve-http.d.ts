export interface ServeHttpFlags {
    host?: string;
    port?: number;
    token?: string;
}
/**
 * Start the networked memory API so remote agents can use this LumenCore as a
 * shared brain. Bind to a LAN/Tailscale address with --host; protect it with a
 * token (--token or LUMENCORE_TOKEN).
 */
export declare function runServeHttp(flags?: ServeHttpFlags): Promise<void>;
//# sourceMappingURL=serve-http.d.ts.map