// Core exports
export { VectorStore, getVectorStore } from './core/vector-store.js';
export { ConfigManager, getConfig, getConfigValue } from './core/config.js';
// Embedding exports
export { OpenAIEmbeddingProvider, createEmbeddingProvider, getEmbeddingProvider, } from './embeddings/provider.js';
export { DocumentChunker, createChunker } from './embeddings/chunker.js';
export { DocumentIngestionService, getIngestionService, } from './embeddings/ingestion.js';
// Retrieval exports
export { IntelligentRetriever, getRetriever } from './retrieval/retriever.js';
// Agent exports
export { BaseAgent } from './agents/base-agent.js';
export { RetrieverAgent } from './agents/retriever-agent.js';
export { AnalyzerAgent } from './agents/analyzer-agent.js';
export { SynthesizerAgent } from './agents/synthesizer-agent.js';
export { Orchestrator, createOrchestrator } from './agents/orchestrator.js';
// Utility exports
export { logger, createChildLogger } from './utils/logger.js';
export { CacheManager, getEmbeddingCache, getRetrievalCache } from './utils/cache.js';
export { hashContent, hashObject, generateDocumentId } from './utils/hashing.js';
// Main API class for programmatic usage
import { getVectorStore } from './core/vector-store.js';
import { getIngestionService } from './embeddings/ingestion.js';
import { getRetriever } from './retrieval/retriever.js';
import { createOrchestrator } from './agents/orchestrator.js';
export class ClaudeRAG {
    orchestrator;
    initialized = false;
    constructor() {
        this.orchestrator = createOrchestrator();
    }
    async initialize() {
        if (this.initialized)
            return;
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        this.initialized = true;
    }
    async index(path, options) {
        await this.initialize();
        const ingestionService = getIngestionService();
        const stats = await ingestionService.ingestDirectory(path, {
            projectName: options?.projectName,
            forceReindex: options?.forceReindex,
            onProgress: options?.onProgress,
        });
        return {
            totalFiles: stats.totalFiles,
            processedFiles: stats.processedFiles,
            totalChunks: stats.totalChunks,
            errors: stats.errors,
        };
    }
    async search(query, options) {
        await this.initialize();
        const retriever = getRetriever();
        return retriever.retrieve({
            query,
            topK: options?.topK,
            minScore: options?.minScore,
            filters: options?.filters,
        });
    }
    async query(question) {
        await this.initialize();
        return this.orchestrator.query(question);
    }
    async getStatus() {
        await this.initialize();
        const vectorStore = getVectorStore();
        return {
            documentCount: await vectorStore.getDocumentCount(),
            collections: await vectorStore.listCollections(),
        };
    }
    async clear() {
        await this.initialize();
        const vectorStore = getVectorStore();
        await vectorStore.deleteCollection();
    }
}
// Default export
export default ClaudeRAG;
//# sourceMappingURL=index.js.map