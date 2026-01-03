import { MemoryService } from './memory.js';
export declare class ProjectScanner {
    private projectPath;
    private memoryService;
    constructor(projectPath: string, memoryService: MemoryService);
    scan(): Promise<string>;
    isProjectInitialized(): boolean;
    private getDirectoryStructure;
    private readFileSafe;
    private summarizeFile;
    private detectTechStack;
}
//# sourceMappingURL=scanner.d.ts.map