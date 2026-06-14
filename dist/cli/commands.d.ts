export declare function showStatus(): void;
export declare function reset(force?: boolean): void;
export declare function initProject(options?: {
    allowGlobal?: boolean;
    name?: string;
    yes?: boolean;
    instructions?: string[];
}): Promise<void>;
export declare function showHelp(): void;
export declare function showVersion(): void;
export declare function exportMemories(options: {
    global?: boolean;
    all?: boolean;
    output?: string;
}): void;
//# sourceMappingURL=commands.d.ts.map