import { getConfigManager } from '../config/manager.js';
import { getConfigDir, getDefaultConfig } from '../config/defaults.js';
import { MemoryService } from '../services/memory.js';
import { ProjectScanner } from '../services/scanner.js';
import { findProjectRoot } from '../utils/paths.js';
import { closeAllDatabases } from '../storage/database.js';
import { readProjectConfig, writeProjectConfig } from '../config/project.js';
import { writeInstructions, DEFAULT_INSTRUCTION_IDS } from '../install/instructions.js';
import prompts from 'prompts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Get package version
function getPackageVersion() {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const packagePath = path.join(__dirname, '..', '..', 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
        return packageJson.version || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
export function showStatus() {
    const configManager = getConfigManager();
    console.log('\n--- LumenCore Status ---\n');
    if (!configManager.isConfigured()) {
        console.log('Status: Not configured');
        console.log('\nRun "lumencore setup" to configure LumenCore.\n');
        return;
    }
    try {
        const config = configManager.load();
        console.log('Status: Configured');
        console.log(`\nConfiguration:`);
        console.log(`  Config File: ${configManager.getConfigPath()}`);
        console.log(`  Memory Scope: ${config.memoryScope}`);
        console.log(`  Data Directory: ${config.dataDir}`);
        console.log(`  Default Importance: ${config.defaultImportance}`);
        console.log(`  Max Context Tokens: ${config.maxContextTokens}`);
        // Try to get stats for current project
        const projectPath = findProjectRoot();
        const memoryService = new MemoryService(projectPath);
        const stats = memoryService.getStats();
        console.log(`\nMemory Statistics:`);
        console.log(`  Current Project: ${projectPath}`);
        console.log(`  Project Memories: ${stats.project}`);
        if (config.memoryScope === 'project-and-global') {
            console.log(`  Global Memories: ${stats.global}`);
        }
        console.log('');
    }
    catch (error) {
        console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function reset(force = false) {
    const configManager = getConfigManager();
    if (!configManager.isConfigured()) {
        console.log('LumenCore is not configured. Nothing to reset.\n');
        return;
    }
    if (!force) {
        console.log('This will delete all LumenCore data and configuration.');
        console.log('Run with --force to confirm.\n');
        return;
    }
    try {
        const config = configManager.load();
        // Close all database connections
        closeAllDatabases();
        // Delete data directory
        if (fs.existsSync(config.dataDir)) {
            fs.rmSync(config.dataDir, { recursive: true, force: true });
            console.log(`✓ Deleted data directory: ${config.dataDir}`);
        }
        // Delete config
        configManager.reset();
        console.log(`✓ Deleted configuration`);
        // Try to delete config directory if empty
        const configDir = getConfigDir();
        if (fs.existsSync(configDir)) {
            const files = fs.readdirSync(configDir);
            if (files.length === 0) {
                fs.rmdirSync(configDir);
            }
        }
        console.log('\n✓ Reset complete. Run "lumencore setup" to reconfigure.\n');
    }
    catch (error) {
        console.error(`Error during reset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
const LOGO = `
                .-=====-.
                :  \\|/  :
                : -(✦)- :
                :  /|\\  :
                '-=====-'
  ██╗     ██╗   ██╗███╗   ███╗███████╗███╗   ██╗
  ██║     ██║   ██║████╗ ████║██╔════╝████╗  ██║
  ██║     ██║   ██║██╔████╔██║█████╗  ██╔██╗ ██║
  ██║     ██║   ██║██║╚██╔╝██║██╔══╝  ██║╚██╗██║
  ███████╗╚██████╔╝██║ ╚═╝ ██║███████╗██║ ╚████║
  ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═══╝
        ██████╗ ██████╗ ██████╗ ███████╗
       ██╔════╝██╔═══██╗██╔══██╗██╔════╝
       ██║     ██║   ██║██████╔╝█████╗
       ██║     ██║   ██║██╔══██╗██╔══╝
       ╚██████╗╚██████╔╝██║  ██║███████╗
        ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
`;
export async function initProject(options = {}) {
    const projectPath = findProjectRoot();
    const claudeSettingsDir = path.join(projectPath, '.claude');
    const claudeSettingsPath = path.join(claudeSettingsDir, 'settings.local.json');
    const projectName = path.basename(projectPath);
    console.log(LOGO);
    console.log(`  Initializing LumenCore for: ${projectName}\n`);
    try {
        // 0. Per-project scope policy → .lumencore.json
        const existing = readProjectConfig(projectPath);
        let allowGlobal = options.allowGlobal;
        if (allowGlobal === undefined) {
            if (existing && typeof existing.allowGlobal === 'boolean') {
                allowGlobal = existing.allowGlobal;
            }
            else if (!options.yes && process.stdin.isTTY) {
                const res = await prompts({
                    type: 'confirm',
                    name: 'ag',
                    message: 'Allow this project to contribute to your shared GLOBAL memory? (No = local-only, recommended)',
                    initial: false,
                });
                allowGlobal = !!res.ag;
            }
            else {
                allowGlobal = false;
            }
        }
        writeProjectConfig(projectPath, { name: options.name || (existing && existing.name) || projectName, allowGlobal });
        console.log(`✓ Wrote .lumencore.json — scope: ${allowGlobal ? 'allow-global' : 'local-only'}`);
        // 1. Write the memory protocol into each agent's instructions file
        const instrIds = options.instructions && options.instructions.length ? options.instructions : DEFAULT_INSTRUCTION_IDS;
        for (const r of writeInstructions(projectPath, instrIds)) {
            console.log(`✓ ${r.action === 'unchanged' ? 'up to date' : r.action} — ${path.relative(projectPath, r.file)} (memory protocol)`);
        }
        // 2. Configure Claude settings to auto-allow LumenCore tools
        if (!fs.existsSync(claudeSettingsDir)) {
            fs.mkdirSync(claudeSettingsDir, { recursive: true });
        }
        let settings = {};
        if (fs.existsSync(claudeSettingsPath)) {
            try {
                settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
            }
            catch {
                settings = {};
            }
        }
        // Add LumenCore tools to permissions.allow (correct format for Claude Code)
        if (!settings.permissions) {
            settings.permissions = {};
        }
        const permissions = settings.permissions;
        const allowList = permissions.allow || [];
        const lumenTools = [
            'mcp__lumencore__lumencore_activate',
            'mcp__lumencore__remember',
            'mcp__lumencore__recall',
            'mcp__lumencore__forget',
            'mcp__lumencore__list_memories',
            'mcp__lumencore__init_project',
        ];
        let toolsAdded = false;
        for (const tool of lumenTools) {
            if (!allowList.includes(tool)) {
                allowList.push(tool);
                toolsAdded = true;
            }
        }
        if (toolsAdded) {
            permissions.allow = allowList;
            settings.permissions = permissions;
            fs.writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            console.log('✓ Configured Claude to auto-allow LumenCore tools.');
        }
        else {
            console.log('✓ LumenCore tools already allowed in Claude settings.');
        }
        // 3. Scan the project
        const configManager = getConfigManager();
        if (!configManager.isConfigured()) {
            configManager.save(getDefaultConfig());
        }
        const memoryService = new MemoryService(projectPath);
        try {
            memoryService.backfillProjectPath();
        }
        catch { /* ignore */ }
        const scanner = new ProjectScanner(projectPath, memoryService);
        if (!scanner.isProjectInitialized()) {
            console.log('\n  Scanning project...');
            scanner.scan().then((result) => {
                console.log(result);
                console.log('\n✓ LumenCore is now active in this project.\n');
            });
        }
        else {
            console.log('✓ Project already scanned.');
            console.log('\n✓ LumenCore is now active in this project.\n');
        }
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export function showHelp() {
    console.log(LOGO);
    console.log(`  Persistent memory for AI agents

Usage:
  lumencore <command> [options]

Commands:
  install   Detect installed AI clients and register LumenCore with each
  ui        Launch the local web dashboard (127.0.0.1:4317)
  backfill  Name legacy memories by reverse-mapping project hashes to paths
  init      Initialize LumenCore in the current project (CLAUDE.md + .lumencore.json)
  setup     Run the setup wizard
  serve     Start the MCP server (stdio, used by local clients)
  serve-http Start the networked memory API (for remote agents over LAN/Tailscale)
  status    Show current configuration and statistics
  export    Export memories to JSON file for backup/migration
  version   Show version number
  reset     Clear all data and configuration (use --force to confirm)
  help      Show this help message

Examples:
  lumencore install            # Detect AI clients & register LumenCore (interactive)
  lumencore install --list     # List supported clients and what's detected
  lumencore install --yes      # Register with all detected clients, no prompts
  lumencore install --dry-run  # Preview what would be written
  lumencore install --client cursor --global
  lumencore install --no-windows      # (on WSL) skip the Windows-client bridge
  lumencore install --share-global    # share memory across all your projects
  lumencore install --no-share-global # keep memory per-project (default)
  lumencore install --music           # play the installer jingle (off by default)
  lumencore ui                 # Open the local memory dashboard
  lumencore ui --port 5000     # Use a different port
  lumencore init               # Initialize in current project (asks scope if interactive)
  lumencore init --all-agents  # Write the memory protocol to CLAUDE.md, AGENTS.md, GEMINI.md, …
  lumencore init --local-only  # This repo never contributes to global memory (default)
  lumencore init --allow-global # Allow agents here to write shared global memories
  lumencore setup              # Configure LumenCore globally
  lumencore serve              # Start MCP server
  lumencore status             # Check configuration
  lumencore export             # Export current project memories
  lumencore reset --force      # Delete all data

Integration with Claude Code:
  lumencore install            # (recommended) auto-registers with Claude Code
  claude mcp add lumencore -- lumencore serve   # or do it manually
`);
}
export function showVersion() {
    const version = getPackageVersion();
    console.log(`lumencore v${version}`);
}
export function exportMemories(options) {
    const configManager = getConfigManager();
    if (!configManager.isConfigured()) {
        console.log('LumenCore is not configured. Run "lumencore setup" first.\n');
        return;
    }
    try {
        const projectPath = findProjectRoot();
        const memoryService = new MemoryService(projectPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const exportData = {
            exportedAt: new Date().toISOString(),
            version: getPackageVersion(),
        };
        if (options.all) {
            // Export both project and global memories
            const projectMemories = memoryService.list({ scope: 'project' });
            const globalMemories = memoryService.list({ scope: 'global' });
            exportData.project = {
                path: projectPath,
                memories: projectMemories,
            };
            exportData.global = {
                memories: globalMemories,
            };
            console.log(`Found ${projectMemories.length} project memories`);
            console.log(`Found ${globalMemories.length} global memories`);
        }
        else if (options.global) {
            // Export only global memories
            const globalMemories = memoryService.list({ scope: 'global' });
            exportData.global = {
                memories: globalMemories,
            };
            console.log(`Found ${globalMemories.length} global memories`);
        }
        else {
            // Export only current project memories (default)
            const projectMemories = memoryService.list({ scope: 'project' });
            exportData.project = {
                path: projectPath,
                memories: projectMemories,
            };
            console.log(`Found ${projectMemories.length} project memories`);
        }
        // Determine output filename
        const scope = options.all ? 'all' : options.global ? 'global' : 'project';
        const defaultFilename = `lumencore-export-${scope}-${timestamp}.json`;
        const outputPath = options.output || path.join(process.cwd(), defaultFilename);
        // Write export file
        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
        console.log(`\n✓ Exported to: ${outputPath}\n`);
    }
    catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=commands.js.map