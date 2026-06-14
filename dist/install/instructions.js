import fs from 'fs';
import path from 'path';
/**
 * Where each agent harness reads its project instructions. AGENTS.md is the
 * cross-agent standard (Codex, Cursor, Jules, Zed, …); the rest are per-tool.
 */
export const INSTRUCTION_TARGETS = {
    claude: { file: 'CLAUDE.md', label: 'Claude Code' },
    agents: { file: 'AGENTS.md', label: 'AGENTS.md standard (Codex, Cursor, Jules, Zed, …)' },
    gemini: { file: 'GEMINI.md', label: 'Gemini CLI' },
    copilot: { file: '.github/copilot-instructions.md', label: 'GitHub Copilot' },
    cursor: { file: '.cursor/rules/lumencore.md', label: 'Cursor (project rules)' },
    windsurf: { file: '.windsurf/rules/lumencore.md', label: 'Windsurf' },
    cline: { file: '.clinerules/lumencore.md', label: 'Cline' },
};
/** Targets written by default — the two highest-coverage files. */
export const DEFAULT_INSTRUCTION_IDS = ['claude', 'agents'];
const START = '<!-- LUMENCORE:START -->';
const END = '<!-- LUMENCORE:END -->';
/** Agent-neutral memory protocol. Drives proactive recall/remember in any harness. */
export const MEMORY_PROTOCOL = `# LumenCore — project memory

This project uses **LumenCore** for persistent memory via MCP. Use it proactively — a good session leaves this project's memory richer than it found it.

**Activate first.** At the start of every conversation, call \`lumencore_activate\` to load this project's accumulated memory (decisions, patterns, concepts, tasks).

**Recall before you act.**
- Begin any task by calling \`recall\` for the relevant feature / file / concept.
- Before assuming how something works (architecture, conventions, prior decisions), \`recall\` first instead of guessing.

**Remember as knowledge emerges (don't wait to be asked).** Call \`remember\` whenever you:
- make or learn an architectural **decision** (always include the *why*) — importance 4–5;
- establish or discover a **pattern** / convention;
- clarify a domain **concept** or term;
- hit a non-obvious **gotcha** or fix worth not rediscovering (category: note);
- define or complete a **task**.
Prefer several small, specific memories over one vague dump; add \`tags\`.

**Keep memory truthful.** If \`remember\` reports a possible conflict, resolve it with \`supersede_memory\` or \`update_memory\` rather than leaving contradictions. After a meaningful exchange you may call \`capture_turn\` to surface what's worth keeping, then confirm with \`remember\`.`;
/**
 * Write the memory protocol into a harness instructions file as a marked block,
 * preserving any surrounding user content. Idempotent: re-running replaces the
 * block between the markers rather than duplicating it.
 */
export function writeInstructionBlock(projectDir, relFile) {
    const file = path.join(projectDir, relFile);
    const block = `${START}\n${MEMORY_PROTOCOL.trim()}\n${END}`;
    const exists = fs.existsSync(file);
    let next;
    if (exists) {
        const cur = fs.readFileSync(file, 'utf-8');
        if (cur.includes(START) && cur.includes(END)) {
            const re = new RegExp(`${START}[\\s\\S]*?${END}`);
            next = cur.replace(re, block);
        }
        else {
            next = `${cur.trimEnd()}\n\n${block}\n`;
        }
        if (next === cur)
            return { file, action: 'unchanged' };
    }
    else {
        next = `${block}\n`;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf-8');
    return { file, action: exists ? 'updated' : 'created' };
}
/** Write the protocol to the given target ids (defaults to claude + agents). */
export function writeInstructions(projectDir, ids = DEFAULT_INSTRUCTION_IDS) {
    const out = [];
    for (const id of ids) {
        const target = INSTRUCTION_TARGETS[id];
        if (target)
            out.push(writeInstructionBlock(projectDir, target.file));
    }
    return out;
}
//# sourceMappingURL=instructions.js.map