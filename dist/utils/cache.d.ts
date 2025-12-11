export declare class CacheManager<T extends object> {
    private cache;
    private enabled;
    constructor(options?: {
        maxSize?: number;
        ttl?: number;
        enabled?: boolean;
    });
    get(key: string): T | undefined;
    set(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    size(): number;
    keys(): string[];
}
export declare class PersistentEmbeddingCache {
    private cache;
    private enabled;
    private filePath;
    private saveTimer;
    private dirty;
    constructor(options?: {
        maxSize?: number;
        ttl?: number;
        enabled?: boolean;
        filePath?: string;
    });
    private loadFromDisk;
    private saveToDisk;
    private scheduleSave;
    get(key: string): number[] | undefined;
    set(key: string, value: number[]): void;
    has(key: string): boolean;
    size(): number;
    flush(): Promise<void>;
}
export declare const getEmbeddingCache: () => CacheManager<number[]>;
export declare const getPersistentEmbeddingCache: () => PersistentEmbeddingCache;
export declare const getRetrievalCache: () => CacheManager<unknown[]>;
//# sourceMappingURL=cache.d.ts.map