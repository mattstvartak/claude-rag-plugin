export { VectorStore, getVectorStore } from './core/vector-store.js';
export { ConfigManager, getConfig, getConfigValue } from './core/config.js';
export type { Document, DocumentMetadata, DocumentChunk, RetrievalResult, RetrievalQuery, HybridSearchResult, EmbeddingRequest, EmbeddingResponse, AgentRole, AgentMessage, AgentContext, AgentResponse, AgentAction, AgentConfig, Task, OrchestratorPlan, Config, MCPTool, MCPResource, MCPPrompt, } from './core/types.js';
export { OpenAIEmbeddingProvider, createEmbeddingProvider, getEmbeddingProvider, } from './embeddings/provider.js';
export type { EmbeddingProvider } from './embeddings/provider.js';
export { DocumentChunker, createChunker } from './embeddings/chunker.js';
export { DocumentIngestionService, getIngestionService, } from './embeddings/ingestion.js';
export { IntelligentRetriever, getRetriever } from './retrieval/retriever.js';
export { BaseAgent } from './agents/base-agent.js';
export { RetrieverAgent } from './agents/retriever-agent.js';
export { AnalyzerAgent } from './agents/analyzer-agent.js';
export { SynthesizerAgent } from './agents/synthesizer-agent.js';
export { Orchestrator, createOrchestrator } from './agents/orchestrator.js';
export { logger, createChildLogger } from './utils/logger.js';
export { CacheManager, getEmbeddingCache, getRetrievalCache } from './utils/cache.js';
export { hashContent, hashObject, generateDocumentId } from './utils/hashing.js';
import { RetrievalResult } from './core/types.js';
export declare class ClaudeRAG {
    private orchestrator;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    index(path: string, options?: {
        projectName?: string;
        forceReindex?: boolean;
        onProgress?: (stats: {
            processedFiles: number;
            totalFiles: number;
            totalChunks: number;
        }) => void;
    }): Promise<{
        totalFiles: number;
        processedFiles: number;
        totalChunks: number;
        errors: Array<{
            file: string;
            error: string;
        }>;
    }>;
    search(query: string, options?: {
        topK?: number;
        minScore?: number;
        filters?: Record<string, unknown>;
    }): Promise<RetrievalResult[]>;
    query(question: string): Promise<string>;
    getStatus(): Promise<{
        documentCount: number;
        collections: string[];
    }>;
    clear(): Promise<void>;
}
export default ClaudeRAG;
//# sourceMappingURL=index.d.ts.map