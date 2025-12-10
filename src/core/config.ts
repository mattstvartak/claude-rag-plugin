import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Config, ConfigSchema } from './types.js';
import dotenv from 'dotenv';

dotenv.config();

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_CONFIG_PATH = join(process.cwd(), 'config', 'default.json');
const USER_CONFIG_PATH = join(process.cwd(), '.claude-rag.json');

export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): Config {
    let rawConfig: Record<string, unknown> = {};

    // Load default config from package
    const packageConfigPath = join(__dirname, '../../config/default.json');
    if (existsSync(packageConfigPath)) {
      const defaultConfig = JSON.parse(readFileSync(packageConfigPath, 'utf-8'));
      rawConfig = { ...defaultConfig };
    } else if (existsSync(DEFAULT_CONFIG_PATH)) {
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

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        );
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
    const result = { ...config };

    // ChromaDB overrides
    if (process.env['CHROMADB_HOST']) {
      (result['chromadb'] as Record<string, unknown>)['host'] = process.env['CHROMADB_HOST'];
    }
    if (process.env['CHROMADB_PORT']) {
      (result['chromadb'] as Record<string, unknown>)['port'] = parseInt(process.env['CHROMADB_PORT'], 10);
    }
    if (process.env['CHROMADB_PERSIST_DIR']) {
      (result['chromadb'] as Record<string, unknown>)['persistDirectory'] = process.env['CHROMADB_PERSIST_DIR'];
    }

    // Logging overrides
    if (process.env['LOG_LEVEL']) {
      (result['logging'] as Record<string, unknown>)['level'] = process.env['LOG_LEVEL'];
    }

    // Cache overrides
    if (process.env['CACHE_ENABLED']) {
      (result['cache'] as Record<string, unknown>)['enabled'] = process.env['CACHE_ENABLED'] === 'true';
    }
    if (process.env['CACHE_MAX_SIZE']) {
      (result['cache'] as Record<string, unknown>)['maxSize'] = parseInt(process.env['CACHE_MAX_SIZE'], 10);
    }
    if (process.env['CACHE_TTL']) {
      (result['cache'] as Record<string, unknown>)['ttl'] = parseInt(process.env['CACHE_TTL'], 10);
    }

    return result;
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  getAll(): Config {
    return { ...this.config };
  }

  reload(): void {
    this.config = this.loadConfig();
  }
}

export const getConfig = (): Config => ConfigManager.getInstance().getAll();
export const getConfigValue = <K extends keyof Config>(key: K): Config[K] =>
  ConfigManager.getInstance().get(key);
