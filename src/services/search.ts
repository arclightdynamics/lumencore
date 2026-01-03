import { Memory, MemoryScope, SearchOptions, ContextOptions } from '../types/index.js';
import { getDatabase } from '../storage/database.js';
import { getProjectDbPath, getGlobalDbPath, getProjectId } from '../utils/paths.js';
import { getConfigManager } from '../config/manager.js';

export class SearchService {
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

  search(options: SearchOptions): Memory[] {
    const { query, category, scope, limit = 10 } = options;
    const config = getConfigManager().load();
    const memories: Memory[] = [];

    const scopes: MemoryScope[] = scope
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
        const params: unknown[] = [this.escapeFtsQuery(query)];

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
          const rows = stmt.all(...params) as Record<string, unknown>[];
          memories.push(...rows.map((row) => this.rowToMemory(row)));
        } catch {
          // If FTS query fails, fall back to LIKE search
          let likeQuery = `
            SELECT * FROM memories
            WHERE (title LIKE ? OR content LIKE ? OR tags LIKE ?)
          `;
          const likeParams: unknown[] = [`%${query}%`, `%${query}%`, `%${query}%`];

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
          const rows = stmt.all(...likeParams) as Record<string, unknown>[];
          memories.push(...rows.map((row) => this.rowToMemory(row)));
        }
      } else {
        // No query, just filter
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

  getContext(options: ContextOptions = {}): string {
    const { categories, maxTokens = 4000 } = options;
    const config = getConfigManager().load();

    // Rough token estimation: ~4 chars per token
    const maxChars = maxTokens * 4;
    let output = '';
    let charCount = 0;

    const scopes: MemoryScope[] = config.memoryScope === 'project-and-global'
      ? ['project', 'global']
      : ['project'];

    for (const scope of scopes) {
      const db = this.getDbForScope(scope);

      let query = 'SELECT * FROM memories WHERE 1=1';
      const params: unknown[] = [];

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
      const rows = stmt.all(...params) as Record<string, unknown>[];

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

  private formatMemoryForContext(memory: Memory): string {
    const tags = memory.tags.length > 0 ? ` [${memory.tags.join(', ')}]` : '';
    return `## ${memory.category.toUpperCase()}: ${memory.title}${tags}\n${memory.content}\n\n`;
  }

  private escapeFtsQuery(query: string): string {
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
