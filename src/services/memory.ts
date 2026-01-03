import { v4 as uuidv4 } from 'uuid';
import { Memory, CreateMemoryInput, UpdateMemoryInput, MemoryScope } from '../types/index.js';
import { getDatabase } from '../storage/database.js';
import { getProjectDbPath, getGlobalDbPath, getProjectId } from '../utils/paths.js';
import { getConfigManager } from '../config/manager.js';

export class MemoryService {
  private projectPath: string;
  private projectId: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.projectId = getProjectId(projectPath);
  }

  private getDbForScope(scope: MemoryScope) {
    if (scope === 'global') {
      return getDatabase(getGlobalDbPath());
    }
    return getDatabase(getProjectDbPath(this.projectPath));
  }

  private rowToMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      scope: row.scope as MemoryScope,
      category: row.category as Memory['category'],
      title: row.title as string,
      content: row.content as string,
      tags: JSON.parse(row.tags as string),
      importance: row.importance as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  create(input: CreateMemoryInput): Memory {
    const config = getConfigManager().load();
    const scope = input.scope || 'project';

    // Check if global scope is allowed
    if (scope === 'global' && config.memoryScope === 'project-only') {
      throw new Error('Global memories are disabled. Run "lumencore setup" to enable.');
    }

    const db = this.getDbForScope(scope);
    const now = new Date().toISOString();
    const id = uuidv4();

    const memory: Memory = {
      id,
      projectId: scope === 'global' ? 'global' : this.projectId,
      scope,
      category: input.category,
      title: input.title,
      content: input.content,
      tags: input.tags || [],
      importance: input.importance || config.defaultImportance,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = db.getDatabase().prepare(`
      INSERT INTO memories (id, project_id, scope, category, title, content, tags, importance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      memory.projectId,
      memory.scope,
      memory.category,
      memory.title,
      memory.content,
      JSON.stringify(memory.tags),
      memory.importance,
      memory.createdAt,
      memory.updatedAt
    );

    return memory;
  }

  getById(id: string, scope: MemoryScope = 'project'): Memory | null {
    const db = this.getDbForScope(scope);
    const stmt = db.getDatabase().prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) {
      // Try the other scope if not found
      const otherScope = scope === 'project' ? 'global' : 'project';
      const config = getConfigManager().load();
      if (config.memoryScope === 'project-and-global') {
        const otherDb = this.getDbForScope(otherScope);
        const otherRow = otherDb.getDatabase().prepare('SELECT * FROM memories WHERE id = ?').get(id) as Record<string, unknown> | undefined;
        if (otherRow) {
          return this.rowToMemory(otherRow);
        }
      }
      return null;
    }

    return this.rowToMemory(row);
  }

  update(input: UpdateMemoryInput): Memory | null {
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

    const updates: string[] = [];
    const values: unknown[] = [];

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

    return this.getById(input.id, memory.scope);
  }

  delete(id: string): boolean {
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

  list(options: { category?: string; scope?: MemoryScope; limit?: number } = {}): Memory[] {
    const { category, scope, limit = 50 } = options;
    const config = getConfigManager().load();
    const memories: Memory[] = [];

    const scopes: MemoryScope[] = scope
      ? [scope]
      : config.memoryScope === 'project-and-global'
      ? ['project', 'global']
      : ['project'];

    for (const s of scopes) {
      const db = this.getDbForScope(s);
      let query = 'SELECT * FROM memories WHERE 1=1';
      const params: unknown[] = [];

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
      const rows = stmt.all(...params) as Record<string, unknown>[];
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

  getStats(): { project: number; global: number } {
    const projectDb = this.getDbForScope('project');
    const projectCount = projectDb.getDatabase()
      .prepare('SELECT COUNT(*) as count FROM memories WHERE project_id = ?')
      .get(this.projectId) as { count: number };

    let globalCount = { count: 0 };
    const config = getConfigManager().load();
    if (config.memoryScope === 'project-and-global') {
      const globalDb = this.getDbForScope('global');
      globalCount = globalDb.getDatabase()
        .prepare('SELECT COUNT(*) as count FROM memories')
        .get() as { count: number };
    }

    return {
      project: projectCount.count,
      global: globalCount.count,
    };
  }
}
