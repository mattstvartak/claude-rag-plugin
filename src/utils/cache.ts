import { LRUCache } from 'lru-cache';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { getConfigValue } from '../core/config.js';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('cache');

export class CacheManager<T extends object> {
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

// Persistent cache that saves to disk
export class PersistentEmbeddingCache {
  private cache: LRUCache<string, number[]>;
  private enabled: boolean;
  private filePath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(options?: { maxSize?: number; ttl?: number; enabled?: boolean; filePath?: string }) {
    let cacheConfig: { enabled: boolean; maxSize: number; ttl: number };

    try {
      cacheConfig = getConfigValue('cache');
    } catch {
      cacheConfig = { enabled: true, maxSize: 10000, ttl: 86400000 }; // 24 hour TTL for persistent
    }

    this.enabled = options?.enabled ?? cacheConfig.enabled;
    this.filePath = options?.filePath ?? join(process.cwd(), '.chromadb', 'embedding-cache.json');

    this.cache = new LRUCache<string, number[]>({
      max: options?.maxSize ?? cacheConfig.maxSize,
      ttl: options?.ttl ?? cacheConfig.ttl,
    });

    // Load from disk on startup
    this.loadFromDisk().catch(err => {
      logger.debug('No existing embedding cache found', { error: String(err) });
    });
  }

  private async loadFromDisk(): Promise<void> {
    if (!this.enabled || !existsSync(this.filePath)) return;

    try {
      const data = await readFile(this.filePath, 'utf-8');
      const entries: Array<[string, number[]]> = JSON.parse(data);
      let loaded = 0;

      for (const [key, value] of entries) {
        this.cache.set(key, value);
        loaded++;
      }

      logger.info('Loaded embedding cache from disk', { entries: loaded, file: this.filePath });
    } catch (error) {
      logger.debug('Could not load embedding cache', { error: String(error) });
    }
  }

  private async saveToDisk(): Promise<void> {
    if (!this.enabled || !this.dirty) return;

    try {
      // Ensure directory exists
      await mkdir(dirname(this.filePath), { recursive: true });

      // Convert cache to array of entries
      const entries: Array<[string, number[]]> = [];
      for (const key of this.cache.keys()) {
        const value = this.cache.get(key);
        if (value) {
          entries.push([key, value]);
        }
      }

      await writeFile(this.filePath, JSON.stringify(entries));
      this.dirty = false;
      logger.debug('Saved embedding cache to disk', { entries: entries.length });
    } catch (error) {
      logger.error('Failed to save embedding cache', { error: String(error) });
    }
  }

  private scheduleSave(): void {
    // Debounce saves - save at most every 30 seconds
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      await this.saveToDisk();
    }, 30000);
  }

  get(key: string): number[] | undefined {
    if (!this.enabled) return undefined;

    const value = this.cache.get(key);
    if (value !== undefined) {
      logger.debug('Persistent cache hit', { key: key.slice(0, 30) + '...' });
    }
    return value;
  }

  set(key: string, value: number[]): void {
    if (!this.enabled) return;

    this.cache.set(key, value);
    this.dirty = true;
    this.scheduleSave();
  }

  has(key: string): boolean {
    if (!this.enabled) return false;
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveToDisk();
  }
}

// Singleton instances for common cache types
let embeddingCache: CacheManager<number[]> | null = null;
let persistentEmbeddingCache: PersistentEmbeddingCache | null = null;
let retrievalCache: CacheManager<unknown[]> | null = null;

export const getEmbeddingCache = (): CacheManager<number[]> => {
  if (!embeddingCache) {
    embeddingCache = new CacheManager<number[]>();
  }
  return embeddingCache;
};

// Use this for embeddings to persist across restarts
export const getPersistentEmbeddingCache = (): PersistentEmbeddingCache => {
  if (!persistentEmbeddingCache) {
    persistentEmbeddingCache = new PersistentEmbeddingCache({ maxSize: 50000 }); // Support large codebases
  }
  return persistentEmbeddingCache;
};

export const getRetrievalCache = (): CacheManager<unknown[]> => {
  if (!retrievalCache) {
    retrievalCache = new CacheManager<unknown[]>();
  }
  return retrievalCache;
};
