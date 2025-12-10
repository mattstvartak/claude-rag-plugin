"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfigValue = exports.getConfig = exports.ConfigManager = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const types_js_1 = require("./types.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const DEFAULT_CONFIG_PATH = (0, path_1.join)(process.cwd(), 'config', 'default.json');
const USER_CONFIG_PATH = (0, path_1.join)(process.cwd(), '.claude-rag.json');
class ConfigManager {
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
        const packageConfigPath = (0, path_1.join)(__dirname, '../../config/default.json');
        if ((0, fs_1.existsSync)(packageConfigPath)) {
            const defaultConfig = JSON.parse((0, fs_1.readFileSync)(packageConfigPath, 'utf-8'));
            rawConfig = { ...defaultConfig };
        }
        else if ((0, fs_1.existsSync)(DEFAULT_CONFIG_PATH)) {
            const defaultConfig = JSON.parse((0, fs_1.readFileSync)(DEFAULT_CONFIG_PATH, 'utf-8'));
            rawConfig = { ...defaultConfig };
        }
        // Override with user config if exists
        if ((0, fs_1.existsSync)(USER_CONFIG_PATH)) {
            const userConfig = JSON.parse((0, fs_1.readFileSync)(USER_CONFIG_PATH, 'utf-8'));
            rawConfig = this.deepMerge(rawConfig, userConfig);
        }
        // Override with environment variables
        rawConfig = this.applyEnvOverrides(rawConfig);
        // Validate and return
        return types_js_1.ConfigSchema.parse(rawConfig);
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
exports.ConfigManager = ConfigManager;
const getConfig = () => ConfigManager.getInstance().getAll();
exports.getConfig = getConfig;
const getConfigValue = (key) => ConfigManager.getInstance().get(key);
exports.getConfigValue = getConfigValue;
//# sourceMappingURL=config.js.map