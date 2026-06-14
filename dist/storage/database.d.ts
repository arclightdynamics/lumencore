import Database from 'better-sqlite3';
export declare class MemoryDatabase {
    private db;
    private dbPath;
    constructor(dbPath: string);
    private initialize;
    /**
     * Add columns introduced after a database was first created. `CREATE TABLE IF
     * NOT EXISTS` never alters an existing table, so older DBs miss the columns in
     * SCHEMA until we ALTER them in here. Idempotent: only adds what's missing.
     */
    private migrate;
    getDatabase(): Database.Database;
    getPath(): string;
    close(): void;
}
export declare function getDatabase(dbPath: string): MemoryDatabase;
export declare function closeAllDatabases(): void;
//# sourceMappingURL=database.d.ts.map