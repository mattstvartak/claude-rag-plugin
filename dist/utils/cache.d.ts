export declare class CacheManager<T> {
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
export declare const getEmbeddingCache: () => CacheManager<number[]>;
export declare const getRetrievalCache: () => CacheManager<unknown>;
//# sourceMappingURL=cache.d.ts.map