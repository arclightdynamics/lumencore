import { LumenCoreConfig } from '../types/index.js';
export declare class ConfigManager {
    private configPath;
    private config;
    constructor();
    isConfigured(): boolean;
    load(): LumenCoreConfig;
    save(config: LumenCoreConfig): void;
    getConfigPath(): string;
    reset(): void;
    private migrate;
}
export declare function getConfigManager(): ConfigManager;
//# sourceMappingURL=manager.d.ts.map