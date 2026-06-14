export interface SplashItem {
    label: string;
}
export type SplashScope = 'project-only' | 'project-and-global';
export interface SplashResult {
    cancelled: boolean;
    summary: string[];
    /** The memory scope chosen on the first step, or null if that step was skipped. */
    scope: SplashScope | null;
}
/**
 * Run the animated installer. `items` are the candidate (client, host) actions;
 * `write(i)` performs the real write for item i and returns a summary line.
 * When `opts.askScope` is set, a memory-scope step precedes client selection.
 */
export declare function animatedInstall(items: SplashItem[], opts: {
    dryRun: boolean;
    askScope?: boolean;
}, write: (index: number) => string): Promise<SplashResult>;
//# sourceMappingURL=splash.d.ts.map