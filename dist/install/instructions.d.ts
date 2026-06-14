/**
 * Where each agent harness reads its project instructions. AGENTS.md is the
 * cross-agent standard (Codex, Cursor, Jules, Zed, …); the rest are per-tool.
 */
export declare const INSTRUCTION_TARGETS: Record<string, {
    file: string;
    label: string;
}>;
/** Targets written by default — the two highest-coverage files. */
export declare const DEFAULT_INSTRUCTION_IDS: string[];
/** Agent-neutral memory protocol. Drives proactive recall/remember in any harness. */
export declare const MEMORY_PROTOCOL = "# LumenCore \u2014 project memory\n\nThis project uses **LumenCore** for persistent memory via MCP. Use it proactively \u2014 a good session leaves this project's memory richer than it found it.\n\n**Activate first.** At the start of every conversation, call `lumencore_activate` to load this project's accumulated memory (decisions, patterns, concepts, tasks).\n\n**Recall before you act.**\n- Begin any task by calling `recall` for the relevant feature / file / concept.\n- Before assuming how something works (architecture, conventions, prior decisions), `recall` first instead of guessing.\n\n**Remember as knowledge emerges (don't wait to be asked).** Call `remember` whenever you:\n- make or learn an architectural **decision** (always include the *why*) \u2014 importance 4\u20135;\n- establish or discover a **pattern** / convention;\n- clarify a domain **concept** or term;\n- hit a non-obvious **gotcha** or fix worth not rediscovering (category: note);\n- define or complete a **task**.\nPrefer several small, specific memories over one vague dump; add `tags`.\n\n**Keep memory truthful.** If `remember` reports a possible conflict, resolve it with `supersede_memory` or `update_memory` rather than leaving contradictions. After a meaningful exchange you may call `capture_turn` to surface what's worth keeping, then confirm with `remember`.";
export interface InstructionResult {
    file: string;
    action: 'created' | 'updated' | 'unchanged';
}
/**
 * Write the memory protocol into a harness instructions file as a marked block,
 * preserving any surrounding user content. Idempotent: re-running replaces the
 * block between the markers rather than duplicating it.
 */
export declare function writeInstructionBlock(projectDir: string, relFile: string): InstructionResult;
/** Write the protocol to the given target ids (defaults to claude + agents). */
export declare function writeInstructions(projectDir: string, ids?: string[]): InstructionResult[];
//# sourceMappingURL=instructions.d.ts.map