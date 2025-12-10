import OpenAI from 'openai';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { ChromaClient, IncludeEnum, DefaultEmbeddingFunction } from 'chromadb';
import { getConfigValue } from '../core/config.js';
import { EmbeddingRequest, EmbeddingResponse } from '../core/types.js';
import { createChildLogger } from '../utils/logger.js';
import { getEmbeddingCache } from '../utils/cache.js';
import { hashContent } from '../utils/hashing.js';

const logger = createChildLogger('embeddings');

export interface EmbeddingProvider {
  generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  generateEmbedding(text: string): Promise<number[]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private dimensions: number;
  private queue: PQueue;
  private maxRetries: number;
  private retryDelay: number;
  private cache = getEmbeddingCache();

  constructor() {
    const embeddingConfig = getConfigValue('embeddings');

    if (!process.env['OPENAI_API_KEY']) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.client = new OpenAI({
      apiKey: process.env['OPENAI_API_KEY'],
    });

    this.model = embeddingConfig.model;
    this.dimensions = embeddingConfig.dimensions;
    this.maxRetries = embeddingConfig.maxRetries;
    this.retryDelay = embeddingConfig.retryDelay;

    // Rate limiting queue
    this.queue = new PQueue({
      concurrency: 5,
      intervalCap: 100,
      interval: 60000, // 100 requests per minute
    });
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || this.model;
    const embeddings: number[][] = [];
    let totalPromptTokens = 0;
    let totalTokens = 0;

    // Process in batches
    const batchSize = getConfigValue('embeddings').batchSize;
    const batches: string[][] = [];

    for (let i = 0; i < request.texts.length; i += batchSize) {
      batches.push(request.texts.slice(i, i + batchSize));
    }

    logger.info('Generating embeddings', {
      totalTexts: request.texts.length,
      batches: batches.length,
    });

    for (const batch of batches) {
      const batchEmbeddings = await this.processBatch(batch, model);
      embeddings.push(...batchEmbeddings.embeddings);
      totalPromptTokens += batchEmbeddings.usage.promptTokens;
      totalTokens += batchEmbeddings.usage.totalTokens;
    }

    return {
      embeddings,
      model,
      usage: {
        promptTokens: totalPromptTokens,
        totalTokens,
      },
    };
  }

  private async processBatch(
    texts: string[],
    model: string
  ): Promise<EmbeddingResponse> {
    // Check cache first
    const cachedEmbeddings: (number[] | null)[] = texts.map((text) => {
      const cacheKey = `${model}:${hashContent(text)}`;
      return this.cache.get(cacheKey) || null;
    });

    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    cachedEmbeddings.forEach((embedding, index) => {
      if (embedding === null) {
        uncachedTexts.push(texts[index]!);
        uncachedIndices.push(index);
      }
    });

    if (uncachedTexts.length === 0) {
      logger.debug('All embeddings found in cache', { count: texts.length });
      return {
        embeddings: cachedEmbeddings as number[][],
        model,
        usage: { promptTokens: 0, totalTokens: 0 },
      };
    }

    // Generate embeddings for uncached texts
    const response = await this.queue.add(() =>
      pRetry(
        async () => {
          return await this.client.embeddings.create({
            model,
            input: uncachedTexts,
            dimensions: this.dimensions,
          });
        },
        {
          retries: this.maxRetries,
          minTimeout: this.retryDelay,
          onFailedAttempt: (error) => {
            logger.warn('Embedding request failed, retrying', {
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
            });
          },
        }
      )
    );

    if (!response) {
      throw new Error('Failed to generate embeddings');
    }

    // Update cache and merge results
    const embeddings = [...cachedEmbeddings] as number[][];

    response.data.forEach((item, i) => {
      const originalIndex = uncachedIndices[i]!;
      const text = uncachedTexts[i]!;
      const embedding = item.embedding;

      embeddings[originalIndex] = embedding;

      // Cache the embedding
      const cacheKey = `${model}:${hashContent(text)}`;
      this.cache.set(cacheKey, embedding);
    });

    return {
      embeddings,
      model,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.generateEmbeddings({ texts: [text] });
    return response.embeddings[0]!;
  }
}

// ChromaDB's built-in embedding function (no API key required)
export class ChromaEmbeddingProvider implements EmbeddingProvider {
  private client: ChromaClient;
  private embeddingFunction: DefaultEmbeddingFunction;
  private cache = getEmbeddingCache();
  private dimensions = 384; // Default for all-MiniLM-L6-v2

  constructor() {
    const chromaConfig = getConfigValue('chromadb');
    this.client = new ChromaClient({
      path: `http://${chromaConfig.host}:${chromaConfig.port}`,
    });
    // Use ChromaDB's default embedding function (all-MiniLM-L6-v2)
    this.embeddingFunction = new DefaultEmbeddingFunction();
  }

  async generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const embeddings: number[][] = [];

    // Check cache first
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < request.texts.length; i++) {
      const text = request.texts[i]!;
      const cacheKey = `chroma:${hashContent(text)}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        embeddings[i] = cached;
      } else {
        uncachedTexts.push(text);
        uncachedIndices.push(i);
      }
    }

    if (uncachedTexts.length === 0) {
      return {
        embeddings,
        model: 'chroma-default',
        usage: { promptTokens: 0, totalTokens: 0 },
      };
    }

    logger.info('Generating embeddings via ChromaDB DefaultEmbeddingFunction', { count: uncachedTexts.length });

    try {
      // Use the embedding function directly to generate embeddings
      const generatedEmbeddings = await this.embeddingFunction.generate(uncachedTexts);

      // Map generated embeddings back to original indices and cache them
      generatedEmbeddings.forEach((embedding, i) => {
        if (embedding) {
          const originalIndex = uncachedIndices[i]!;
          embeddings[originalIndex] = embedding;

          const text = uncachedTexts[i]!;
          const cacheKey = `chroma:${hashContent(text)}`;
          this.cache.set(cacheKey, embedding);
        }
      });
    } catch (error) {
      logger.error('Failed to generate embeddings', { error });
      throw error;
    }

    return {
      embeddings,
      model: 'chroma-default',
      usage: { promptTokens: 0, totalTokens: 0 },
    };
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.generateEmbeddings({ texts: [text] });
    return response.embeddings[0]!;
  }
}

// Factory function
export function createEmbeddingProvider(): EmbeddingProvider {
  const provider = getConfigValue('embeddings').provider;

  switch (provider) {
    case 'openai':
      if (!process.env['OPENAI_API_KEY']) {
        logger.warn('OPENAI_API_KEY not set, falling back to ChromaDB embeddings');
        return new ChromaEmbeddingProvider();
      }
      return new OpenAIEmbeddingProvider();
    case 'chroma':
      return new ChromaEmbeddingProvider();
    default:
      // Default to ChromaDB's built-in embeddings (no API key required)
      logger.info('Using ChromaDB default embeddings (no API key required)');
      return new ChromaEmbeddingProvider();
  }
}

// Singleton instance
let embeddingProviderInstance: EmbeddingProvider | null = null;

export const getEmbeddingProvider = (): EmbeddingProvider => {
  if (!embeddingProviderInstance) {
    embeddingProviderInstance = createEmbeddingProvider();
  }
  return embeddingProviderInstance;
};
