import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../storage/database.js';
import { getProjectDbPath, getGlobalDbPath, getProjectId } from '../utils/paths.js';
import { getConfigManager } from '../config/manager.js';
import { allowsGlobal } from '../config/project.js';
export class MemoryService {
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
    create(input) {
        const config = getConfigManager().load();
        const scope = input.scope || 'project';
        // Check if global scope is allowed (install-wide, then per-project policy)
        if (scope === 'global' && config.memoryScope === 'project-only') {
            throw new Error('Global memories are disabled. Run "lumencore setup" to enable.');
        }
        if (scope === 'global' && allowsGlobal(this.projectPath) === false) {
            throw new Error('This project is local-only — global memories are disabled for it. Run "lumencore init --allow-global" to permit.');
        }
        const db = this.getDbForScope(scope);
        const now = new Date().toISOString();
        const id = uuidv4();
        const memory = {
            id,
            projectId: scope === 'global' ? 'global' : this.projectId,
            scope,
            category: input.category,
            title: input.title,
            content: input.content,
            tags: input.tags || [],
            importance: input.importance || config.defaultImportance,
            source: input.source ?? null,
            confidence: input.confidence ?? null,
            supersedesId: input.supersedesId ?? null,
            supersededById: null,
            lastAccessed: null,
            accessCount: 0,
            expiresAt: input.expiresAt ?? null,
            projectPath: scope === 'global' ? null : this.projectPath,
            createdAt: now,
            updatedAt: now,
        };
        const stmt = db.getDatabase().prepare(`
      INSERT INTO memories (
        id, project_id, scope, category, title, content, tags, importance,
        source, confidence, supersedes_id, superseded_by_id, last_accessed,
        access_count, expires_at, project_path, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(memory.id, memory.projectId, memory.scope, memory.category, memory.title, memory.content, JSON.stringify(memory.tags), memory.importance, memory.source, memory.confidence, memory.supersedesId, memory.supersededById, memory.lastAccessed, memory.accessCount, memory.expiresAt, memory.projectPath, memory.createdAt, memory.updatedAt);
        this.syncTags(db, memory.id, memory.tags);
        // If this memory replaces another, link both sides of the relationship.
        if (input.supersedesId) {
            this.supersede(input.supersedesId, memory.id);
        }
        return memory;
    }
    getById(id, scope = 'project') {
        const db = this.getDbForScope(scope);
        const stmt = db.getDatabase().prepare('SELECT * FROM memories WHERE id = ?');
        const row = stmt.get(id);
        if (!row) {
            // Try the other scope if not found
            const otherScope = scope === 'project' ? 'global' : 'project';
            const config = getConfigManager().load();
            if (config.memoryScope === 'project-and-global') {
                const otherDb = this.getDbForScope(otherScope);
                const otherRow = otherDb.getDatabase().prepare('SELECT * FROM memories WHERE id = ?').get(id);
                if (otherRow) {
                    return this.rowToMemory(otherRow);
                }
            }
            return null;
        }
        return this.rowToMemory(row);
    }
    update(input) {
        // Find the memory first
        let memory = this.getById(input.id, 'project');
        if (!memory) {
            memory = this.getById(input.id, 'global');
        }
        if (!memory) {
            return null;
        }
        const db = this.getDbForScope(memory.scope);
        const now = new Date().toISOString();
        const updates = [];
        const values = [];
        if (input.title !== undefined) {
            updates.push('title = ?');
            values.push(input.title);
        }
        if (input.content !== undefined) {
            updates.push('content = ?');
            values.push(input.content);
        }
        if (input.tags !== undefined) {
            updates.push('tags = ?');
            values.push(JSON.stringify(input.tags));
        }
        if (input.importance !== undefined) {
            updates.push('importance = ?');
            values.push(input.importance);
        }
        if (input.source !== undefined) {
            updates.push('source = ?');
            values.push(input.source);
        }
        if (input.confidence !== undefined) {
            updates.push('confidence = ?');
            values.push(input.confidence);
        }
        if (input.expiresAt !== undefined) {
            updates.push('expires_at = ?');
            values.push(input.expiresAt);
        }
        if (updates.length === 0) {
            return memory;
        }
        updates.push('updated_at = ?');
        values.push(now);
        values.push(input.id);
        const stmt = db.getDatabase().prepare(`
      UPDATE memories SET ${updates.join(', ')} WHERE id = ?
    `);
        stmt.run(...values);
        if (input.tags !== undefined) {
            this.syncTags(db, input.id, input.tags);
        }
        return this.getById(input.id, memory.scope);
    }
    delete(id) {
        // Try project scope first
        let db = this.getDbForScope('project');
        let stmt = db.getDatabase().prepare('DELETE FROM memories WHERE id = ?');
        let result = stmt.run(id);
        if (result.changes > 0) {
            return true;
        }
        // Try global scope
        const config = getConfigManager().load();
        if (config.memoryScope === 'project-and-global') {
            db = this.getDbForScope('global');
            stmt = db.getDatabase().prepare('DELETE FROM memories WHERE id = ?');
            result = stmt.run(id);
            return result.changes > 0;
        }
        return false;
    }
    list(options = {}) {
        const { category, scope, limit = 50 } = options;
        const config = getConfigManager().load();
        const memories = [];
        const scopes = scope
            ? [scope]
            : config.memoryScope === 'project-and-global'
                ? ['project', 'global']
                : ['project'];
        for (const s of scopes) {
            const db = this.getDbForScope(s);
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
        // Sort combined results
        memories.sort((a, b) => {
            if (a.importance !== b.importance) {
                return b.importance - a.importance;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        return memories.slice(0, limit);
    }
    getStats() {
        const projectDb = this.getDbForScope('project');
        const projectCount = projectDb.getDatabase()
            .prepare('SELECT COUNT(*) as count FROM memories WHERE project_id = ?')
            .get(this.projectId);
        let globalCount = { count: 0 };
        const config = getConfigManager().load();
        if (config.memoryScope === 'project-and-global') {
            const globalDb = this.getDbForScope('global');
            globalCount = globalDb.getDatabase()
                .prepare('SELECT COUNT(*) as count FROM memories')
                .get();
        }
        return {
            project: projectCount.count,
            global: globalCount.count,
        };
    }
    /** Mirror a memory's tags into the normalized tags / memory_tags tables. */
    syncTags(db, memoryId, tags) {
        const sqlite = db.getDatabase();
        const clear = sqlite.prepare('DELETE FROM memory_tags WHERE memory_id = ?');
        const upsertTag = sqlite.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
        const tagId = sqlite.prepare('SELECT id FROM tags WHERE name = ?');
        const link = sqlite.prepare('INSERT OR IGNORE INTO memory_tags (memory_id, tag_id) VALUES (?, ?)');
        const apply = sqlite.transaction((names) => {
            clear.run(memoryId);
            for (const raw of names) {
                const name = raw.trim();
                if (!name)
                    continue;
                upsertTag.run(name);
                const row = tagId.get(name);
                link.run(memoryId, row.id);
            }
        });
        apply(tags);
    }
    /**
     * Record that one memory replaces another: sets superseded_by_id on the old
     * memory and supersedes_id on the new one. Works across project/global scope.
     */
    supersede(oldId, newId) {
        const oldMem = this.getById(oldId, 'project') ?? this.getById(oldId, 'global');
        const newMem = this.getById(newId, 'project') ?? this.getById(newId, 'global');
        if (!oldMem || !newMem) {
            return false;
        }
        const now = new Date().toISOString();
        this.getDbForScope(oldMem.scope)
            .getDatabase()
            .prepare('UPDATE memories SET superseded_by_id = ?, updated_at = ? WHERE id = ?')
            .run(newId, now, oldId);
        this.getDbForScope(newMem.scope)
            .getDatabase()
            .prepare('UPDATE memories SET supersedes_id = ?, updated_at = ? WHERE id = ?')
            .run(oldId, now, newId);
        return true;
    }
    /**
     * Set project_path on this project's rows that are missing it (legacy memories
     * written before the column existed). Self-heals project names in the dashboard
     * the next time the server starts. Returns the number of rows fixed.
     */
    backfillProjectPath() {
        const db = this.getDbForScope('project').getDatabase();
        const res = db
            .prepare("UPDATE memories SET project_path = ? WHERE project_id = ? AND (project_path IS NULL OR project_path = '')")
            .run(this.projectPath, this.projectId);
        return res.changes;
    }
    /** Bump access_count / last_accessed for retrieved memories, grouped by scope. */
    recordAccess(accessed) {
        if (accessed.length === 0) {
            return;
        }
        const now = new Date().toISOString();
        for (const scope of ['project', 'global']) {
            const ids = accessed.filter((a) => a.scope === scope).map((a) => a.id);
            if (ids.length === 0) {
                continue;
            }
            const sqlite = this.getDbForScope(scope).getDatabase();
            const stmt = sqlite.prepare('UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?');
            const bump = sqlite.transaction((rows) => {
                for (const id of rows) {
                    stmt.run(now, id);
                }
            });
            bump(ids);
        }
    }
}
//# sourceMappingURL=memory.js.map