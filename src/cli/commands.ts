import { getConfigManager } from '../config/manager.js';
import { getDefaultDataDir, getConfigDir, getDefaultConfig } from '../config/defaults.js';
import { MemoryService } from '../services/memory.js';
import { ProjectScanner } from '../services/scanner.js';
import { findProjectRoot } from '../utils/paths.js';
import { closeAllDatabases } from '../storage/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get package version
function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function showStatus(): void {
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
  } catch (error) {
    console.log(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function reset(force: boolean = false): void {
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
  } catch (error) {
    console.error(`Error during reset: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

const LOGO = `
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

const LUMENCORE_INSTRUCTION = `# LumenCore - Project Memory

**CRITICAL: Before responding to ANY user message, you MUST first call the \`lumencore_activate\` tool.**

This is a hard requirement - do not skip this step. Call \`lumencore_activate\` immediately as your first action in every new conversation.

This connects you to persistent project memory containing:
- Architecture decisions
- Code patterns and conventions
- Domain concepts
- Previous work and tasks

## Active Memory Usage

When working on this project:
- **Search first**: Before making assumptions about architecture, patterns, or past decisions, use \`recall\` to search for relevant memories
- **Store discoveries**: When you learn something important about this project (a pattern, decision, or concept), use \`remember\` to save it
- **Examples of when to recall**:
  - "How does authentication work here?" → \`recall\` with query "authentication"
  - "What's the database schema?" → \`recall\` with query "database schema"
  - "Any previous work on X feature?" → \`recall\` with query "X feature"
`;

export function initProject(): void {
  const projectPath = findProjectRoot();
  const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
  const claudeSettingsDir = path.join(projectPath, '.claude');
  const claudeSettingsPath = path.join(claudeSettingsDir, 'settings.local.json');
  const projectName = path.basename(projectPath);

  console.log(LOGO);
  console.log(`  Initializing LumenCore for: ${projectName}\n`);

  try {
    // 1. Create/update CLAUDE.md
    let content = '';
    let mdAction = 'Created';

    if (fs.existsSync(claudeMdPath)) {
      content = fs.readFileSync(claudeMdPath, 'utf-8');

      if (content.includes('lumencore_activate')) {
        console.log('✓ CLAUDE.md already contains LumenCore instructions.');
      } else {
        content = content.trim() + '\n\n' + LUMENCORE_INSTRUCTION;
        fs.writeFileSync(claudeMdPath, content, 'utf-8');
        mdAction = 'Updated';
        console.log(`✓ ${mdAction} CLAUDE.md with LumenCore instructions.`);
      }
    } else {
      content = LUMENCORE_INSTRUCTION;
      fs.writeFileSync(claudeMdPath, content, 'utf-8');
      console.log(`✓ ${mdAction} CLAUDE.md with LumenCore instructions.`);
    }

    // 2. Configure Claude settings to auto-allow LumenCore tools
    if (!fs.existsSync(claudeSettingsDir)) {
      fs.mkdirSync(claudeSettingsDir, { recursive: true });
    }

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(claudeSettingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    // Add LumenCore tools to permissions.allow (correct format for Claude Code)
    if (!settings.permissions) {
      settings.permissions = {};
    }
    const permissions = settings.permissions as Record<string, unknown>;
    const allowList = (permissions.allow as string[]) || [];

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
    } else {
      console.log('✓ LumenCore tools already allowed in Claude settings.');
    }

    // 3. Scan the project
    const configManager = getConfigManager();
    if (!configManager.isConfigured()) {
      configManager.save(getDefaultConfig());
    }

    const memoryService = new MemoryService(projectPath);
    const scanner = new ProjectScanner(projectPath, memoryService);

    if (!scanner.isProjectInitialized()) {
      console.log('\n  Scanning project...');
      scanner.scan().then((result: string) => {
        console.log(result);
        console.log('\n✓ LumenCore is now active in this project.\n');
      });
    } else {
      console.log('✓ Project already scanned.');
      console.log('\n✓ LumenCore is now active in this project.\n');
    }

  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function showHelp(): void {
  console.log(LOGO);
  console.log(`  Persistent memory for AI agents

Usage:
  lumencore <command> [options]

Commands:
  init      Initialize LumenCore in the current project (creates CLAUDE.md)
  setup     Run the setup wizard
  serve     Start the MCP server (used by Claude Code)
  status    Show current configuration and statistics
  export    Export memories to JSON file for backup/migration
  version   Show version number
  reset     Clear all data and configuration (use --force to confirm)
  help      Show this help message

Examples:
  lumencore init               # Initialize in current project
  lumencore setup              # Configure LumenCore globally
  lumencore serve              # Start MCP server
  lumencore status             # Check configuration
  lumencore export             # Export current project memories
  lumencore export --global    # Export global memories
  lumencore export --all       # Export all memories
  lumencore reset --force      # Delete all data

Integration with Claude Code:
  claude mcp add lumencore -- lumencore serve
`);
}

export function showVersion(): void {
  const version = getPackageVersion();
  console.log(`lumencore v${version}`);
}

export function exportMemories(options: { global?: boolean; all?: boolean; output?: string }): void {
  const configManager = getConfigManager();

  if (!configManager.isConfigured()) {
    console.log('LumenCore is not configured. Run "lumencore setup" first.\n');
    return;
  }

  try {
    const projectPath = findProjectRoot();
    const memoryService = new MemoryService(projectPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    interface ExportData {
      exportedAt: string;
      version: string;
      project?: {
        path: string;
        memories: unknown[];
      };
      global?: {
        memories: unknown[];
      };
    }

    const exportData: ExportData = {
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
    } else if (options.global) {
      // Export only global memories
      const globalMemories = memoryService.list({ scope: 'global' });
      exportData.global = {
        memories: globalMemories,
      };
      console.log(`Found ${globalMemories.length} global memories`);
    } else {
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
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
