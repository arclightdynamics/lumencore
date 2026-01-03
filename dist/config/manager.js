import fs from 'fs';
import path from 'path';
import { getConfigDir, getDefaultConfig, CONFIG_VERSION } from './defaults.js';
const CONFIG_FILE = 'config.json';
export class ConfigManager {
    configPath;
    config = null;
    constructor() {
        this.configPath = path.join(getConfigDir(), CONFIG_FILE);
    }
    isConfigured() {
        return fs.existsSync(this.configPath);
    }
    load() {
        if (this.config) {
            return this.config;
        }
        if (!this.isConfigured()) {
            throw new Error('LumenCore is not configured. Run "lumencore setup" first.');
        }
        try {
            const raw = fs.readFileSync(this.configPath, 'utf-8');
            const file = JSON.parse(raw);
            // Handle config migration if needed
            if (file.version < CONFIG_VERSION) {
                this.config = this.migrate(file);
                this.save(this.config);
            }
            else {
                this.config = file.config;
            }
            return this.config;
        }
        catch (error) {
            throw new Error(`Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    save(config) {
        const configDir = getConfigDir();
        // Ensure config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        const file = {
            version: CONFIG_VERSION,
            config,
        };
        fs.writeFileSync(this.configPath, JSON.stringify(file, null, 2), 'utf-8');
        this.config = config;
    }
    getConfigPath() {
        return this.configPath;
    }
    reset() {
        if (fs.existsSync(this.configPath)) {
            fs.unlinkSync(this.configPath);
        }
        this.config = null;
    }
    migrate(file) {
        // For now, just merge with defaults
        const defaults = getDefaultConfig();
        return {
            ...defaults,
            ...file.config,
        };
    }
}
// Singleton instance
let instance = null;
export function getConfigManager() {
    if (!instance) {
        instance = new ConfigManager();
    }
    return instance;
}
//# sourceMappingURL=manager.js.map