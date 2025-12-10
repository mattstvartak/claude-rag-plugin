import { Config } from './types.js';
export declare class ConfigManager {
    private static instance;
    private config;
    private constructor();
    static getInstance(): ConfigManager;
    private loadConfig;
    private deepMerge;
    private applyEnvOverrides;
    get<K extends keyof Config>(key: K): Config[K];
    getAll(): Config;
    reload(): void;
}
export declare const getConfig: () => Config;
export declare const getConfigValue: <K extends keyof Config>(key: K) => Config[K];
//# sourceMappingURL=config.d.ts.map