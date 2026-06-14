import path from 'path';
export const SERVER_NAME = 'lumencore';
// ---------------------------------------------------------------------------
// Platform path helpers
// ---------------------------------------------------------------------------
/** App-data root: mac ~/Library/Application Support, win %APPDATA%, linux ~/.config */
function appSupport(ctx) {
    if (ctx.platform === 'win32') {
        return process.env.APPDATA || path.join(ctx.home, 'AppData', 'Roaming');
    }
    if (ctx.platform === 'darwin') {
        return path.join(ctx.home, 'Library', 'Application Support');
    }
    return process.env.XDG_CONFIG_HOME || path.join(ctx.home, '.config');
}
/** XDG-style config root: mac/linux ~/.config, win %APPDATA% */
function xdgConfig(ctx) {
    if (ctx.platform === 'win32') {
        return process.env.APPDATA || path.join(ctx.home, 'AppData', 'Roaming');
    }
    return process.env.XDG_CONFIG_HOME || path.join(ctx.home, '.config');
}
/** VS Code per-user dir (also the root for extension globalStorage). */
function vscodeUser(ctx) {
    return path.join(appSupport(ctx), 'Code', 'User');
}
function home(ctx, ...sub) {
    return path.join(ctx.home, ...sub);
}
function claudeDesktopConfig(ctx) {
    if (ctx.platform === 'darwin') {
        return path.join(ctx.home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    if (ctx.platform === 'win32') {
        return path.join(appSupport(ctx), 'Claude', 'claude_desktop_config.json');
    }
    return path.join(xdgConfig(ctx), 'Claude', 'claude_desktop_config.json'); // unofficial on Linux
}
function zedSettings(ctx) {
    if (ctx.platform === 'win32') {
        return path.join(appSupport(ctx), 'Zed', 'settings.json');
    }
    return path.join(xdgConfig(ctx), 'zed', 'settings.json');
}
function gooseConfig(ctx) {
    if (ctx.platform === 'win32') {
        return path.join(appSupport(ctx), 'Block', 'goose', 'config', 'config.yaml');
    }
    return path.join(xdgConfig(ctx), 'goose', 'config.yaml');
}
// ---------------------------------------------------------------------------
// The registry — every auto-configurable JSON client
// ---------------------------------------------------------------------------
export const CLIENTS = [
    {
        id: 'claude-code',
        name: 'Claude Code',
        detectPaths: (c) => [home(c, '.claude.json'), home(c, '.claude')],
        targets: (c) => [
            {
                scope: 'project',
                label: '~/.claude.json — local (private to you, this repo only)',
                file: home(c, '.claude.json'),
                format: 'json',
                nestPath: ['projects', c.projectDir, 'mcpServers'],
                needsType: false,
            },
            {
                scope: 'project',
                label: '.mcp.json — shared (committed to the repo)',
                file: path.join(c.projectDir, '.mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: true,
            },
            {
                scope: 'global',
                label: '~/.claude.json — user (all your projects)',
                file: home(c, '.claude.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'claude-desktop',
        name: 'Claude Desktop',
        detectPaths: (c) => [path.dirname(claudeDesktopConfig(c))],
        targets: (c) => [
            {
                scope: 'global',
                label: 'claude_desktop_config.json',
                file: claudeDesktopConfig(c),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
        note: 'Restart Claude Desktop to pick up the new server. (No official Linux build.)',
    },
    {
        id: 'cursor',
        name: 'Cursor',
        detectPaths: (c) => [home(c, '.cursor')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.cursor/mcp.json — this repo',
                file: path.join(c.projectDir, '.cursor', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: true,
            },
            {
                scope: 'global',
                label: '~/.cursor/mcp.json — all projects',
                file: home(c, '.cursor', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: true,
            },
        ],
    },
    {
        id: 'cline',
        name: 'Cline (VS Code)',
        detectPaths: (c) => [path.join(vscodeUser(c), 'globalStorage', 'saoudrizwan.claude-dev')],
        targets: (c) => [
            {
                scope: 'global',
                label: 'cline_mcp_settings.json',
                file: path.join(vscodeUser(c), 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'roo-code',
        name: 'Roo Code (VS Code)',
        detectPaths: (c) => [path.join(vscodeUser(c), 'globalStorage', 'rooveterinaryinc.roo-cline')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.roo/mcp.json — this repo',
                file: path.join(c.projectDir, '.roo', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: 'mcp_settings.json',
                file: path.join(vscodeUser(c), 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'windsurf',
        name: 'Windsurf',
        detectPaths: (c) => [home(c, '.codeium', 'windsurf')],
        targets: (c) => [
            {
                scope: 'global',
                label: '~/.codeium/windsurf/mcp_config.json',
                file: home(c, '.codeium', 'windsurf', 'mcp_config.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'vscode',
        name: 'VS Code / Copilot',
        detectPaths: (c) => [vscodeUser(c)],
        targets: (c) => [
            {
                scope: 'project',
                label: '.vscode/mcp.json — this repo',
                file: path.join(c.projectDir, '.vscode', 'mcp.json'),
                format: 'json',
                nestPath: ['servers'],
                needsType: true,
            },
            {
                scope: 'global',
                label: 'VS Code user mcp.json',
                file: path.join(vscodeUser(c), 'mcp.json'),
                format: 'json',
                nestPath: ['servers'],
                needsType: true,
            },
        ],
        note: 'VS Code uses the "servers" key (not "mcpServers").',
    },
    {
        id: 'zed',
        name: 'Zed',
        detectPaths: (c) => [path.dirname(zedSettings(c))],
        targets: (c) => [
            {
                scope: 'project',
                label: '.zed/settings.json — this repo',
                file: path.join(c.projectDir, '.zed', 'settings.json'),
                format: 'json',
                nestPath: ['context_servers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: 'Zed settings.json',
                file: zedSettings(c),
                format: 'json',
                nestPath: ['context_servers'],
                needsType: false,
            },
        ],
        note: 'Zed settings.json is JSONC; comments are dropped on write (a .bak is kept).',
    },
    {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        detectPaths: (c) => [home(c, '.gemini')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.gemini/settings.json — this repo',
                file: path.join(c.projectDir, '.gemini', 'settings.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.gemini/settings.json',
                file: home(c, '.gemini', 'settings.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'lm-studio',
        name: 'LM Studio',
        detectPaths: (c) => [home(c, '.lmstudio')],
        targets: (c) => [
            {
                scope: 'global',
                label: '~/.lmstudio/mcp.json',
                file: home(c, '.lmstudio', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'junie',
        name: 'Junie (JetBrains)',
        detectPaths: (c) => [home(c, '.junie')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.junie/mcp/mcp.json — this repo',
                file: path.join(c.projectDir, '.junie', 'mcp', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.junie/mcp/mcp.json',
                file: home(c, '.junie', 'mcp', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'amazon-q',
        name: 'Amazon Q Developer',
        detectPaths: (c) => [home(c, '.aws', 'amazonq')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.amazonq/mcp.json — this repo',
                file: path.join(c.projectDir, '.amazonq', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.aws/amazonq/mcp.json',
                file: home(c, '.aws', 'amazonq', 'mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'warp',
        name: 'Warp',
        detectPaths: (c) => [home(c, '.warp')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.warp/.mcp.json — this repo',
                file: path.join(c.projectDir, '.warp', '.mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.warp/.mcp.json',
                file: home(c, '.warp', '.mcp.json'),
                format: 'json',
                nestPath: ['mcpServers'],
                needsType: false,
            },
        ],
        note: 'Warp is largely UI-managed; you may need to confirm the import in-app.',
    },
    {
        id: 'codex',
        name: 'OpenAI Codex CLI',
        detectPaths: (c) => [home(c, '.codex')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.codex/config.toml — this repo',
                file: path.join(c.projectDir, '.codex', 'config.toml'),
                format: 'toml',
                nestPath: ['mcp_servers'],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.codex/config.toml',
                file: home(c, '.codex', 'config.toml'),
                format: 'toml',
                nestPath: ['mcp_servers'],
                needsType: false,
            },
        ],
    },
    {
        id: 'goose',
        name: 'Goose',
        detectPaths: (c) => [path.dirname(gooseConfig(c))],
        targets: (c) => [
            {
                scope: 'global',
                label: 'Goose config.yaml',
                file: gooseConfig(c),
                format: 'yaml',
                nestPath: ['extensions'],
                needsType: false,
            },
        ],
        note: 'Goose config.yaml is YAML; the extension uses the "cmd" key.',
    },
    {
        id: 'continue',
        name: 'Continue.dev',
        detectPaths: (c) => [home(c, '.continue')],
        targets: (c) => [
            {
                scope: 'project',
                label: '.continue/mcpServers/lumencore.yaml — this repo',
                file: path.join(c.projectDir, '.continue', 'mcpServers', 'lumencore.yaml'),
                format: 'continue-block',
                nestPath: [],
                needsType: false,
            },
            {
                scope: 'global',
                label: '~/.continue/mcpServers/lumencore.yaml',
                file: home(c, '.continue', 'mcpServers', 'lumencore.yaml'),
                format: 'continue-block',
                nestPath: [],
                needsType: false,
            },
        ],
    },
];
// ---------------------------------------------------------------------------
// Detected-but-manual clients (shown with guidance, never auto-written)
// ---------------------------------------------------------------------------
export const MANUAL_CLIENTS = [
    {
        id: 'witsy',
        name: 'Witsy',
        detectPaths: (c) => [path.join(appSupport(c), 'Witsy')],
        reason: 'Settings are app-managed; add LumenCore via Witsy’s MCP settings UI.',
    },
    {
        id: 'cherry-studio',
        name: 'Cherry Studio',
        detectPaths: (c) => [path.join(appSupport(c), 'CherryStudio')],
        reason: 'Config lives in app state (no file); use Cherry Studio’s “Import from JSON”.',
    },
];
//# sourceMappingURL=clients.js.map