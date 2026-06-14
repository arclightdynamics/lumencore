import fs from 'fs';
import path from 'path';
import { getConfigManager } from '../config/manager.js';
import { getDatabase } from '../storage/database.js';
import { getGlobalDbPath } from '../utils/paths.js';
const MIN = 60_000;
function minsSince(iso) {
    if (!iso)
        return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t))
        return null;
    return Math.max(0, Math.round((Date.now() - t) / MIN));
}
function projectNameFromPath(p, fallback) {
    if (!p)
        return fallback;
    return path.basename(p) || p;
}
function toUiMemory(row, projectName) {
    let tags = [];
    try {
        tags = JSON.parse(row.tags);
    }
    catch {
        tags = [];
    }
    return {
        id: row.id,
        title: row.title,
        body: row.content,
        category: row.category,
        importance: row.importance,
        project: projectName,
        tags,
        ageMins: minsSince(row.updated_at) ?? 0,
        accessCount: row.access_count ?? 0,
    };
}
/** List every project memories.db under the data dir. */
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
/**
 * Aggregate every project DB (plus the global DB) into a single dashboard
 * payload. Uses getDatabase() so each DB is brought to the current schema,
 * guaranteeing the project_path / last_accessed / access_count columns exist.
 */
export function buildDashboard() {
    const config = getConfigManager().load();
    const projects = [];
    const written = [];
    const recalled = [];
    let totalMemories = 0;
    for (const { hash, db: dbPath } of projectDbPaths(config.dataDir)) {
        const db = getDatabase(dbPath).getDatabase();
        const count = db.prepare('SELECT COUNT(*) AS c FROM memories').get().c;
        if (count === 0)
            continue;
        totalMemories += count;
        const meta = db
            .prepare(`SELECT project_path,
                MAX(updated_at) AS lastWrite,
                MAX(last_accessed) AS lastRecall,
                COALESCE(SUM(access_count), 0) AS recalls
         FROM memories`)
            .get();
        const name = projectNameFromPath(meta.project_path, hash.slice(0, 10));
        projects.push({
            id: hash,
            name,
            path: meta.project_path ?? hash,
            count,
            recalls: meta.recalls,
            lastWriteMins: minsSince(meta.lastWrite),
        });
        const recentRows = db
            .prepare('SELECT * FROM memories ORDER BY updated_at DESC LIMIT 10')
            .all();
        written.push(...recentRows.map((r) => toUiMemory(r, name)));
        const recalledRows = db
            .prepare('SELECT * FROM memories WHERE last_accessed IS NOT NULL ORDER BY last_accessed DESC LIMIT 10')
            .all();
        recalled.push(...recalledRows.map((r) => ({
            ...toUiMemory(r, name),
            // for recalled cards, age reflects when it was last used
            ageMins: minsSince(r.last_accessed) ?? toUiMemory(r, name).ageMins,
        })));
    }
    // Global scope
    let globalCount = 0;
    const globalPath = getGlobalDbPath();
    if (fs.existsSync(globalPath)) {
        const gdb = getDatabase(globalPath).getDatabase();
        globalCount = gdb.prepare('SELECT COUNT(*) AS c FROM memories').get().c;
        totalMemories += globalCount;
        if (globalCount > 0) {
            const rows = gdb.prepare('SELECT * FROM memories ORDER BY updated_at DESC LIMIT 10').all();
            written.push(...rows.map((r) => toUiMemory(r, 'global')));
        }
    }
    written.sort((a, b) => a.ageMins - b.ageMins);
    recalled.sort((a, b) => a.ageMins - b.ageMins);
    projects.sort((a, b) => (a.lastWriteMins ?? Infinity) - (b.lastWriteMins ?? Infinity));
    const lastWrite = written[0] ?? null;
    const lastRecall = recalled[0] ?? null;
    const writtenLastHour = written.filter((m) => m.ageMins <= 60).length;
    return {
        stats: {
            memories: totalMemories,
            projects: projects.length,
            globalCount,
            lastWriteMins: lastWrite ? lastWrite.ageMins : null,
            lastWrite: lastWrite ? { id: lastWrite.id, project: lastWrite.project } : null,
            lastRecallMins: lastRecall ? lastRecall.ageMins : null,
            lastRecall: lastRecall ? { project: lastRecall.project } : null,
            writtenLastHour,
        },
        recentWritten: written.slice(0, 6),
        recentRecalled: recalled.slice(0, 6),
        projects,
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=aggregate.js.map