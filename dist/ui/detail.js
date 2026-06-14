import fs from 'fs';
import path from 'path';
import { getConfigManager } from '../config/manager.js';
import { getDatabase } from '../storage/database.js';
import { getGlobalDbPath } from '../utils/paths.js';
import { MemoryService } from '../services/memory.js';
import { fileURLToPath } from 'url';
const MIN = 60_000;
function minsSince(iso) {
    if (!iso)
        return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / MIN));
}
function parseTags(raw) {
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v : [];
    }
    catch {
        return [];
    }
}
function projectDbPaths(dataDir) {
    const root = path.join(dataDir, 'projects');
    if (!fs.existsSync(root))
        return [];
    const out = [];
    for (const hash of fs.readdirSync(root)) {
        const db = path.join(root, hash, 'memories.db');
        if (fs.existsSync(db))
            out.push({ hash, db });
    }
    return out;
}
/** Find which DB (project or global) holds a memory id. */
export function locate(id) {
    const config = getConfigManager().load();
    for (const { hash, db } of projectDbPaths(config.dataDir)) {
        const d = getDatabase(db).getDatabase();
        const row = d.prepare('SELECT project_path FROM memories WHERE id = ?').get(id);
        if (row)
            return { scope: 'project', dbPath: db, hash, projectPath: row.project_path ?? null };
    }
    const gp = getGlobalDbPath();
    if (fs.existsSync(gp)) {
        const d = getDatabase(gp).getDatabase();
        const row = d.prepare('SELECT id FROM memories WHERE id = ?').get(id);
        if (row)
            return { scope: 'global', dbPath: gp, hash: null, projectPath: null };
    }
    return null;
}
export function buildProject(hash) {
    const config = getConfigManager().load();
    const dbPath = path.join(config.dataDir, 'projects', hash, 'memories.db');
    if (!fs.existsSync(dbPath))
        return null;
    const d = getDatabase(dbPath).getDatabase();
    const count = d.prepare('SELECT COUNT(*) AS c FROM memories').get().c;
    const meta = d
        .prepare(`SELECT project_path, MAX(updated_at) AS lastWrite, COALESCE(SUM(access_count),0) AS recalls FROM memories`)
        .get();
    const name = meta.project_path ? path.basename(meta.project_path) : hash.slice(0, 10);
    const rows = d.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all();
    const tagSet = new Set();
    const memories = rows.map((r) => {
        const tags = parseTags(r.tags);
        tags.forEach((t) => tagSet.add(t));
        return {
            id: r.id,
            title: r.title,
            body: r.content,
            category: r.category,
            importance: r.importance,
            tags,
            ageMins: minsSince(r.updated_at) ?? 0,
            accessCount: r.access_count ?? 0,
            superseded: !!r.superseded_by_id,
        };
    });
    return {
        project: {
            id: hash,
            name,
            path: meta.project_path ?? hash,
            count,
            recalls: meta.recalls,
            lastWriteMins: minsSince(meta.lastWrite),
        },
        memories,
        tags: Array.from(tagSet).sort(),
    };
}
/** Global-scope memories, shaped like a project view so the UI can reuse it. */
export function buildGlobal() {
    const empty = {
        project: { id: 'global', name: 'global', path: 'global scope · shared across all projects', count: 0, recalls: 0, lastWriteMins: null },
        memories: [],
        tags: [],
    };
    const gp = getGlobalDbPath();
    if (!fs.existsSync(gp))
        return empty;
    const d = getDatabase(gp).getDatabase();
    const count = d.prepare('SELECT COUNT(*) AS c FROM memories').get().c;
    if (count === 0)
        return empty;
    const meta = d
        .prepare("SELECT MAX(updated_at) AS lastWrite, COALESCE(SUM(access_count),0) AS recalls FROM memories")
        .get();
    const rows = d.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all();
    const tagSet = new Set();
    const memories = rows.map((r) => {
        const tags = parseTags(r.tags);
        tags.forEach((t) => tagSet.add(t));
        return {
            id: r.id, title: r.title, body: r.content, category: r.category, importance: r.importance,
            tags, ageMins: minsSince(r.updated_at) ?? 0, accessCount: r.access_count ?? 0, superseded: !!r.superseded_by_id,
        };
    });
    return {
        project: { id: 'global', name: 'global', path: 'global scope · shared across all projects', count, recalls: meta.recalls, lastWriteMins: minsSince(meta.lastWrite) },
        memories,
        tags: Array.from(tagSet).sort(),
    };
}
/** Full-text search across every project DB + global, ranked by BM25 relevance. */
export function searchAll(query, limit = 50) {
    const term = query.trim();
    if (!term)
        return { query, count: 0, results: [] };
    const config = getConfigManager().load();
    const match = term.split(/\s+/).filter(Boolean).map((w) => '"' + w.replace(/"/g, '') + '"').join(' OR ');
    const targets = projectDbPaths(config.dataDir).map((x) => ({ db: x.db, scope: 'project' }));
    const gp = getGlobalDbPath();
    if (fs.existsSync(gp))
        targets.push({ db: gp, scope: 'global' });
    const scored = [];
    for (const { db: dbPath, scope } of targets) {
        const d = getDatabase(dbPath).getDatabase();
        let rows;
        try {
            rows = d
                .prepare('SELECT m.*, bm25(memories_fts, 10.0, 1.0, 5.0) AS rank FROM memories m JOIN memories_fts ON m.rowid = memories_fts.rowid WHERE memories_fts MATCH ? ORDER BY rank LIMIT ?')
                .all(match, limit);
        }
        catch {
            const like = '%' + term + '%';
            rows = d
                .prepare('SELECT *, 0 AS rank FROM memories WHERE title LIKE ? OR content LIKE ? OR tags LIKE ? LIMIT ?')
                .all(like, like, like, limit);
        }
        for (const r of rows) {
            const project = scope === 'global' ? 'global' : r.project_path ? path.basename(r.project_path) : 'unknown';
            scored.push({
                rel: -(r.rank ?? 0),
                res: { id: r.id, title: r.title, body: r.content, category: r.category, importance: r.importance, project, tags: parseTags(r.tags), ageMins: minsSince(r.updated_at) ?? 0, scope },
            });
        }
    }
    scored.sort((a, b) => b.rel - a.rel);
    const results = scored.slice(0, limit).map((s) => s.res);
    return { query, count: results.length, results };
}
export function buildSettings() {
    const cm = getConfigManager();
    const config = cm.load();
    let version = 'unknown';
    try {
        const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
        version = JSON.parse(fs.readFileSync(pkg, 'utf-8')).version ?? 'unknown';
    }
    catch {
        /* ignore */
    }
    return { config, version, configPath: cm.getConfigPath(), dataDir: config.dataDir };
}
export function buildTimeline(limit = 150) {
    const config = getConfigManager().load();
    const out = [];
    for (const { hash, db } of projectDbPaths(config.dataDir)) {
        const rows = getDatabase(db)
            .getDatabase()
            .prepare('SELECT id, title, category, importance, updated_at, project_path FROM memories ORDER BY updated_at DESC LIMIT ?')
            .all(limit);
        for (const r of rows)
            out.push({ id: r.id, title: r.title, category: r.category, importance: r.importance, project: r.project_path ? path.basename(r.project_path) : hash.slice(0, 10), updatedAt: r.updated_at });
    }
    const gp = getGlobalDbPath();
    if (fs.existsSync(gp)) {
        const rows = getDatabase(gp)
            .getDatabase()
            .prepare('SELECT id, title, category, importance, updated_at FROM memories ORDER BY updated_at DESC LIMIT ?')
            .all(limit);
        for (const r of rows)
            out.push({ id: r.id, title: r.title, category: r.category, importance: r.importance, project: 'global', updatedAt: r.updated_at });
    }
    out.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { entries: out.slice(0, limit) };
}
export function buildActivity(limit = 40) {
    const config = getConfigManager().load();
    const targets = projectDbPaths(config.dataDir).map((x) => ({ db: x.db, hash: x.hash, scope: 'project' }));
    const gp = getGlobalDbPath();
    if (fs.existsSync(gp))
        targets.push({ db: gp, hash: null, scope: 'global' });
    const ev = [];
    for (const { db, hash, scope } of targets) {
        const d = getDatabase(db).getDatabase();
        const proj = (pp) => (scope === 'global' ? 'global' : pp ? path.basename(pp) : (hash ?? '').slice(0, 10));
        const writes = d.prepare('SELECT id, title, category, updated_at, project_path FROM memories ORDER BY updated_at DESC LIMIT ?').all(limit);
        for (const r of writes)
            ev.push({ id: r.id, title: r.title, category: r.category, project: proj(r.project_path), kind: 'write', ageMins: minsSince(r.updated_at) ?? 0, ts: r.updated_at });
        const recalls = d.prepare('SELECT id, title, category, last_accessed, project_path FROM memories WHERE last_accessed IS NOT NULL ORDER BY last_accessed DESC LIMIT ?').all(limit);
        for (const r of recalls)
            ev.push({ id: r.id, title: r.title, category: r.category, project: proj(r.project_path), kind: 'recall', ageMins: minsSince(r.last_accessed) ?? 0, ts: r.last_accessed });
    }
    ev.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
    return { events: ev.slice(0, limit).map(({ ts, ...e }) => e) };
}
export function getMemoryDetail(id) {
    const loc = locate(id);
    if (!loc)
        return null;
    const d = getDatabase(loc.dbPath).getDatabase();
    const r = d.prepare('SELECT * FROM memories WHERE id = ?').get(id);
    if (!r)
        return null;
    const projectName = loc.scope === 'global' ? 'global' : loc.projectPath ? path.basename(loc.projectPath) : (loc.hash ?? '').slice(0, 10);
    return {
        id: r.id,
        title: r.title,
        body: r.content,
        category: r.category,
        importance: r.importance,
        tags: parseTags(r.tags),
        source: r.source,
        confidence: r.confidence,
        accessCount: r.access_count ?? 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        lastAccessed: r.last_accessed,
        expiresAt: r.expires_at,
        supersedesId: r.supersedes_id,
        supersededById: r.superseded_by_id,
        scope: loc.scope,
        projectId: loc.hash,
        projectName,
        projectPath: loc.projectPath,
        // Editing routes through MemoryService, which needs the project path.
        editable: loc.scope === 'project' && !!loc.projectPath,
    };
}
function serviceFor(id) {
    const loc = locate(id);
    if (!loc)
        return { error: 'memory not found' };
    if (loc.scope === 'global')
        return { error: 'global memories are read-only in the dashboard' };
    if (!loc.projectPath)
        return { error: 'cannot edit a legacy memory missing its project path' };
    return { svc: new MemoryService(loc.projectPath) };
}
export function updateMemory(id, fields) {
    const r = serviceFor(id);
    if ('error' in r)
        return { ok: false, error: r.error };
    const updated = r.svc.update({
        id,
        title: fields.title,
        content: fields.content,
        tags: fields.tags,
        importance: fields.importance,
    });
    return updated ? { ok: true } : { ok: false, error: 'update failed' };
}
export function deleteMemory(id) {
    const r = serviceFor(id);
    if ('error' in r)
        return { ok: false, error: r.error };
    return r.svc.delete(id) ? { ok: true } : { ok: false, error: 'delete failed' };
}
export function supersedeMemory(oldId, newId) {
    const r = serviceFor(oldId);
    if ('error' in r)
        return { ok: false, error: r.error };
    return r.svc.supersede(oldId, newId) ? { ok: true } : { ok: false, error: 'supersede failed' };
}
//# sourceMappingURL=detail.js.map