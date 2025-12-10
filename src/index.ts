// Core exports
export { VectorStore, getVectorStore } from './core/vector-store.js';
export { ConfigManager, getConfig, getConfigValue } from './core/config.js';
export type {
  Document,
  DocumentMetadata,
  DocumentChunk,
  RetrievalResult,
  RetrievalQuery,
  HybridSearchResult,
  EmbeddingRequest,
  EmbeddingResponse,
  AgentRole,
  AgentMessage,
  AgentContext,
  AgentResponse,
  AgentAction,
  AgentConfig,
  Task,
  OrchestratorPlan,
  Config,
  MCPTool,
  MCPResource,
  MCPPrompt,
} from './core/types.js';

// Embedding exports
export {
  OpenAIEmbeddingProvider,
  createEmbeddingProvider,
  getEmbeddingProvider,
} from './embeddings/provider.js';
export type { EmbeddingProvider } from './embeddings/provider.js';
export { DocumentChunker, createChunker } from './embeddings/chunker.js';
export {
  DocumentIngestionService,
  getIngestionService,
} from './embeddings/ingestion.js';

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
import { createOrchestrator, Orchestrator } from './agents/orchestrator.js';
import { RetrievalResult } from './core/types.js';

export class ClaudeRAG {
  private orchestrator: Orchestrator;
  private initialized = false;

  constructor() {
    this.orchestrator = createOrchestrator();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const vectorStore = getVectorStore();
    await vectorStore.initialize();
    this.initialized = true;
  }

  async index(
    path: string,
    options?: {
      projectName?: string;
      forceReindex?: boolean;
      onProgress?: (stats: {
        processedFiles: number;
        totalFiles: number;
        totalChunks: number;
      }) => void;
    }
  ): Promise<{
    totalFiles: number;
    processedFiles: number;
    totalChunks: number;
    errors: Array<{ file: string; error: string }>;
  }> {
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

  async search(
    query: string,
    options?: {
      topK?: number;
      minScore?: number;
      filters?: Record<string, unknown>;
    }
  ): Promise<RetrievalResult[]> {
    await this.initialize();
    const retriever = getRetriever();

    return retriever.retrieve({
      query,
      topK: options?.topK,
      minScore: options?.minScore,
      filters: options?.filters,
    });
  }

  async query(question: string): Promise<string> {
    await this.initialize();
    return this.orchestrator.query(question);
  }

  async getStatus(): Promise<{
    documentCount: number;
    collections: string[];
  }> {
    await this.initialize();
    const vectorStore = getVectorStore();

    return {
      documentCount: await vectorStore.getDocumentCount(),
      collections: await vectorStore.listCollections(),
    };
  }

  async clear(): Promise<void> {
    await this.initialize();
    const vectorStore = getVectorStore();
    await vectorStore.deleteCollection();
  }
}

// Default export
export default ClaudeRAG;
