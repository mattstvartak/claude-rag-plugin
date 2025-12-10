import { LRUCache } from 'lru-cache';
import { getConfigValue } from '../core/config.js';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('cache');

export class CacheManager<T> {
  private cache: LRUCache<string, T>;
  private enabled: boolean;

  constructor(options?: { maxSize?: number; ttl?: number; enabled?: boolean }) {
    let cacheConfig: { enabled: boolean; maxSize: number; ttl: number };

    try {
      cacheConfig = getConfigValue('cache');
    } catch {
      cacheConfig = { enabled: true, maxSize: 1000, ttl: 3600000 };
    }

    this.enabled = options?.enabled ?? cacheConfig.enabled;

    this.cache = new LRUCache<string, T>({
      max: options?.maxSize ?? cacheConfig.maxSize,
      ttl: options?.ttl ?? cacheConfig.ttl,
    });
  }

  get(key: string): T | undefined {
    if (!this.enabled) return undefined;

    const value = this.cache.get(key);
    if (value !== undefined) {
      logger.debug('Cache hit', { key });
    } else {
      logger.debug('Cache miss', { key });
    }
    return value;
  }

  set(key: string, value: T): void {
    if (!this.enabled) return;

    this.cache.set(key, value);
    logger.debug('Cache set', { key });
  }

  has(key: string): boolean {
    if (!this.enabled) return false;
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }
}

// Singleton instances for common cache types
let embeddingCache: CacheManager<number[]> | null = null;
let retrievalCache: CacheManager<unknown> | null = null;

export const getEmbeddingCache = (): CacheManager<number[]> => {
  if (!embeddingCache) {
    embeddingCache = new CacheManager<number[]>();
  }
  return embeddingCache;
};

export const getRetrievalCache = (): CacheManager<unknown> => {
  if (!retrievalCache) {
    retrievalCache = new CacheManager<unknown>();
  }
  return retrievalCache;
};
