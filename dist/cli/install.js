import prompts from 'prompts';
import { buildContext, detectClients, detectManualClients, resolveServerEntry, writeServer, CLIENTS, MANUAL_CLIENTS, SERVER_NAME, isInstalled, } from '../install/index.js';
import { isWsl, wslDistro, windowsHomes, wslServerEntry } from '../install/wsl.js';
import { animatedInstall } from '../install/splash.js';
import { getConfigManager } from '../config/manager.js';
import { getDefaultConfig } from '../config/defaults.js';
import { playJingle, playSuccess } from '../install/sound.js';
function pickTarget(targets, flags) {
    if (flags.global)
        return targets.find((t) => t.scope === 'global') ?? targets[0];
    if (flags.project)
        return targets.find((t) => t.scope === 'project') ?? targets[0];
    return targets[0]; // recommended default
}
function windowsContexts(projectDir) {
    return windowsHomes().map((home) => ({ projectDir, platform: 'win32', home }));
}
/** Every (client, host) install action available in this environment. */
function gatherActions(ctx, flags) {
    const actions = [];
    const filter = (cs) => (flags.client ? cs.filter((c) => c.id === flags.client) : cs);
    // Local (WSL/Linux/mac) clients
    const localEntry = resolveServerEntry();
    for (const client of filter(detectClients(ctx))) {
        actions.push({ client, host: 'local', label: client.name, target: pickTarget(client.targets(ctx), flags), entry: localEntry });
    }
    // Windows-side clients, bridged through wsl.exe to this same WSL brain
    if (isWsl() && !flags.noWindows) {
        const winEntry = wslServerEntry(wslDistro());
        for (const winCtx of windowsContexts(ctx.projectDir)) {
            for (const client of filter(detectClients(winCtx))) {
                const globals = client.targets(winCtx).filter((t) => t.scope === 'global');
                if (globals.length === 0)
                    continue; // project-scope is meaningless for a Windows client from WSL
                actions.push({ client, host: 'windows', label: `${client.name}  (Windows → WSL)`, target: globals[0], entry: winEntry });
            }
        }
    }
    return actions;
}
function printList(ctx) {
    console.log('\nLumenCore — supported MCP clients\n');
    for (const client of CLIENTS) {
        console.log(`  ${isInstalled(client, ctx) ? '✓ detected ' : '  not found'}  ${client.name}`);
    }
    if (isWsl()) {
        console.log('\nWindows-side (via WSL bridge):');
        const winCtxs = windowsContexts(ctx.projectDir);
        if (winCtxs.length === 0)
            console.log('  (no Windows user profiles found under /mnt/c/Users)');
        for (const winCtx of winCtxs) {
            const found = CLIENTS.filter((c) => isInstalled(c, winCtx));
            console.log(`  ${winCtx.home}: ${found.length ? found.map((c) => c.name).join(', ') : '(none)'}`);
        }
    }
    console.log('\nManual / coming soon:');
    for (const m of MANUAL_CLIENTS)
        console.log(`  • ${m.name} — ${m.reason}`);
    console.log('');
}
/** Memory scope pinned by an explicit flag, or null when we should ask. */
function scopeFromFlags(flags) {
    if (flags.shareGlobal === true)
        return 'project-and-global';
    if (flags.shareGlobal === false)
        return 'project-only';
    return null;
}
/**
 * The plain-installer (non-animated) version of the scope question — Step 1,
 * asked before clients are chosen. Returns null when running non-interactively.
 */
async function promptMemoryScope(flags) {
    if (flags.yes || !process.stdin.isTTY)
        return null;
    const res = await prompts({
        type: 'select',
        name: 'scope',
        message: 'Step 1 of 2 — Share memory across all your projects?',
        hint: ' ',
        choices: [
            {
                title: 'Per-project  —  each repo keeps its own memory (default)',
                description: 'Isolated. Opt a project in later with "lumencore init --allow-global".',
                value: 'project-only',
            },
            {
                title: 'Share globally  —  learnings from one project help the others',
                description: 'A shared global store; new projects can leverage what you discovered elsewhere.',
                value: 'project-and-global',
            },
        ],
        initial: 0,
    });
    return res.scope ?? null;
}
/** Persist the chosen memory scope into the install-wide config (no-op on dry run). */
function applyMemoryScope(scope, dryRun) {
    if (dryRun)
        return;
    const cm = getConfigManager();
    const cfg = cm.isConfigured() ? cm.load() : getDefaultConfig();
    cfg.memoryScope = scope;
    cm.save(cfg);
}
export async function runInstall(flags) {
    const ctx = buildContext(flags.cwd ?? process.cwd());
    if (flags.list) {
        printList(ctx);
        return;
    }
    if (flags.client && !CLIENTS.find((c) => c.id === flags.client)) {
        console.error(`Unknown client "${flags.client}". Run "lumencore install --list" to see options.`);
        return;
    }
    const actions = gatherActions(ctx, flags);
    if (actions.length === 0) {
        console.log('\n  No supported MCP clients detected.');
        console.log('  Run "lumencore install --list" to see what LumenCore can configure.\n');
        return;
    }
    // Step 1 of the wizard is the memory-scope question; a flag can pin it up front.
    let memoryScope = scopeFromFlags(flags);
    if (flags.music)
        playJingle();
    const writeOne = (a) => {
        try {
            const r = writeServer(a.target, SERVER_NAME, a.entry, { dryRun: flags.dryRun });
            const verb = flags.dryRun ? 'would write' : r.alreadyPresent ? 'already set' : r.created ? 'created' : 'updated';
            return `  ✓  ${a.label}: ${verb} → ${r.file}${r.backedUp ? `  (backup: ${r.backedUp})` : ''}`;
        }
        catch (err) {
            return `  ✗  ${a.label}: ${err instanceof Error ? err.message : 'error'} (left unchanged)`;
        }
    };
    const footer = () => {
        if (flags.music)
            playSuccess();
        const manual = detectManualClients(ctx);
        if (manual.length > 0) {
            console.log('\n  Detected but not auto-configured:');
            for (const m of manual)
                console.log(`  • ${m.name} — ${m.reason}`);
        }
        if (memoryScope) {
            const desc = memoryScope === 'project-and-global'
                ? 'shared across all your projects'
                : 'per-project (isolated)';
            console.log(`\n  Memory scope: ${desc}${flags.dryRun ? '  (dry run — not saved)' : ''}`);
        }
        console.log('\n  Done. Restart the client(s) to load LumenCore.');
        console.log('  Tip: "lumencore init" writes the memory protocol to CLAUDE.md / AGENTS.md.\n');
    };
    // Animated installer on a real terminal; safe fallback to plain on any error.
    const animate = !flags.yes && !flags.client && !flags.global && !flags.project && !flags.noAnim && !!process.stdin.isTTY && !!process.stdout.isTTY;
    if (animate) {
        try {
            const res = await animatedInstall(actions.map((a) => ({ label: a.label })), { dryRun: flags.dryRun, askScope: memoryScope === null }, (i) => writeOne(actions[i]));
            if (res.cancelled) {
                console.log('\n  Cancelled — nothing written.\n');
                return;
            }
            if (res.scope)
                memoryScope = res.scope;
            if (memoryScope)
                applyMemoryScope(memoryScope, flags.dryRun);
            console.log('  Results:');
            console.log(res.summary.join('\n'));
            footer();
            return;
        }
        catch {
            // fall through to the plain installer
        }
    }
    // Plain installer
    console.log('\n  LumenCore installer\n');
    console.log(`  Directory: ${ctx.projectDir}`);
    if (isWsl() && !flags.noWindows)
        console.log(`  Environment: WSL (${wslDistro()}) — Windows clients can share this brain via wsl.exe`);
    if (flags.dryRun)
        console.log('  (dry run — no files will be written)');
    console.log('');
    // Step 1 — memory scope, asked before clients (unless a flag already pinned it).
    if (memoryScope === null)
        memoryScope = await promptMemoryScope(flags);
    if (memoryScope)
        applyMemoryScope(memoryScope, flags.dryRun);
    let chosen = actions;
    const interactive = !flags.yes && !flags.client && !flags.global && !flags.project && !!process.stdin.isTTY;
    if (interactive) {
        const res = await prompts({
            type: 'multiselect',
            name: 'sel',
            message: 'Select the clients to connect to LumenCore',
            instructions: false,
            choices: actions.map((a, i) => ({ title: `${a.label}  →  ${a.target.label}`, value: i, selected: true })),
        });
        if (!res.sel || res.sel.length === 0) {
            console.log('\n  Nothing selected.\n');
            return;
        }
        chosen = res.sel.map((i) => actions[i]);
    }
    console.log('  Results:');
    console.log(chosen.map(writeOne).join('\n'));
    footer();
}
//# sourceMappingURL=install.js.map