import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getConfigManager } from '../config/manager.js';

export function getProjectId(projectPath: string): string {
  // Normalize the path
  const normalized = path.resolve(projectPath);

  // Create a hash of the path for a stable ID
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');

  // Return first 16 characters for a shorter ID
  return hash.substring(0, 16);
}

export function getProjectDbPath(projectPath: string): string {
  const config = getConfigManager().load();
  const projectId = getProjectId(projectPath);
  return path.join(config.dataDir, 'projects', projectId, 'memories.db');
}

export function getGlobalDbPath(): string {
  const config = getConfigManager().load();
  return path.join(config.dataDir, 'global', 'memories.db');
}

export function ensureDbDirectory(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function findProjectRoot(startPath: string = process.cwd()): string {
  let current = path.resolve(startPath);

  // Look for common project markers
  const markers = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.lumencore'];

  while (current !== path.dirname(current)) {
    for (const marker of markers) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    current = path.dirname(current);
  }

  // Fall back to start path if no project root found
  return path.resolve(startPath);
}
