import { LRUCache } from 'lru-cache';
import { getConfigValue } from '../core/config.js';
import { createChildLogger } from './logger.js';
const logger = createChildLogger('cache');
export class CacheManager {
    cache;
    enabled;
    constructor(options) {
        let cacheConfig;
        try {
            cacheConfig = getConfigValue('cache');
        }
        catch {
            cacheConfig = { enabled: true, maxSize: 1000, ttl: 3600000 };
        }
        this.enabled = options?.enabled ?? cacheConfig.enabled;
        this.cache = new LRUCache({
            max: options?.maxSize ?? cacheConfig.maxSize,
            ttl: options?.ttl ?? cacheConfig.ttl,
        });
    }
    get(key) {
        if (!this.enabled)
            return undefined;
        const value = this.cache.get(key);
        if (value !== undefined) {
            logger.debug('Cache hit', { key });
        }
        else {
            logger.debug('Cache miss', { key });
        }
        return value;
    }
    set(key, value) {
        if (!this.enabled)
            return;
        this.cache.set(key, value);
        logger.debug('Cache set', { key });
    }
    has(key) {
        if (!this.enabled)
            return false;
        return this.cache.has(key);
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
        logger.debug('Cache cleared');
    }
    size() {
        return this.cache.size;
    }
    keys() {
        return [...this.cache.keys()];
    }
}
// Singleton instances for common cache types
let embeddingCache = null;
let retrievalCache = null;
export const getEmbeddingCache = () => {
    if (!embeddingCache) {
        embeddingCache = new CacheManager();
    }
    return embeddingCache;
};
export const getRetrievalCache = () => {
    if (!retrievalCache) {
        retrievalCache = new CacheManager();
    }
    return retrievalCache;
};
//# sourceMappingURL=cache.js.map