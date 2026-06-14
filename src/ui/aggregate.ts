import fs from 'fs';
import path from 'path';
import { getConfigManager } from '../config/manager.js';
import { getDatabase } from '../storage/database.js';
import { getGlobalDbPath } from '../utils/paths.js';

/** A memory shaped for the dashboard UI. */
export interface UiMemory {
  id: string;
  title: string;
  body: string;
  category: string;
  importance: number;
  project: string;
  tags: string[];
  ageMins: number;
  accessCount: number;
}

export interface UiProject {
  id: string;
  name: string;
  path: string;
  count: number;
  recalls: number;
  lastWriteMins: number | null;
}

export interface DashboardPayload {
  stats: {
    memories: number;
    projects: number;
    globalCount: number;
    lastWriteMins: number | null;
    lastWrite: { id: string; project: string } | null;
    lastRecallMins: number | null;
    lastRecall: { project: string } | null;
    writtenLastHour: number;
  };
  recentWritten: UiMemory[];
  recentRecalled: UiMemory[];
  projects: UiProject[];
  generatedAt: string;
}

interface MemRow {
  id: string;
  title: string;
  content: string;
  category: string;
  importance: number;
  tags: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number | null;
  project_path: string | null;
}

const MIN = 60_000;

function minsSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / MIN));
}

function projectNameFromPath(p: string | null, fallback: string): string {
  if (!p) return fallback;
  return path.basename(p) || p;
}

function toUiMemory(row: MemRow, projectName: string): UiMemory {
  let tags: string[] = [];
  try {
    tags = JSON.parse(row.tags) as string[];
  } catch {
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
function projectDbPaths(dataDir: string): { hash: string; db: string }[] {
  const root = path.join(dataDir, 'projects');
  if (!fs.existsSync(root)) return [];
  const out: { hash: string; db: string }[] = [];
  for (const hash of fs.readdirSync(root)) {
    const db = path.join(root, hash, 'memories.db');
    if (fs.existsSync(db)) out.push({ hash, db });
  }
  return out;
}

/**
 * Aggregate every project DB (plus the global DB) into a single dashboard
 * payload. Uses getDatabase() so each DB is brought to the current schema,
 * guaranteeing the project_path / last_accessed / access_count columns exist.
 */
export function buildDashboard(): DashboardPayload {
  const config = getConfigManager().load();

  const projects: UiProject[] = [];
  const written: UiMemory[] = [];
  const recalled: UiMemory[] = [];
  let totalMemories = 0;

  for (const { hash, db: dbPath } of projectDbPaths(config.dataDir)) {
    const db = getDatabase(dbPath).getDatabase();
    const count = (db.prepare('SELECT COUNT(*) AS c FROM memories').get() as { c: number }).c;
    if (count === 0) continue;
    totalMemories += count;

    const meta = db
      .prepare(
        `SELECT project_path,
                MAX(updated_at) AS lastWrite,
                MAX(last_accessed) AS lastRecall,
                COALESCE(SUM(access_count), 0) AS recalls
         FROM memories`
      )
      .get() as { project_path: string | null; lastWrite: string; lastRecall: string | null; recalls: number };

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
      .all() as MemRow[];
    written.push(...recentRows.map((r) => toUiMemory(r, name)));

    const recalledRows = db
      .prepare('SELECT * FROM memories WHERE last_accessed IS NOT NULL ORDER BY last_accessed DESC LIMIT 10')
      .all() as MemRow[];
    recalled.push(
      ...recalledRows.map((r) => ({
        ...toUiMemory(r, name),
        // for recalled cards, age reflects when it was last used
        ageMins: minsSince(r.last_accessed) ?? toUiMemory(r, name).ageMins,
      }))
    );
  }

  // Global scope
  let globalCount = 0;
  const globalPath = getGlobalDbPath();
  if (fs.existsSync(globalPath)) {
    const gdb = getDatabase(globalPath).getDatabase();
    globalCount = (gdb.prepare('SELECT COUNT(*) AS c FROM memories').get() as { c: number }).c;
    totalMemories += globalCount;
    if (globalCount > 0) {
      const rows = gdb.prepare('SELECT * FROM memories ORDER BY updated_at DESC LIMIT 10').all() as MemRow[];
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
