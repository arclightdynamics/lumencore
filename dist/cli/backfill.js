import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfigManager } from '../config/manager.js';
import { getDefaultConfig } from '../config/defaults.js';
import { getProjectId } from '../utils/paths.js';
import { getDatabase, closeAllDatabases } from '../storage/database.js';
/**
 * Candidate project roots to reverse-map. ~/.claude.json's project list is the
 * richest source (every repo you've opened in Claude Code), plus any roots the
 * user passes explicitly.
 */
function candidateRoots(extra = []) {
    const roots = new Set(extra.map((p) => path.resolve(p)));
    const claudeJson = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeJson)) {
        try {
            const d = JSON.parse(fs.readFileSync(claudeJson, 'utf-8'));
            for (const p of Object.keys(d.projects ?? {}))
                roots.add(p);
        }
        catch {
            // ignore unreadable/oversized config
        }
    }
    return Array.from(roots);
}
export function runBackfill(flags) {
    const cm = getConfigManager();
    if (!cm.isConfigured())
        cm.save(getDefaultConfig());
    const config = cm.load();
    // hash → human path
    const hashToPath = new Map();
    for (const root of candidateRoots(flags.paths)) {
        try {
            hashToPath.set(getProjectId(root), root);
        }
        catch {
            // skip un-hashable entries
        }
    }
    const projectsDir = path.join(config.dataDir, 'projects');
    if (!fs.existsSync(projectsDir)) {
        console.log('\nNo project data found at ' + projectsDir + '\n');
        return;
    }
    const dirs = fs.readdirSync(projectsDir);
    let matched = 0;
    let filledRows = 0;
    let unmatched = 0;
    const lines = [];
    for (const hash of dirs) {
        const dbPath = path.join(projectsDir, hash, 'memories.db');
        if (!fs.existsSync(dbPath))
            continue;
        const root = hashToPath.get(hash);
        if (!root) {
            unmatched++;
            continue;
        }
        const db = getDatabase(dbPath).getDatabase();
        const missing = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE project_path IS NULL OR project_path = ''").get().c;
        matched++;
        if (missing === 0) {
            lines.push(`  = ${path.basename(root)} — already named`);
            continue;
        }
        if (!flags.dryRun) {
            db.prepare("UPDATE memories SET project_path = ? WHERE project_path IS NULL OR project_path = ''").run(root);
        }
        filledRows += missing;
        lines.push(`  ${flags.dryRun ? '+' : '✓'} ${path.basename(root)} — ${missing} memories  (${root})`);
    }
    console.log(`\n  LumenCore backfill${flags.dryRun ? ' — dry run (no writes)' : ''}\n`);
    console.log(`  candidate roots: ${hashToPath.size} · project DBs: ${dirs.length}\n`);
    console.log(lines.join('\n') || '  (nothing to name)');
    console.log(`\n  ${matched} project(s) matched · ${flags.dryRun ? 'would name' : 'named'} ${filledRows} memories · ${unmatched} unmatched (stay as hash).`);
    if (unmatched > 0) {
        console.log('  Tip: pass extra roots — e.g. "lumencore backfill ~/code/foo"\n');
    }
    else {
        console.log('');
    }
    if (!flags.dryRun)
        closeAllDatabases();
}
//# sourceMappingURL=backfill.js.map