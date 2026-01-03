import os from 'os';
import path from 'path';
export const CONFIG_VERSION = 1;
export function getDefaultDataDir() {
    const platform = os.platform();
    const home = os.homedir();
    if (platform === 'win32') {
        return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'lumencore');
    }
    else if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'lumencore');
    }
    else {
        // Linux and others - use XDG_DATA_HOME or default
        return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'lumencore');
    }
}
export function getConfigDir() {
    const platform = os.platform();
    const home = os.homedir();
    if (platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'lumencore');
    }
    else if (platform === 'darwin') {
        return path.join(home, 'Library', 'Preferences', 'lumencore');
    }
    else {
        // Linux and others - use XDG_CONFIG_HOME or default
        return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'lumencore');
    }
}
export function getDefaultConfig() {
    return {
        memoryScope: 'project-only',
        dataDir: getDefaultDataDir(),
        defaultImportance: 3,
        maxContextTokens: 4000,
    };
}
//# sourceMappingURL=defaults.js.map