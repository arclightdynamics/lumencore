import { getDatabase } from '../storage/database.js';
import { getProjectDbPath, getGlobalDbPath, getProjectId } from '../utils/paths.js';
import { getConfigManager } from '../config/manager.js';
/**
 * Relevance ranking weights. importance and recency are applied as *soft
 * multipliers* on top of the BM25 relevance score — they nudge ordering, they
 * never override it. (Previously the BM25 signal was computed and then thrown
 * away by a hard re-sort on importance/recency.)
 */
const IMPORTANCE_WEIGHT = 0.15; // importance 5 → +15% vs importance 1
const RECENCY_WEIGHT = 0.1; // updated today → +10%, decaying with age
const RECENCY_HALFLIFE_DAYS = 90; // recency boost halves every 90 days
const BASELINE_RELEVANCE = 1; // fallback when there is no BM25 signal
export class SearchService {
    projectPath;
    projectId;
    constructor(projectPath) {
        this.projectPath = projectPath;
        this.projectId = getProjectId(projectPath);
    }
    getDbForScope(scope) {
        if (scope === 'global') {
            return getDatabase(getGlobalDbPath());
        }
        return getDatabase(getProjectDbPath(this.projectPath));
    }
    rowToMemory(row) {
        return {
            id: row.id,
            projectId: row.project_id,
            scope: row.scope,
            category: row.category,
            title: row.title,
            content: row.content,
            tags: JSON.parse(row.tags),
            importance: row.importance,
            source: row.source ?? null,
            confidence: row.confidence ?? null,
            supersedesId: row.supersedes_id ?? null,
            supersededById: row.superseded_by_id ?? null,
            lastAccessed: row.last_accessed ?? null,
            accessCount: row.access_count ?? 0,
            expiresAt: row.expires_at ?? null,
            projectPath: row.project_path ?? null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    search(options) {
        const { query, category, scope, limit = 10 } = options;
        const config = getConfigManager().load();
        const scored = [];
        const scopes = scope
            ? [scope]
            : config.memoryScope === 'project-and-global'
                ? ['project', 'global']
                : ['project'];
        for (const s of scopes) {
            const db = this.getDbForScope(s);
            if (query) {
                // Full-text search. bm25() is negative; the most relevant row is the
                // most negative, so we keep -rank as a positive relevance score.
                // Column weights (title, content, tags) make a title or tag hit count
                // for more than the same term buried in the body.
                let ftsQuery = `
          SELECT m.*, bm25(memories_fts, 10.0, 1.0, 5.0) as rank
          FROM memories m
          JOIN memories_fts ON m.rowid = memories_fts.rowid
          WHERE memories_fts MATCH ?
        `;
                const params = [this.escapeFtsQuery(query)];
                if (s === 'project') {
                    ftsQuery += ' AND m.project_id = ?';
                    params.push(this.projectId);
                }
                if (category) {
                    ftsQuery += ' AND m.category = ?';
                    params.push(category);
                }
                ftsQuery += ' ORDER BY rank LIMIT ?';
                params.push(limit);
                try {
                    const stmt = db.getDatabase().prepare(ftsQuery);
                    const rows = stmt.all(...params);
                    for (const row of rows) {
                        scored.push({
                            memory: this.rowToMemory(row),
                            relevance: -row.rank,
                        });
                    }
                }
                catch {
                    // FTS unavailable for this query — fall back to LIKE. No BM25 signal,
                    // so these rows carry no relevance and rank by the priors only.
                    let likeQuery = `
            SELECT * FROM memories
            WHERE (title LIKE ? OR content LIKE ? OR tags LIKE ?)
          `;
                    const likeParams = [`%${query}%`, `%${query}%`, `%${query}%`];
                    if (s === 'project') {
                        likeQuery += ' AND project_id = ?';
                        likeParams.push(this.projectId);
                    }
                    if (category) {
                        likeQuery += ' AND category = ?';
                        likeParams.push(category);
                    }
                    likeQuery += ' ORDER BY importance DESC, updated_at DESC LIMIT ?';
                    likeParams.push(limit);
                    const stmt = db.getDatabase().prepare(likeQuery);
                    const rows = stmt.all(...likeParams);
                    for (const row of rows) {
                        scored.push({ memory: this.rowToMemory(row), relevance: null });
                    }
                }
            }
            else {
                // No query: there is no relevance signal, so order by the priors.
                let listQuery = 'SELECT * FROM memories WHERE 1=1';
                const params = [];
                if (s === 'project') {
                    listQuery += ' AND project_id = ?';
                    params.push(this.projectId);
                }
                if (category) {
                    listQuery += ' AND category = ?';
                    params.push(category);
                }
                listQuery += ' ORDER BY importance DESC, updated_at DESC LIMIT ?';
                params.push(limit);
                const stmt = db.getDatabase().prepare(listQuery);
                const rows = stmt.all(...params);
                for (const row of rows) {
                    scored.push({ memory: this.rowToMemory(row), relevance: null });
                }
            }
        }
        const hasRelevance = scored.some((s) => s.relevance !== null);
        if (hasRelevance) {
            // Relevance-primary ordering: BM25 score scaled by the soft priors.
            scored.sort((a, b) => this.finalScore(b) - this.finalScore(a));
        }
        else {
            // No query was run; fall back to importance then recency.
            scored.sort((a, b) => {
                if (a.memory.importance !== b.memory.importance) {
                    return b.memory.importance - a.memory.importance;
                }
                return (new Date(b.memory.updatedAt).getTime() -
                    new Date(a.memory.updatedAt).getTime());
            });
        }
        return scored.slice(0, limit).map((s) => s.memory);
    }
    /**
     * Combine a memory's BM25 relevance with soft importance and recency priors.
     * Relevance dominates; the priors only multiply it by a small factor so a
     * highly relevant memory can never be buried by a more important or newer but
     * less relevant one.
     */
    finalScore(scored) {
        const relevance = scored.relevance ?? BASELINE_RELEVANCE;
        // importance 1..5 → 1.0 .. (1 + IMPORTANCE_WEIGHT)
        const importanceBoost = 1 + ((scored.memory.importance - 1) / 4) * IMPORTANCE_WEIGHT;
        // newer = larger boost, decaying exponentially with age
        const ageDays = (Date.now() - new Date(scored.memory.updatedAt).getTime()) / 86_400_000;
        const recencyFactor = Math.exp(-Math.max(ageDays, 0) / RECENCY_HALFLIFE_DAYS);
        const recencyBoost = 1 + recencyFactor * RECENCY_WEIGHT;
        return relevance * importanceBoost * recencyBoost;
    }
    /**
     * Find existing memories that overlap with a prospective one — candidates the
     * host LLM should consider for supersession/merge. Same category is a strong
     * signal, so it's filtered when provided; already-superseded memories are
     * skipped. Detection never throws: if FTS is unavailable we return nothing
     * rather than block a write.
     */
    findConflicts(options) {
        const { title, content, category, scope, excludeId, limit = 5 } = options;
        const config = getConfigManager().load();
        const match = this.buildConflictMatch(`${title} ${content}`);
        if (!match) {
            return [];
        }
        const scopes = scope
            ? [scope]
            : config.memoryScope === 'project-and-global'
                ? ['project', 'global']
                : ['project'];
        const scored = [];
        for (const s of scopes) {
            const db = this.getDbForScope(s);
            let q = `
        SELECT m.*, bm25(memories_fts, 10.0, 1.0, 5.0) as rank
        FROM memories m
        JOIN memories_fts ON m.rowid = memories_fts.rowid
        WHERE memories_fts MATCH ?
          AND m.superseded_by_id IS NULL
      `;
            const params = [match];
            if (s === 'project') {
                q += ' AND m.project_id = ?';
                params.push(this.projectId);
            }
            if (category) {
                q += ' AND m.category = ?';
                params.push(category);
            }
            if (excludeId) {
                q += ' AND m.id != ?';
                params.push(excludeId);
            }
            q += ' ORDER BY rank LIMIT ?';
            params.push(limit);
            try {
                const rows = db.getDatabase().prepare(q).all(...params);
                for (const row of rows) {
                    scored.push({
                        memory: this.rowToMemory(row),
                        relevance: -row.rank,
                    });
                }
            }
            catch {
                // FTS unavailable for this query — skip rather than fail the caller.
            }
        }
        scored.sort((a, b) => this.finalScore(b) - this.finalScore(a));
        return scored.slice(0, limit).map((x) => x.memory);
    }
    /**
     * Build an FTS MATCH expression for conflict detection. Unlike the normal
     * search escaper, this drops tokens shorter than 3 chars (stopword-ish noise
     * like "to"/"of") and dedups, so overlap is judged on the distinctive words.
     */
    buildConflictMatch(text) {
        const seen = new Set();
        const words = [];
        for (const raw of text.toLowerCase().split(/\s+/)) {
            const cleaned = raw.replace(/[^a-z0-9]/g, '');
            if (cleaned.length < 3 || seen.has(cleaned)) {
                continue;
            }
            seen.add(cleaned);
            words.push(`"${cleaned}"`);
        }
        return words.join(' OR ');
    }
    getContext(options = {}) {
        const { categories, maxTokens = 4000 } = options;
        const config = getConfigManager().load();
        // Rough token estimation: ~4 chars per token
        const maxChars = maxTokens * 4;
        let output = '';
        let charCount = 0;
        const scopes = config.memoryScope === 'project-and-global'
            ? ['project', 'global']
            : ['project'];
        for (const scope of scopes) {
            const db = this.getDbForScope(scope);
            let query = 'SELECT * FROM memories WHERE 1=1';
            const params = [];
            if (scope === 'project') {
                query += ' AND project_id = ?';
                params.push(this.projectId);
            }
            if (categories && categories.length > 0) {
                query += ` AND category IN (${categories.map(() => '?').join(', ')})`;
                params.push(...categories);
            }
            query += ' ORDER BY importance DESC, updated_at DESC';
            const stmt = db.getDatabase().prepare(query);
            const rows = stmt.all(...params);
            for (const row of rows) {
                const memory = this.rowToMemory(row);
                const entry = this.formatMemoryForContext(memory);
                if (charCount + entry.length > maxChars) {
                    break;
                }
                output += entry;
                charCount += entry.length;
            }
            if (charCount >= maxChars) {
                break;
            }
        }
        return output || 'No memories stored yet.';
    }
    formatMemoryForContext(memory) {
        const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
        return `## ${memory.category.toUpperCase()}: ${memory.title}${tags}\n${memory.content}\n\n`;
    }
    escapeFtsQuery(query) {
        // Escape special FTS5 characters and wrap in quotes for phrase matching
        // For simple queries, just use the words directly
        return query
            .replace(/['"]/g, '')
            .split(/\s+/)
            .filter(Boolean)
            .map(word => `"${word}"`)
            .join(' OR ');
    }
}
//# sourceMappingURL=search.js.map