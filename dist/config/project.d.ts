/**
 * Per-project config, stored as `.lumencore.json` at the project root.
 * Commit it (or not) — it's how a repo declares its own memory policy.
 */
export interface ProjectConfig {
    /** Stable human name/id for this project — survives path moves / reclones. */
    name?: string;
    /**
     * May agents in this project write shared GLOBAL-scope memories?
     * Absent = no explicit policy (install-wide setting applies).
     * false = local-only: global writes from this project are refused.
     */
    allowGlobal?: boolean;
}
export declare function getProjectConfigPath(projectPath: string): string;
export declare function readProjectConfig(projectPath: string): ProjectConfig | null;
export declare function writeProjectConfig(projectPath: string, config: ProjectConfig): void;
/**
 * The project's global-write policy:
 *   true  → explicitly allowed
 *   false → explicitly local-only (refuse global writes)
 *   null  → no explicit policy; defer to the install-wide setting
 */
export declare function allowsGlobal(projectPath: string): boolean | null;
//# sourceMappingURL=project.d.ts.map