import fs from 'fs';
import path from 'path';

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

export function getProjectConfigPath(projectPath: string): string {
  return path.join(projectPath, '.lumencore.json');
}

export function readProjectConfig(projectPath: string): ProjectConfig | null {
  const p = getProjectConfigPath(projectPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as ProjectConfig;
  } catch {
    return null;
  }
}

export function writeProjectConfig(projectPath: string, config: ProjectConfig): void {
  fs.writeFileSync(getProjectConfigPath(projectPath), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * The project's global-write policy:
 *   true  → explicitly allowed
 *   false → explicitly local-only (refuse global writes)
 *   null  → no explicit policy; defer to the install-wide setting
 */
export function allowsGlobal(projectPath: string): boolean | null {
  const c = readProjectConfig(projectPath);
  if (!c || typeof c.allowGlobal !== 'boolean') return null;
  return c.allowGlobal;
}
