import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ConfigSchema } from './types.js';
import dotenv from 'dotenv';
dotenv.config();
const DEFAULT_CONFIG_PATH = join(process.cwd(), 'config', 'default.json');
const USER_CONFIG_PATH = join(process.cwd(), '.claude-rag.json');
export class ConfigManager {
    static instance;
    config;
    constructor() {
        this.config = this.loadConfig();
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    loadConfig() {
        let rawConfig = {};
        // Load default config from package
        const packageConfigPath = join(__dirname, '../../config/default.json');
        if (existsSync(packageConfigPath)) {
            const defaultConfig = JSON.parse(readFileSync(packageConfigPath, 'utf-8'));
            rawConfig = { ...defaultConfig };
        }
        else if (existsSync(DEFAULT_CONFIG_PATH)) {
            const defaultConfig = JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, 'utf-8'));
            rawConfig = { ...defaultConfig };
        }
        // Override with user config if exists
        if (existsSync(USER_CONFIG_PATH)) {
            const userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf-8'));
            rawConfig = this.deepMerge(rawConfig, userConfig);
        }
        // Override with environment variables
        rawConfig = this.applyEnvOverrides(rawConfig);
        // Validate and return
        return ConfigSchema.parse(rawConfig);
    }
    deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (sourceValue &&
                typeof sourceValue === 'object' &&
                !Array.isArray(sourceValue) &&
                targetValue &&
                typeof targetValue === 'object' &&
                !Array.isArray(targetValue)) {
                result[key] = this.deepMerge(targetValue, sourceValue);
            }
            else {
                result[key] = sourceValue;
            }
        }
        return result;
    }
    applyEnvOverrides(config) {
        const result = { ...config };
        // ChromaDB overrides
        if (process.env['CHROMADB_HOST']) {
            result['chromadb']['host'] = process.env['CHROMADB_HOST'];
        }
        if (process.env['CHROMADB_PORT']) {
            result['chromadb']['port'] = parseInt(process.env['CHROMADB_PORT'], 10);
        }
        if (process.env['CHROMADB_PERSIST_DIR']) {
            result['chromadb']['persistDirectory'] = process.env['CHROMADB_PERSIST_DIR'];
        }
        // Logging overrides
        if (process.env['LOG_LEVEL']) {
            result['logging']['level'] = process.env['LOG_LEVEL'];
        }
        // Cache overrides
        if (process.env['CACHE_ENABLED']) {
            result['cache']['enabled'] = process.env['CACHE_ENABLED'] === 'true';
        }
        if (process.env['CACHE_MAX_SIZE']) {
            result['cache']['maxSize'] = parseInt(process.env['CACHE_MAX_SIZE'], 10);
        }
        if (process.env['CACHE_TTL']) {
            result['cache']['ttl'] = parseInt(process.env['CACHE_TTL'], 10);
        }
        return result;
    }
    get(key) {
        return this.config[key];
    }
    getAll() {
        return { ...this.config };
    }
    reload() {
        this.config = this.loadConfig();
    }
}
export const getConfig = () => ConfigManager.getInstance().getAll();
export const getConfigValue = (key) => ConfigManager.getInstance().get(key);
//# sourceMappingURL=config.js.map