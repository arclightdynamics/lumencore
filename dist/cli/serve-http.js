import { getConfigManager } from '../config/manager.js';
import { getDefaultConfig } from '../config/defaults.js';
import { startHttpApi, shutdownHttpApi } from '../http/api.js';
/**
 * Start the networked memory API so remote agents can use this LumenCore as a
 * shared brain. Bind to a LAN/Tailscale address with --host; protect it with a
 * token (--token or LUMENCORE_TOKEN).
 */
export async function runServeHttp(flags = {}) {
    const cm = getConfigManager();
    if (!cm.isConfigured())
        cm.save(getDefaultConfig());
    const host = flags.host ?? '127.0.0.1';
    const port = flags.port ?? 4318;
    const token = flags.token ?? process.env.LUMENCORE_TOKEN;
    let server;
    try {
        server = await startHttpApi({ host, port, token });
    }
    catch (err) {
        const e = err;
        console.error(e.code === 'EADDRINUSE' ? `\nPort ${port} is already in use.\n` : `\nFailed to start: ${e.message}\n`);
        process.exit(1);
        return;
    }
    console.log(`\n  LumenCore networked memory API`);
    console.log(`  → http://${host}:${port}  (GET /v1/health · /v1/recall · POST /v1/remember)`);
    console.log(`  auth: ${token ? 'Bearer token required' : '⚠ OPEN (no token — set --token or LUMENCORE_TOKEN)'}`);
    if (host === '127.0.0.1') {
        console.log('  note: bound to loopback. For LAN/Tailscale access use --host <tailnet-ip> (or 0.0.0.0).');
    }
    console.log('\n  Ctrl+C to stop.\n');
    const stop = () => {
        shutdownHttpApi(server);
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
//# sourceMappingURL=serve-http.js.map