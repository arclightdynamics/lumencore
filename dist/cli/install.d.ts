export interface InstallFlags {
    dryRun: boolean;
    yes: boolean;
    global: boolean;
    project: boolean;
    list: boolean;
    client?: string;
    noWindows?: boolean;
    noAnim?: boolean;
    /** Cross-project (global) memory sharing: true = on, false = off, undefined = ask. */
    shareGlobal?: boolean;
    /** Play the optional installer jingle (off by default). */
    music?: boolean;
    /** Override the project directory (mainly for testing). */
    cwd?: string;
}
export declare function runInstall(flags: InstallFlags): Promise<void>;
//# sourceMappingURL=install.d.ts.map