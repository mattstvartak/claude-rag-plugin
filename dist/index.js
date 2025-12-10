"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeRAG = exports.generateDocumentId = exports.hashObject = exports.hashContent = exports.getRetrievalCache = exports.getEmbeddingCache = exports.CacheManager = exports.createChildLogger = exports.logger = exports.createOrchestrator = exports.Orchestrator = exports.SynthesizerAgent = exports.AnalyzerAgent = exports.RetrieverAgent = exports.BaseAgent = exports.getRetriever = exports.IntelligentRetriever = exports.getIngestionService = exports.DocumentIngestionService = exports.createChunker = exports.DocumentChunker = exports.getEmbeddingProvider = exports.createEmbeddingProvider = exports.OpenAIEmbeddingProvider = exports.getConfigValue = exports.getConfig = exports.ConfigManager = exports.getVectorStore = exports.VectorStore = void 0;
// Core exports
var vector_store_js_1 = require("./core/vector-store.js");
Object.defineProperty(exports, "VectorStore", { enumerable: true, get: function () { return vector_store_js_1.VectorStore; } });
Object.defineProperty(exports, "getVectorStore", { enumerable: true, get: function () { return vector_store_js_1.getVectorStore; } });
var config_js_1 = require("./core/config.js");
Object.defineProperty(exports, "ConfigManager", { enumerable: true, get: function () { return config_js_1.ConfigManager; } });
Object.defineProperty(exports, "getConfig", { enumerable: true, get: function () { return config_js_1.getConfig; } });
Object.defineProperty(exports, "getConfigValue", { enumerable: true, get: function () { return config_js_1.getConfigValue; } });
// Embedding exports
var provider_js_1 = require("./embeddings/provider.js");
Object.defineProperty(exports, "OpenAIEmbeddingProvider", { enumerable: true, get: function () { return provider_js_1.OpenAIEmbeddingProvider; } });
Object.defineProperty(exports, "createEmbeddingProvider", { enumerable: true, get: function () { return provider_js_1.createEmbeddingProvider; } });
Object.defineProperty(exports, "getEmbeddingProvider", { enumerable: true, get: function () { return provider_js_1.getEmbeddingProvider; } });
var chunker_js_1 = require("./embeddings/chunker.js");
Object.defineProperty(exports, "DocumentChunker", { enumerable: true, get: function () { return chunker_js_1.DocumentChunker; } });
Object.defineProperty(exports, "createChunker", { enumerable: true, get: function () { return chunker_js_1.createChunker; } });
var ingestion_js_1 = require("./embeddings/ingestion.js");
Object.defineProperty(exports, "DocumentIngestionService", { enumerable: true, get: function () { return ingestion_js_1.DocumentIngestionService; } });
Object.defineProperty(exports, "getIngestionService", { enumerable: true, get: function () { return ingestion_js_1.getIngestionService; } });
// Retrieval exports
var retriever_js_1 = require("./retrieval/retriever.js");
Object.defineProperty(exports, "IntelligentRetriever", { enumerable: true, get: function () { return retriever_js_1.IntelligentRetriever; } });
Object.defineProperty(exports, "getRetriever", { enumerable: true, get: function () { return retriever_js_1.getRetriever; } });
// Agent exports
var base_agent_js_1 = require("./agents/base-agent.js");
Object.defineProperty(exports, "BaseAgent", { enumerable: true, get: function () { return base_agent_js_1.BaseAgent; } });
var retriever_agent_js_1 = require("./agents/retriever-agent.js");
Object.defineProperty(exports, "RetrieverAgent", { enumerable: true, get: function () { return retriever_agent_js_1.RetrieverAgent; } });
var analyzer_agent_js_1 = require("./agents/analyzer-agent.js");
Object.defineProperty(exports, "AnalyzerAgent", { enumerable: true, get: function () { return analyzer_agent_js_1.AnalyzerAgent; } });
var synthesizer_agent_js_1 = require("./agents/synthesizer-agent.js");
Object.defineProperty(exports, "SynthesizerAgent", { enumerable: true, get: function () { return synthesizer_agent_js_1.SynthesizerAgent; } });
var orchestrator_js_1 = require("./agents/orchestrator.js");
Object.defineProperty(exports, "Orchestrator", { enumerable: true, get: function () { return orchestrator_js_1.Orchestrator; } });
Object.defineProperty(exports, "createOrchestrator", { enumerable: true, get: function () { return orchestrator_js_1.createOrchestrator; } });
// Utility exports
var logger_js_1 = require("./utils/logger.js");
Object.defineProperty(exports, "logger", { enumerable: true, get: function () { return logger_js_1.logger; } });
Object.defineProperty(exports, "createChildLogger", { enumerable: true, get: function () { return logger_js_1.createChildLogger; } });
var cache_js_1 = require("./utils/cache.js");
Object.defineProperty(exports, "CacheManager", { enumerable: true, get: function () { return cache_js_1.CacheManager; } });
Object.defineProperty(exports, "getEmbeddingCache", { enumerable: true, get: function () { return cache_js_1.getEmbeddingCache; } });
Object.defineProperty(exports, "getRetrievalCache", { enumerable: true, get: function () { return cache_js_1.getRetrievalCache; } });
var hashing_js_1 = require("./utils/hashing.js");
Object.defineProperty(exports, "hashContent", { enumerable: true, get: function () { return hashing_js_1.hashContent; } });
Object.defineProperty(exports, "hashObject", { enumerable: true, get: function () { return hashing_js_1.hashObject; } });
Object.defineProperty(exports, "generateDocumentId", { enumerable: true, get: function () { return hashing_js_1.generateDocumentId; } });
// Main API class for programmatic usage
const vector_store_js_2 = require("./core/vector-store.js");
const ingestion_js_2 = require("./embeddings/ingestion.js");
const retriever_js_2 = require("./retrieval/retriever.js");
const orchestrator_js_2 = require("./agents/orchestrator.js");
class ClaudeRAG {
    orchestrator;
    initialized = false;
    constructor() {
        this.orchestrator = (0, orchestrator_js_2.createOrchestrator)();
    }
    async initialize() {
        if (this.initialized)
            return;
        const vectorStore = (0, vector_store_js_2.getVectorStore)();
        await vectorStore.initialize();
        this.initialized = true;
    }
    async index(path, options) {
        await this.initialize();
        const ingestionService = (0, ingestion_js_2.getIngestionService)();
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
        const retriever = (0, retriever_js_2.getRetriever)();
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
        const vectorStore = (0, vector_store_js_2.getVectorStore)();
        return {
            documentCount: await vectorStore.getDocumentCount(),
            collections: await vectorStore.listCollections(),
        };
    }
    async clear() {
        await this.initialize();
        const vectorStore = (0, vector_store_js_2.getVectorStore)();
        await vectorStore.deleteCollection();
    }
}
exports.ClaudeRAG = ClaudeRAG;
// Default export
exports.default = ClaudeRAG;
//# sourceMappingURL=index.js.map