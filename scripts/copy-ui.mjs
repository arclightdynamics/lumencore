// Copies static UI assets (html/css) into dist/ui after tsc compiles the .ts files.
import { cpSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'ui');
const destDir = join(root, 'dist', 'ui');

mkdirSync(destDir, { recursive: true });
for (const file of ['dashboard.html', 'lumencore.css']) {
  cpSync(join(srcDir, file), join(destDir, file));
}
console.log('✓ copied UI assets to dist/ui');
