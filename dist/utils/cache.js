import { LRUCache } from 'lru-cache';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
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
// Persistent cache that saves to disk
export class PersistentEmbeddingCache {
    cache;
    enabled;
    filePath;
    saveTimer = null;
    dirty = false;
    constructor(options) {
        let cacheConfig;
        try {
            cacheConfig = getConfigValue('cache');
        }
        catch {
            cacheConfig = { enabled: true, maxSize: 10000, ttl: 86400000 }; // 24 hour TTL for persistent
        }
        this.enabled = options?.enabled ?? cacheConfig.enabled;
        this.filePath = options?.filePath ?? join(process.cwd(), '.chromadb', 'embedding-cache.json');
        this.cache = new LRUCache({
            max: options?.maxSize ?? cacheConfig.maxSize,
            ttl: options?.ttl ?? cacheConfig.ttl,
        });
        // Load from disk on startup
        this.loadFromDisk().catch(err => {
            logger.debug('No existing embedding cache found', { error: String(err) });
        });
    }
    async loadFromDisk() {
        if (!this.enabled || !existsSync(this.filePath))
            return;
        try {
            const data = await readFile(this.filePath, 'utf-8');
            const entries = JSON.parse(data);
            let loaded = 0;
            for (const [key, value] of entries) {
                this.cache.set(key, value);
                loaded++;
            }
            logger.info('Loaded embedding cache from disk', { entries: loaded, file: this.filePath });
        }
        catch (error) {
            logger.debug('Could not load embedding cache', { error: String(error) });
        }
    }
    async saveToDisk() {
        if (!this.enabled || !this.dirty)
            return;
        try {
            // Ensure directory exists
            await mkdir(dirname(this.filePath), { recursive: true });
            // Convert cache to array of entries
            const entries = [];
            for (const key of this.cache.keys()) {
                const value = this.cache.get(key);
                if (value) {
                    entries.push([key, value]);
                }
            }
            await writeFile(this.filePath, JSON.stringify(entries));
            this.dirty = false;
            logger.debug('Saved embedding cache to disk', { entries: entries.length });
        }
        catch (error) {
            logger.error('Failed to save embedding cache', { error: String(error) });
        }
    }
    scheduleSave() {
        // Debounce saves - save at most every 30 seconds
        if (this.saveTimer)
            return;
        this.saveTimer = setTimeout(async () => {
            this.saveTimer = null;
            await this.saveToDisk();
        }, 30000);
    }
    get(key) {
        if (!this.enabled)
            return undefined;
        const value = this.cache.get(key);
        if (value !== undefined) {
            logger.debug('Persistent cache hit', { key: key.slice(0, 30) + '...' });
        }
        return value;
    }
    set(key, value) {
        if (!this.enabled)
            return;
        this.cache.set(key, value);
        this.dirty = true;
        this.scheduleSave();
    }
    has(key) {
        if (!this.enabled)
            return false;
        return this.cache.has(key);
    }
    size() {
        return this.cache.size;
    }
    async flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.saveToDisk();
    }
}
// Singleton instances for common cache types
let embeddingCache = null;
let persistentEmbeddingCache = null;
let retrievalCache = null;
export const getEmbeddingCache = () => {
    if (!embeddingCache) {
        embeddingCache = new CacheManager();
    }
    return embeddingCache;
};
// Use this for embeddings to persist across restarts
export const getPersistentEmbeddingCache = () => {
    if (!persistentEmbeddingCache) {
        persistentEmbeddingCache = new PersistentEmbeddingCache({ maxSize: 50000 }); // Support large codebases
    }
    return persistentEmbeddingCache;
};
export const getRetrievalCache = () => {
    if (!retrievalCache) {
        retrievalCache = new CacheManager();
    }
    return retrievalCache;
};
//# sourceMappingURL=cache.js.map