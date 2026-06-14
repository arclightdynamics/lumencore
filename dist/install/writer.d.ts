import { ScopeTarget, ServerEntry } from './types.js';
/**
 * Strip // line and block comments from JSONC, ignoring those inside strings,
 * and drop trailing commas — enough to JSON.parse a VS Code / Zed settings file.
 */
export declare function stripJsonComments(input: string): string;
export interface WriteResult {
    file: string;
    created: boolean;
    backedUp: string | null;
    /** True if the file already matched the desired output (no change). */
    alreadyPresent: boolean;
}
/** Merge the lumencore server into a client config, dispatching by format. */
export declare function writeServer(target: ScopeTarget, name: string, entry: ServerEntry, opts: {
    dryRun: boolean;
}): WriteResult;
//# sourceMappingURL=writer.d.ts.map