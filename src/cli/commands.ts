import { getConfigManager } from '../config/manager.js';
import { getDefaultDataDir, getConfigDir } from '../config/defaults.js';
import { MemoryService } from '../services/memory.js';
import { findProjectRoot } from '../utils/paths.js';
import { closeAllDatabases } from '../storage/database.js';
import fs from 'fs';
import path from 'path';

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

export function showHelp(): void {
  console.log(`
LumenCore - Persistent memory for AI agents

Usage:
  lumencore <command> [options]

Commands:
  setup     Run the setup wizard
  serve     Start the MCP server (used by Claude Code)
  status    Show current configuration and statistics
  reset     Clear all data and configuration (use --force to confirm)
  help      Show this help message

Examples:
  lumencore setup              # Configure LumenCore
  lumencore serve              # Start MCP server
  lumencore status             # Check configuration
  lumencore reset --force      # Delete all data

Integration with Claude Code:
  claude mcp add lumencore -- npx lumencore serve
`);
}
