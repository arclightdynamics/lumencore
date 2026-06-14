import fs from 'fs';
import path from 'path';
/** Are we running inside WSL? */
export function isWsl() {
    if (process.env.LUMENCORE_FORCE_WSL === '1')
        return true; // test/override hook
    if (process.env.WSL_DISTRO_NAME)
        return true;
    try {
        return /microsoft/i.test(fs.readFileSync('/proc/version', 'utf-8'));
    }
    catch {
        return false;
    }
}
export function wslDistro() {
    return process.env.WSL_DISTRO_NAME || 'Ubuntu';
}
/**
 * Windows user-profile dirs reachable from WSL (/mnt/c/Users/*). These let the
 * installer configure Windows-side clients to use this WSL LumenCore.
 */
export function windowsHomes() {
    const override = process.env.LUMENCORE_WIN_HOMES;
    if (override)
        return override.split(':').filter(Boolean);
    const usersDir = '/mnt/c/Users';
    if (!fs.existsSync(usersDir))
        return [];
    const skip = new Set(['Public', 'Default', 'Default User', 'All Users', 'defaultuser0', 'desktop.ini']);
    const out = [];
    for (const name of fs.readdirSync(usersDir)) {
        if (skip.has(name))
            continue;
        const dir = path.join(usersDir, name);
        try {
            if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'AppData')))
                out.push(dir);
        }
        catch {
            // unreadable profile — skip
        }
    }
    return out;
}
/**
 * Server entry a Windows client uses to launch this WSL LumenCore over wsl.exe.
 * The client spawns it with the project as cwd; wsl.exe translates C:\proj →
 * /mnt/c/proj, so `lumencore serve` detects the right project automatically.
 */
export function wslServerEntry(distro) {
    return { command: 'wsl.exe', args: ['-d', distro, 'bash', '-lc', 'lumencore serve'] };
}
//# sourceMappingURL=wsl.js.map