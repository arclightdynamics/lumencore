import { MemoryCategory } from '../types/index.js';
/**
 * A heuristic hint that a sentence in an exchange might be worth remembering.
 * These are *suggestions* for the host LLM to confirm — the server never decides
 * on its own what becomes a memory.
 */
export interface ExtractionHint {
    category: MemoryCategory;
    /** The sentence/snippet that looks memorable. */
    text: string;
    /** The phrase that triggered the suggestion. */
    signal: string;
    /** Heuristic importance (1-5) for the suggested category. */
    importance: number;
}
/**
 * Scan an exchange for sentences that look like durable knowledge and classify
 * each with a likely category. Cheap, dependency-free heuristics — the host LLM
 * does the real judgement when it confirms via `remember`.
 */
export declare function extractHints(text: string, limit?: number): ExtractionHint[];
//# sourceMappingURL=extraction.d.ts.map