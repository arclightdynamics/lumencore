import prompts from 'prompts';
import { getConfigManager } from '../config/manager.js';
import { getDefaultConfig, getDefaultDataDir } from '../config/defaults.js';
import { ConfigMemoryScope, LumenCoreConfig } from '../types/index.js';

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

export async function runSetup(): Promise<boolean> {
  console.log(LOGO);
  console.log('  Welcome to LumenCore - Persistent memory for AI agents\n');

  const configManager = getConfigManager();
  const defaults = getDefaultConfig();

  // Check if already configured
  if (configManager.isConfigured()) {
    const { overwrite } = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'LumenCore is already configured. Overwrite existing configuration?',
      initial: false,
    });

    if (!overwrite) {
      console.log('\nSetup cancelled. Existing configuration preserved.');
      return false;
    }
  }

  // Memory scope selection
  const { memoryScope } = await prompts({
    type: 'select',
    name: 'memoryScope',
    message: 'How should LumenCore store memories?',
    choices: [
      {
        title: 'Project-only (isolated per project)',
        description: 'Each project has its own separate memory store',
        value: 'project-only',
      },
      {
        title: 'Project + Global (shared knowledge across projects)',
        description: 'Project-specific memories plus a global knowledge base',
        value: 'project-and-global',
      },
    ],
    initial: 0,
  });

  if (!memoryScope) {
    console.log('\nSetup cancelled.');
    return false;
  }

  // Data directory selection
  const defaultDataDir = getDefaultDataDir();
  const { useDefaultDir } = await prompts({
    type: 'confirm',
    name: 'useDefaultDir',
    message: `Store data in default location? (${defaultDataDir})`,
    initial: true,
  });

  let dataDir = defaultDataDir;
  if (!useDefaultDir) {
    const { customDir } = await prompts({
      type: 'text',
      name: 'customDir',
      message: 'Enter custom data directory path:',
      initial: defaultDataDir,
    });

    if (!customDir) {
      console.log('\nSetup cancelled.');
      return false;
    }
    dataDir = customDir;
  }

  // Build config
  const config: LumenCoreConfig = {
    ...defaults,
    memoryScope: memoryScope as ConfigMemoryScope,
    dataDir,
  };

  // Confirm and save
  console.log('\n--- Configuration Summary ---');
  console.log(`  Memory Scope: ${config.memoryScope}`);
  console.log(`  Data Directory: ${config.dataDir}`);
  console.log(`  Default Importance: ${config.defaultImportance}`);
  console.log(`  Max Context Tokens: ${config.maxContextTokens}`);
  console.log('');

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Save this configuration?',
    initial: true,
  });

  if (!confirm) {
    console.log('\nSetup cancelled.');
    return false;
  }

  configManager.save(config);

  console.log(`\n✓ Configuration saved to ${configManager.getConfigPath()}`);
  console.log('\n✓ Ready! Add LumenCore to Claude Code with:\n');
  console.log('  claude mcp add lumencore -- npx lumencore serve\n');

  return true;
}
