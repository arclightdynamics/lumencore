import Database from 'better-sqlite3';
export declare class MemoryDatabase {
    private db;
    private dbPath;
    constructor(dbPath: string);
    private initialize;
    getDatabase(): Database.Database;
    getPath(): string;
    close(): void;
}
export declare function getDatabase(dbPath: string): MemoryDatabase;
export declare function closeAllDatabases(): void;
//# sourceMappingURL=database.d.ts.map