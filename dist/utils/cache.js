"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRetrievalCache = exports.getEmbeddingCache = exports.CacheManager = void 0;
const lru_cache_1 = require("lru-cache");
const config_js_1 = require("../core/config.js");
const logger_js_1 = require("./logger.js");
const logger = (0, logger_js_1.createChildLogger)('cache');
class CacheManager {
    cache;
    enabled;
    constructor(options) {
        let cacheConfig;
        try {
            cacheConfig = (0, config_js_1.getConfigValue)('cache');
        }
        catch {
            cacheConfig = { enabled: true, maxSize: 1000, ttl: 3600000 };
        }
        this.enabled = options?.enabled ?? cacheConfig.enabled;
        this.cache = new lru_cache_1.LRUCache({
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
exports.CacheManager = CacheManager;
// Singleton instances for common cache types
let embeddingCache = null;
let retrievalCache = null;
const getEmbeddingCache = () => {
    if (!embeddingCache) {
        embeddingCache = new CacheManager();
    }
    return embeddingCache;
};
exports.getEmbeddingCache = getEmbeddingCache;
const getRetrievalCache = () => {
    if (!retrievalCache) {
        retrievalCache = new CacheManager();
    }
    return retrievalCache;
};
exports.getRetrievalCache = getRetrievalCache;
//# sourceMappingURL=cache.js.map