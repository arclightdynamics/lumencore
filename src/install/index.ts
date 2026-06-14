import fs from 'fs';
import os from 'os';
import path from 'path';
import { InstallContext, McpClient, ServerEntry } from './types.js';
import { CLIENTS, MANUAL_CLIENTS } from './clients.js';

export { CLIENTS, MANUAL_CLIENTS, SERVER_NAME } from './clients.js';
export { writeServer } from './writer.js';
export type { InstallContext, McpClient, ManualClient, ScopeTarget, ServerEntry } from './types.js';

export function buildContext(projectDir: string): InstallContext {
  return {
    projectDir: path.resolve(projectDir),
    platform: os.platform(),
    home: os.homedir(),
  };
}

export function isInstalled(client: { detectPaths: (c: InstallContext) => string[] }, ctx: InstallContext): boolean {
  return client.detectPaths(ctx).some((p) => fs.existsSync(p));
}

export function detectClients(ctx: InstallContext): McpClient[] {
  return CLIENTS.filter((c) => isInstalled(c, ctx));
}

export function detectManualClients(ctx: InstallContext) {
  return MANUAL_CLIENTS.filter((c) => isInstalled(c, ctx));
}

/** Is an executable named `name` resolvable on PATH? */
export function onPath(name: string): boolean {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      try {
        if (fs.existsSync(path.join(dir, name + ext))) return true;
      } catch {
        // ignore unreadable PATH entries
      }
    }
  }
  return false;
}

/**
 * How clients should launch the server. Prefer the globally-installed binary;
 * fall back to `npx -y lumencore serve` so install works without a global install.
 */
export function resolveServerEntry(): ServerEntry {
  if (onPath('lumencore')) {
    return { command: 'lumencore', args: ['serve'] };
  }
  return { command: 'npx', args: ['-y', 'lumencore', 'serve'] };
}
