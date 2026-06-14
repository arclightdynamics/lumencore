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

interface SignalGroup {
  category: MemoryCategory;
  importance: number;
  patterns: RegExp[];
}

// Ordered by priority: the first group that matches a sentence wins.
const SIGNALS: SignalGroup[] = [
  {
    category: 'decision',
    importance: 4,
    patterns: [
      /\b(decided|we'?ll use|we chose|chose to|going with|settled on|agreed to|let'?s use|will use|opted for)\b/i,
    ],
  },
  {
    category: 'pattern',
    importance: 3,
    patterns: [
      /\b(always|never|by convention|the convention is|we follow|prefer to|should (?:always|never)|the pattern is)\b/i,
    ],
  },
  {
    category: 'task',
    importance: 3,
    patterns: [
      /\b(todo|to-do|need to|next step|follow[- ]?up|action item|remember to|we should)\b/i,
    ],
  },
  {
    category: 'concept',
    importance: 3,
    patterns: [/\b(refers to|is defined as|defined as|stands for|means that|means)\b/i],
  },
];

/**
 * Scan an exchange for sentences that look like durable knowledge and classify
 * each with a likely category. Cheap, dependency-free heuristics — the host LLM
 * does the real judgement when it confirms via `remember`.
 */
export function extractHints(text: string, limit = 8): ExtractionHint[] {
  const segments = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const hints: ExtractionHint[] = [];
  const seen = new Set<string>();

  for (const segment of segments) {
    for (const group of SIGNALS) {
      const pattern = group.patterns.find((p) => p.test(segment));
      if (!pattern) {
        continue;
      }

      const key = segment.toLowerCase();
      if (seen.has(key)) {
        break;
      }
      seen.add(key);

      const matched = segment.match(pattern);
      hints.push({
        category: group.category,
        text: segment.length > 240 ? `${segment.slice(0, 240)}…` : segment,
        signal: matched ? matched[0] : '',
        importance: group.importance,
      });
      break; // first matching category wins for this segment
    }

    if (hints.length >= limit) {
      break;
    }
  }

  return hints;
}
