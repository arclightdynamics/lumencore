import { getConfigManager } from '../config/manager.js';
import { getDefaultConfig } from '../config/defaults.js';
import { startUiServer, shutdownUiServer } from '../ui/server.js';
export async function runUi(flags = {}) {
    // Ensure there's a config so aggregation can find the data dir.
    const configManager = getConfigManager();
    if (!configManager.isConfigured()) {
        configManager.save(getDefaultConfig());
    }
    const port = flags.port ?? 4317;
    const host = flags.host ?? '127.0.0.1';
    let server;
    try {
        server = await startUiServer({ port, host });
    }
    catch (err) {
        const e = err;
        if (e.code === 'EADDRINUSE') {
            console.error(`\nPort ${port} is already in use. Try: lumencore ui --port <other>\n`);
        }
        else {
            console.error(`\nFailed to start dashboard: ${e.message}\n`);
        }
        process.exit(1);
        return;
    }
    const url = `http://${host}:${port}`;
    console.log(`\n  LumenCore dashboard running (loopback-only)`);
    console.log(`  → ${url}\n`);
    console.log('  Press Ctrl+C to stop.\n');
    const stop = () => {
        shutdownUiServer(server);
        process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
//# sourceMappingURL=ui.js.map