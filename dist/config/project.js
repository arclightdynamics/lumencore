import fs from 'fs';
import path from 'path';
export function getProjectConfigPath(projectPath) {
    return path.join(projectPath, '.lumencore.json');
}
export function readProjectConfig(projectPath) {
    const p = getProjectConfigPath(projectPath);
    if (!fs.existsSync(p))
        return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function writeProjectConfig(projectPath, config) {
    fs.writeFileSync(getProjectConfigPath(projectPath), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
/**
 * The project's global-write policy:
 *   true  → explicitly allowed
 *   false → explicitly local-only (refuse global writes)
 *   null  → no explicit policy; defer to the install-wide setting
 */
export function allowsGlobal(projectPath) {
    const c = readProjectConfig(projectPath);
    if (!c || typeof c.allowGlobal !== 'boolean')
        return null;
    return c.allowGlobal;
}
//# sourceMappingURL=project.js.map