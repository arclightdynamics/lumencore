import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildDashboard } from './aggregate.js';
import { buildProject, buildGlobal, searchAll, buildSettings, buildTimeline, buildActivity, getMemoryDetail, updateMemory, deleteMemory, supersedeMemory } from './detail.js';
import { buildGraph } from './graph.js';
import { closeAllDatabases } from '../storage/database.js';
const ASSET_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATIC = {
    '/lumencore.css': { file: 'lumencore.css', type: 'text/css; charset=utf-8' },
};
function sendStatic(res, file, type) {
    fs.readFile(path.join(ASSET_DIR, file), (err, buf) => {
        if (err) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
        res.end(buf);
    });
}
function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 1_000_000)
                reject(new Error('body too large'));
        });
        req.on('end', () => {
            if (!data)
                return resolve({});
            try {
                resolve(JSON.parse(data));
            }
            catch {
                reject(new Error('invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
async function handleApi(req, res, url) {
    const route = url.pathname;
    const method = req.method ?? 'GET';
    if (route === '/api/dashboard' && method === 'GET') {
        return sendJson(res, 200, buildDashboard());
    }
    if (route === '/api/project' && method === 'GET') {
        const id = url.searchParams.get('id') ?? '';
        const data = buildProject(id);
        return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: 'project not found' });
    }
    if (route === '/api/global' && method === 'GET') {
        return sendJson(res, 200, buildGlobal());
    }
    if (route === '/api/search' && method === 'GET') {
        return sendJson(res, 200, searchAll(url.searchParams.get('q') ?? ''));
    }
    if (route === '/api/settings' && method === 'GET') {
        return sendJson(res, 200, buildSettings());
    }
    if (route === '/api/timeline' && method === 'GET') {
        return sendJson(res, 200, buildTimeline());
    }
    if (route === '/api/activity' && method === 'GET') {
        return sendJson(res, 200, buildActivity());
    }
    if (route === '/api/graph' && method === 'GET') {
        const limitParam = url.searchParams.get('limit');
        return sendJson(res, 200, buildGraph({
            project: url.searchParams.get('project') || undefined,
            limit: limitParam ? parseInt(limitParam, 10) : undefined,
        }));
    }
    if (route === '/api/memory') {
        const id = url.searchParams.get('id') ?? '';
        if (method === 'GET') {
            const data = getMemoryDetail(id);
            return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: 'memory not found' });
        }
        if (method === 'PUT') {
            const body = (await readBody(req));
            const result = updateMemory(body.id ?? id, body);
            return sendJson(res, result.ok ? 200 : 400, result);
        }
        if (method === 'DELETE') {
            const result = deleteMemory(id);
            return sendJson(res, result.ok ? 200 : 400, result);
        }
    }
    if (route === '/api/supersede' && method === 'POST') {
        const body = (await readBody(req));
        if (!body.oldId || !body.newId)
            return sendJson(res, 400, { ok: false, error: 'oldId and newId required' });
        return sendJson(res, 200, supersedeMemory(body.oldId, body.newId));
    }
    sendJson(res, 404, { error: 'unknown endpoint' });
}
export function createUiServer() {
    return http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = url.pathname;
        if (route.startsWith('/api/')) {
            handleApi(req, res, url).catch((err) => sendJson(res, 500, { error: err instanceof Error ? err.message : 'server error' }));
            return;
        }
        const asset = STATIC[route];
        if (asset) {
            sendStatic(res, asset.file, asset.type);
            return;
        }
        // SPA: any other GET path renders the dashboard (client-side routing).
        if ((req.method ?? 'GET') === 'GET') {
            sendStatic(res, 'dashboard.html', 'text/html; charset=utf-8');
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
    });
}
/**
 * Start the dashboard server. Loopback-only by default (127.0.0.1) — the
 * dashboard reads local SQLite and is never meant to be exposed.
 */
export function startUiServer(opts = {}) {
    const port = opts.port ?? 4317;
    const host = opts.host ?? '127.0.0.1';
    const server = createUiServer();
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}
export function shutdownUiServer(server) {
    server.close();
    closeAllDatabases();
}
//# sourceMappingURL=server.js.map