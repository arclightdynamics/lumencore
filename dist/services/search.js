import { getDatabase } from '../storage/database.js';
import { getProjectDbPath, getGlobalDbPath, getProjectId } from '../utils/paths.js';
import { getConfigManager } from '../config/manager.js';
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
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    search(options) {
        const { query, category, scope, limit = 10 } = options;
        const config = getConfigManager().load();
        const memories = [];
        const scopes = scope
            ? [scope]
            : config.memoryScope === 'project-and-global'
                ? ['project', 'global']
                : ['project'];
        for (const s of scopes) {
            const db = this.getDbForScope(s);
            if (query) {
                // Use FTS5 for text search
                let ftsQuery = `
          SELECT m.*, bm25(memories_fts) as rank
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
                    memories.push(...rows.map((row) => this.rowToMemory(row)));
                }
                catch {
                    // If FTS query fails, fall back to LIKE search
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
                    memories.push(...rows.map((row) => this.rowToMemory(row)));
                }
            }
            else {
                // No query, just filter
                let query = 'SELECT * FROM memories WHERE 1=1';
                const params = [];
                if (s === 'project') {
                    query += ' AND project_id = ?';
                    params.push(this.projectId);
                }
                if (category) {
                    query += ' AND category = ?';
                    params.push(category);
                }
                query += ' ORDER BY importance DESC, updated_at DESC LIMIT ?';
                params.push(limit);
                const stmt = db.getDatabase().prepare(query);
                const rows = stmt.all(...params);
                memories.push(...rows.map((row) => this.rowToMemory(row)));
            }
        }
        // Sort by importance then recency
        memories.sort((a, b) => {
            if (a.importance !== b.importance) {
                return b.importance - a.importance;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return memories.slice(0, limit);
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