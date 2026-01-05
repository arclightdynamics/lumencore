#!/usr/bin/env node
import { runSetup } from './cli/setup.js';
import { showStatus, reset, showHelp, initProject, showVersion, exportMemories } from './cli/commands.js';
import { startServer } from './server.js';
import { getConfigManager } from './config/manager.js';
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    switch (command) {
        case 'setup':
            await runSetup();
            break;
        case 'serve':
            // Auto-configure with defaults if not set up
            const configManager = getConfigManager();
            if (!configManager.isConfigured()) {
                const { getDefaultConfig } = await import('./config/defaults.js');
                configManager.save(getDefaultConfig());
            }
            // Get project path from args or environment
            const projectPath = args[1] || process.env.LUMENCORE_PROJECT || process.cwd();
            await startServer(projectPath);
            break;
        case 'init':
            initProject();
            break;
        case 'status':
            showStatus();
            break;
        case 'version':
        case '--version':
        case '-v':
            showVersion();
            break;
        case 'export':
            // Parse output option safely
            let outputPath;
            const outputEqualsArg = args.find(a => a.startsWith('--output='));
            if (outputEqualsArg) {
                outputPath = outputEqualsArg.split('=')[1];
            }
            else if (args.includes('--output')) {
                const idx = args.indexOf('--output');
                if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
                    outputPath = args[idx + 1];
                }
            }
            else if (args.includes('-o')) {
                const idx = args.indexOf('-o');
                if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
                    outputPath = args[idx + 1];
                }
            }
            const exportOptions = {
                global: args.includes('--global') || args.includes('-g'),
                all: args.includes('--all') || args.includes('-a'),
                output: outputPath,
            };
            exportMemories(exportOptions);
            break;
        case 'reset':
            const force = args.includes('--force') || args.includes('-f');
            reset(force);
            break;
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            showHelp();
            process.exit(1);
    }
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
// Re-export types and classes for programmatic usage
export { MemoryService } from './services/memory.js';
export { SearchService } from './services/search.js';
export { getConfigManager } from './config/manager.js';
export * from './types/index.js';
//# sourceMappingURL=index.js.map