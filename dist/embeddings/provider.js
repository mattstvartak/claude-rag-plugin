"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmbeddingProvider = exports.OpenAIEmbeddingProvider = void 0;
exports.createEmbeddingProvider = createEmbeddingProvider;
const openai_1 = __importDefault(require("openai"));
const p_queue_1 = __importDefault(require("p-queue"));
const p_retry_1 = __importDefault(require("p-retry"));
const config_js_1 = require("../core/config.js");
const logger_js_1 = require("../utils/logger.js");
const cache_js_1 = require("../utils/cache.js");
const hashing_js_1 = require("../utils/hashing.js");
const logger = (0, logger_js_1.createChildLogger)('embeddings');
class OpenAIEmbeddingProvider {
    client;
    model;
    dimensions;
    queue;
    maxRetries;
    retryDelay;
    cache = (0, cache_js_1.getEmbeddingCache)();
    constructor() {
        const embeddingConfig = (0, config_js_1.getConfigValue)('embeddings');
        if (!process.env['OPENAI_API_KEY']) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        this.client = new openai_1.default({
            apiKey: process.env['OPENAI_API_KEY'],
        });
        this.model = embeddingConfig.model;
        this.dimensions = embeddingConfig.dimensions;
        this.maxRetries = embeddingConfig.maxRetries;
        this.retryDelay = embeddingConfig.retryDelay;
        // Rate limiting queue
        this.queue = new p_queue_1.default({
            concurrency: 5,
            intervalCap: 100,
            interval: 60000, // 100 requests per minute
        });
    }
    async generateEmbeddings(request) {
        const model = request.model || this.model;
        const embeddings = [];
        let totalPromptTokens = 0;
        let totalTokens = 0;
        // Process in batches
        const batchSize = (0, config_js_1.getConfigValue)('embeddings').batchSize;
        const batches = [];
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
    async processBatch(texts, model) {
        // Check cache first
        const cachedEmbeddings = texts.map((text) => {
            const cacheKey = `${model}:${(0, hashing_js_1.hashContent)(text)}`;
            return this.cache.get(cacheKey) || null;
        });
        const uncachedTexts = [];
        const uncachedIndices = [];
        cachedEmbeddings.forEach((embedding, index) => {
            if (embedding === null) {
                uncachedTexts.push(texts[index]);
                uncachedIndices.push(index);
            }
        });
        if (uncachedTexts.length === 0) {
            logger.debug('All embeddings found in cache', { count: texts.length });
            return {
                embeddings: cachedEmbeddings,
                model,
                usage: { promptTokens: 0, totalTokens: 0 },
            };
        }
        // Generate embeddings for uncached texts
        const response = await this.queue.add(() => (0, p_retry_1.default)(async () => {
            return await this.client.embeddings.create({
                model,
                input: uncachedTexts,
                dimensions: this.dimensions,
            });
        }, {
            retries: this.maxRetries,
            minTimeout: this.retryDelay,
            onFailedAttempt: (error) => {
                logger.warn('Embedding request failed, retrying', {
                    attempt: error.attemptNumber,
                    retriesLeft: error.retriesLeft,
                });
            },
        }));
        if (!response) {
            throw new Error('Failed to generate embeddings');
        }
        // Update cache and merge results
        const embeddings = [...cachedEmbeddings];
        response.data.forEach((item, i) => {
            const originalIndex = uncachedIndices[i];
            const text = uncachedTexts[i];
            const embedding = item.embedding;
            embeddings[originalIndex] = embedding;
            // Cache the embedding
            const cacheKey = `${model}:${(0, hashing_js_1.hashContent)(text)}`;
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
    async generateEmbedding(text) {
        const response = await this.generateEmbeddings({ texts: [text] });
        return response.embeddings[0];
    }
}
exports.OpenAIEmbeddingProvider = OpenAIEmbeddingProvider;
// Factory function
function createEmbeddingProvider() {
    const provider = (0, config_js_1.getConfigValue)('embeddings').provider;
    switch (provider) {
        case 'openai':
            return new OpenAIEmbeddingProvider();
        default:
            throw new Error(`Unsupported embedding provider: ${provider}`);
    }
}
// Singleton instance
let embeddingProviderInstance = null;
const getEmbeddingProvider = () => {
    if (!embeddingProviderInstance) {
        embeddingProviderInstance = createEmbeddingProvider();
    }
    return embeddingProviderInstance;
};
exports.getEmbeddingProvider = getEmbeddingProvider;
//# sourceMappingURL=provider.js.map