import Database from 'better-sqlite3';
import { ensureDbDirectory } from '../utils/paths.js';
const SCHEMA = `
-- Main memories table
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('project', 'global')),
  category TEXT NOT NULL CHECK (category IN ('decision', 'pattern', 'concept', 'note', 'task')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
  source TEXT,
  confidence REAL,
  supersedes_id TEXT,
  superseded_by_id TEXT,
  last_accessed TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  project_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at DESC);

-- Normalized tags. The memories.tags JSON column is kept for FTS and
-- back-compat; these tables make tags independently indexable/queryable.
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS memory_tags (
  memory_id TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (memory_id, tag_id),
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag_id);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  title,
  content,
  tags,
  content=memories,
  content_rowid=rowid
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, content, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.tags);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.content, OLD.tags);
  INSERT INTO memories_fts(rowid, title, content, tags)
  VALUES (NEW.rowid, NEW.title, NEW.content, NEW.tags);
END;
`;
export class MemoryDatabase {
    db;
    dbPath;
    constructor(dbPath) {
        this.dbPath = dbPath;
        ensureDbDirectory(dbPath);
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initialize();
    }
    initialize() {
        this.db.exec(SCHEMA);
        this.migrate();
    }
    /**
     * Add columns introduced after a database was first created. `CREATE TABLE IF
     * NOT EXISTS` never alters an existing table, so older DBs miss the columns in
     * SCHEMA until we ALTER them in here. Idempotent: only adds what's missing.
     */
    migrate() {
        const columns = this.db
            .prepare('PRAGMA table_info(memories)')
            .all();
        const existing = new Set(columns.map((c) => c.name));
        const additions = {
            source: 'TEXT',
            confidence: 'REAL',
            supersedes_id: 'TEXT',
            superseded_by_id: 'TEXT',
            last_accessed: 'TEXT',
            access_count: 'INTEGER NOT NULL DEFAULT 0',
            expires_at: 'TEXT',
            project_path: 'TEXT',
        };
        for (const [name, ddl] of Object.entries(additions)) {
            if (!existing.has(name)) {
                this.db.exec(`ALTER TABLE memories ADD COLUMN ${name} ${ddl}`);
            }
        }
    }
    getDatabase() {
        return this.db;
    }
    getPath() {
        return this.dbPath;
    }
    close() {
        this.db.close();
    }
}
// Database connection cache
const databases = new Map();
export function getDatabase(dbPath) {
    if (!databases.has(dbPath)) {
        databases.set(dbPath, new MemoryDatabase(dbPath));
    }
    return databases.get(dbPath);
}
export function closeAllDatabases() {
    for (const db of databases.values()) {
        db.close();
    }
    databases.clear();
}
//# sourceMappingURL=database.js.map