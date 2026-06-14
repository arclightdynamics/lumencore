import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryService } from '../services/memory.js';
import { SearchService } from '../services/search.js';
import { closeAllDatabases } from '../storage/database.js';
function version() {
    try {
        const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
        return JSON.parse(fs.readFileSync(pkg, 'utf-8')).version ?? 'unknown';
    }
    catch {
        return 'unknown';
    }
}
function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (c) => {
            data += c;
            if (data.length > 2_000_000)
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
export function createApiServer(token) {
    return http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = url.pathname;
        const method = req.method ?? 'GET';
        if (route === '/v1/health' && method === 'GET') {
            return sendJson(res, 200, { ok: true, service: 'lumencore', version: version() });
        }
        if (token) {
            const auth = req.headers['authorization'] ?? '';
            if (auth !== `Bearer ${token}`) {
                return sendJson(res, 401, { ok: false, error: 'unauthorized' });
            }
        }
        handle(req, res, url, route, method).catch((err) => sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : 'server error' }));
    });
}
async function handle(req, res, url, route, method) {
    if (route === '/v1/recall' && method === 'GET') {
        const project = url.searchParams.get('project');
        if (!project)
            return sendJson(res, 400, { ok: false, error: 'project required' });
        const results = new SearchService(project).search({
            query: url.searchParams.get('q') ?? undefined,
            category: url.searchParams.get('category') ?? undefined,
            scope: url.searchParams.get('scope') ?? 'project',
            limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 10,
        });
        return sendJson(res, 200, { ok: true, results });
    }
    if (route === '/v1/list' && method === 'GET') {
        const project = url.searchParams.get('project');
        if (!project)
            return sendJson(res, 400, { ok: false, error: 'project required' });
        const memories = new MemoryService(project).list({
            category: url.searchParams.get('category') ?? undefined,
            scope: 'project',
            limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit'), 10) : 50,
        });
        return sendJson(res, 200, { ok: true, memories });
    }
    if (route === '/v1/remember' && method === 'POST') {
        const b = await readBody(req);
        if (!b.project)
            return sendJson(res, 400, { ok: false, error: 'project required' });
        if (!b.title || !b.content || !b.category) {
            return sendJson(res, 400, { ok: false, error: 'category, title, content required' });
        }
        const memory = new MemoryService(b.project).create({
            category: b.category,
            title: b.title,
            content: b.content,
            tags: b.tags,
            importance: b.importance,
            scope: b.scope,
            source: b.source ?? 'http-api',
        });
        return sendJson(res, 200, { ok: true, memory });
    }
    sendJson(res, 404, { ok: false, error: 'unknown endpoint' });
}
export function startHttpApi(opts = {}) {
    const port = opts.port ?? 4318;
    const host = opts.host ?? '127.0.0.1';
    const server = createApiServer(opts.token);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.removeListener('error', reject);
            resolve(server);
        });
    });
}
export function shutdownHttpApi(server) {
    server.close();
    closeAllDatabases();
}
//# sourceMappingURL=api.js.map