#!/usr/bin/env node
import { runSetup } from './cli/setup.js';
import { showStatus, reset, showHelp, initProject, showVersion, exportMemories } from './cli/commands.js';
import { runInstall } from './cli/install.js';
import { runUi } from './cli/ui.js';
import { runServeHttp } from './cli/serve-http.js';
import { runBackfill } from './cli/backfill.js';
import { startServer } from './server.js';
import { getConfigManager } from './config/manager.js';
function getFlagValue(args, flag) {
    const eq = args.find((a) => a.startsWith(`${flag}=`));
    if (eq)
        return eq.split('=').slice(1).join('=');
    const idx = args.indexOf(flag);
    if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('-')) {
        return args[idx + 1];
    }
    return undefined;
}
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
        case 'init': {
            const { INSTRUCTION_TARGETS } = await import('./install/instructions.js');
            const instr = getFlagValue(args, '--instructions');
            await initProject({
                allowGlobal: args.includes('--allow-global') ? true : args.includes('--local-only') ? false : undefined,
                name: getFlagValue(args, '--name'),
                yes: args.includes('--yes') || args.includes('-y'),
                instructions: args.includes('--all-agents')
                    ? Object.keys(INSTRUCTION_TARGETS)
                    : instr
                        ? instr.split(',').map((s) => s.trim()).filter(Boolean)
                        : undefined,
            });
            break;
        }
        case 'install':
            await runInstall({
                dryRun: args.includes('--dry-run'),
                yes: args.includes('--yes') || args.includes('-y'),
                global: args.includes('--global'),
                project: args.includes('--project'),
                list: args.includes('--list'),
                client: getFlagValue(args, '--client'),
                noWindows: args.includes('--no-windows'),
                noAnim: args.includes('--no-anim'),
                shareGlobal: args.includes('--share-global')
                    ? true
                    : args.includes('--no-share-global')
                        ? false
                        : undefined,
                music: args.includes('--music'),
            });
            break;
        case 'ui': {
            const portStr = getFlagValue(args, '--port');
            await runUi({
                port: portStr ? parseInt(portStr, 10) : undefined,
                host: getFlagValue(args, '--host'),
            });
            break;
        }
        case 'serve-http': {
            const portStr = getFlagValue(args, '--port');
            await runServeHttp({
                host: getFlagValue(args, '--host'),
                port: portStr ? parseInt(portStr, 10) : undefined,
                token: getFlagValue(args, '--token'),
            });
            break;
        }
        case 'backfill':
            runBackfill({
                dryRun: args.includes('--dry-run'),
                paths: args.slice(1).filter((a) => !a.startsWith('-')),
            });
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