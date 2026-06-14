import { ServerEntry } from './types.js';
/** Are we running inside WSL? */
export declare function isWsl(): boolean;
export declare function wslDistro(): string;
/**
 * Windows user-profile dirs reachable from WSL (/mnt/c/Users/*). These let the
 * installer configure Windows-side clients to use this WSL LumenCore.
 */
export declare function windowsHomes(): string[];
/**
 * Server entry a Windows client uses to launch this WSL LumenCore over wsl.exe.
 * The client spawns it with the project as cwd; wsl.exe translates C:\proj →
 * /mnt/c/proj, so `lumencore serve` detects the right project automatically.
 */
export declare function wslServerEntry(distro: string): ServerEntry;
//# sourceMappingURL=wsl.d.ts.map