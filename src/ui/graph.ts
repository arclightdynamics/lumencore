import fs from 'fs';
import path from 'path';
import { getConfigManager } from '../config/manager.js';
import { getDatabase } from '../storage/database.js';
import { getGlobalDbPath } from '../utils/paths.js';

const MIN = 60_000;
const MAX_DEGREE = 10; // cap edges per node so the graph doesn't hairball
const TAG_CLIQUE_LIMIT = 8; // tags shared by more nodes link as a star, not a clique

function minsSince(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((Date.now() - t) / MIN));
}

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export interface GraphNode {
  id: string;
  title: string;
  category: string;
  importance: number;
  accessCount: number;
  project: string;
  ageMins: number;
  superseded: boolean;
}

export interface GraphEdge {
  a: string;
  b: string;
  type: 'tag' | 'supersede';
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  projects: string[];
  generatedAt: string;
}

interface Row {
  id: string;
  title: string;
  category: string;
  importance: number;
  tags: string;
  updated_at: string;
  last_accessed: string | null;
  access_count: number | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  project_path: string | null;
}

function collectRows(): Array<Row & { project: string }> {
  const config = getConfigManager().load();
  const out: Array<Row & { project: string }> = [];

  const root = path.join(config.dataDir, 'projects');
  const dirs = fs.existsSync(root) ? fs.readdirSync(root) : [];
  for (const hash of dirs) {
    const dbPath = path.join(root, hash, 'memories.db');
    if (!fs.existsSync(dbPath)) continue;
    const db = getDatabase(dbPath).getDatabase();
    const rows = db.prepare('SELECT * FROM memories').all() as Row[];
    for (const r of rows) {
      out.push({ ...r, project: r.project_path ? path.basename(r.project_path) : hash.slice(0, 10) });
    }
  }

  const gp = getGlobalDbPath();
  if (fs.existsSync(gp)) {
    const rows = getDatabase(gp).getDatabase().prepare('SELECT * FROM memories').all() as Row[];
    for (const r of rows) out.push({ ...r, project: 'global' });
  }

  return out;
}

export function buildGraph(opts: { limit?: number; project?: string } = {}): GraphPayload {
  const limit = opts.limit ?? 250;
  let rows = collectRows();
  if (opts.project) rows = rows.filter((r) => r.project === opts.project);

  // Most-recent first, capped.
  rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const selected = rows.slice(0, limit);
  const idSet = new Set(selected.map((r) => r.id));
  const impOf = new Map(selected.map((r) => [r.id, r.importance]));

  const nodes: GraphNode[] = selected.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    importance: r.importance,
    accessCount: r.access_count ?? 0,
    project: r.project,
    ageMins: minsSince(r.updated_at),
    superseded: !!r.superseded_by_id,
  }));

  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const degree = new Map<string, number>();
  const deg = (id: string) => degree.get(id) ?? 0;
  function addEdge(a: string, b: string, type: GraphEdge['type'], capped = true): void {
    if (a === b) return;
    const key = type + '|' + [a, b].sort().join('|');
    if (edgeKeys.has(key)) return;
    if (capped && (deg(a) >= MAX_DEGREE || deg(b) >= MAX_DEGREE)) return;
    edgeKeys.add(key);
    edges.push({ a, b, type });
    degree.set(a, deg(a) + 1);
    degree.set(b, deg(b) + 1);
  }

  // Supersession edges first (never capped — they're structural truth).
  for (const r of selected) {
    if (r.supersedes_id && idSet.has(r.supersedes_id)) addEdge(r.supersedes_id, r.id, 'supersede', false);
  }

  // Tag edges.
  const tagMap = new Map<string, string[]>();
  for (const r of selected) {
    for (const t of parseTags(r.tags)) {
      const list = tagMap.get(t) ?? [];
      list.push(r.id);
      tagMap.set(t, list);
    }
  }
  for (const ids of tagMap.values()) {
    if (ids.length < 2) continue;
    if (ids.length <= TAG_CLIQUE_LIMIT) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addEdge(ids[i], ids[j], 'tag');
    } else {
      // star around the highest-importance member to avoid an N² explosion
      const hub = ids.reduce((h, id) => ((impOf.get(id) ?? 0) > (impOf.get(h) ?? 0) ? id : h), ids[0]);
      for (const id of ids) addEdge(hub, id, 'tag');
    }
  }

  const projects = Array.from(new Set(collectRows().map((r) => r.project))).sort();

  return { nodes, edges, projects, generatedAt: new Date().toISOString() };
}
