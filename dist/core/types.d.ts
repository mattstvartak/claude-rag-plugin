import { z } from 'zod';
export interface Document {
    id: string;
    content: string;
    metadata: DocumentMetadata;
    embedding?: number[];
}
export interface DocumentMetadata {
    filePath: string;
    fileName: string;
    fileType: string;
    language?: string;
    chunkIndex: number;
    totalChunks: number;
    startLine?: number;
    endLine?: number;
    createdAt: string;
    updatedAt: string;
    hash: string;
    projectName?: string;
    tags?: string[];
}
export interface DocumentChunk {
    id: string;
    content: string;
    metadata: DocumentMetadata;
    tokenCount: number;
}
export interface RetrievalResult {
    document: Document;
    score: number;
    highlights?: string[];
}
export interface RetrievalQuery {
    query: string;
    topK?: number;
    minScore?: number;
    filters?: Record<string, unknown>;
    rerank?: boolean;
}
export interface HybridSearchResult {
    semanticResults: RetrievalResult[];
    keywordResults: RetrievalResult[];
    fusedResults: RetrievalResult[];
}
export interface EmbeddingRequest {
    texts: string[];
    model?: string;
}
export interface EmbeddingResponse {
    embeddings: number[][];
    model: string;
    usage: {
        promptTokens: number;
        totalTokens: number;
    };
}
export type AgentRole = 'orchestrator' | 'retriever' | 'analyzer' | 'synthesizer';
export interface AgentMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
}
export interface AgentContext {
    query: string;
    documents: RetrievalResult[];
    conversationHistory: AgentMessage[];
    metadata: Record<string, unknown>;
}
export interface AgentResponse {
    content: string;
    reasoning?: string;
    actions?: AgentAction[];
    metadata?: Record<string, unknown>;
}
export interface AgentAction {
    type: 'retrieve' | 'analyze' | 'synthesize' | 'delegate';
    params: Record<string, unknown>;
    result?: unknown;
}
export interface AgentConfig {
    role: AgentRole;
    model: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}
export interface Task {
    id: string;
    type: 'query' | 'index' | 'analyze' | 'synthesize';
    input: unknown;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
    startedAt?: string;
    completedAt?: string;
}
export interface OrchestratorPlan {
    tasks: Task[];
    strategy: 'sequential' | 'parallel' | 'adaptive';
    estimatedSteps: number;
}
export declare const ConfigSchema: z.ZodObject<{
    chromadb: z.ZodObject<{
        host: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
        collection: z.ZodDefault<z.ZodString>;
        embeddingFunction: z.ZodDefault<z.ZodString>;
        persistDirectory: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        collection: string;
        embeddingFunction: string;
        persistDirectory: string;
    }, {
        host?: string | undefined;
        port?: number | undefined;
        collection?: string | undefined;
        embeddingFunction?: string | undefined;
        persistDirectory?: string | undefined;
    }>;
    embeddings: z.ZodObject<{
        provider: z.ZodDefault<z.ZodEnum<["openai", "anthropic", "local"]>>;
        model: z.ZodDefault<z.ZodString>;
        dimensions: z.ZodDefault<z.ZodNumber>;
        batchSize: z.ZodDefault<z.ZodNumber>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
        retryDelay: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        provider: "openai" | "anthropic" | "local";
        model: string;
        dimensions: number;
        batchSize: number;
        maxRetries: number;
        retryDelay: number;
    }, {
        provider?: "openai" | "anthropic" | "local" | undefined;
        model?: string | undefined;
        dimensions?: number | undefined;
        batchSize?: number | undefined;
        maxRetries?: number | undefined;
        retryDelay?: number | undefined;
    }>;
    retrieval: z.ZodObject<{
        topK: z.ZodDefault<z.ZodNumber>;
        minScore: z.ZodDefault<z.ZodNumber>;
        reranking: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            model: z.ZodDefault<z.ZodString>;
            topN: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            enabled: boolean;
            topN: number;
        }, {
            model?: string | undefined;
            enabled?: boolean | undefined;
            topN?: number | undefined;
        }>;
        hybridSearch: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            keywordWeight: z.ZodDefault<z.ZodNumber>;
            semanticWeight: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            keywordWeight: number;
            semanticWeight: number;
        }, {
            enabled?: boolean | undefined;
            keywordWeight?: number | undefined;
            semanticWeight?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        topK: number;
        minScore: number;
        reranking: {
            model: string;
            enabled: boolean;
            topN: number;
        };
        hybridSearch: {
            enabled: boolean;
            keywordWeight: number;
            semanticWeight: number;
        };
    }, {
        reranking: {
            model?: string | undefined;
            enabled?: boolean | undefined;
            topN?: number | undefined;
        };
        hybridSearch: {
            enabled?: boolean | undefined;
            keywordWeight?: number | undefined;
            semanticWeight?: number | undefined;
        };
        topK?: number | undefined;
        minScore?: number | undefined;
    }>;
    ingestion: z.ZodObject<{
        chunkSize: z.ZodDefault<z.ZodNumber>;
        chunkOverlap: z.ZodDefault<z.ZodNumber>;
        supportedExtensions: z.ZodArray<z.ZodString, "many">;
        excludePatterns: z.ZodArray<z.ZodString, "many">;
        maxFileSize: z.ZodDefault<z.ZodNumber>;
        watchMode: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        chunkSize: number;
        chunkOverlap: number;
        supportedExtensions: string[];
        excludePatterns: string[];
        maxFileSize: number;
        watchMode: boolean;
    }, {
        supportedExtensions: string[];
        excludePatterns: string[];
        chunkSize?: number | undefined;
        chunkOverlap?: number | undefined;
        maxFileSize?: number | undefined;
        watchMode?: boolean | undefined;
    }>;
    agents: z.ZodObject<{
        orchestrator: z.ZodObject<{
            model: z.ZodString;
            maxIterations: z.ZodDefault<z.ZodNumber>;
            temperature: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            maxIterations: number;
            temperature: number;
        }, {
            model: string;
            maxIterations?: number | undefined;
            temperature?: number | undefined;
        }>;
        retriever: z.ZodObject<{
            model: z.ZodString;
            maxResults: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            maxResults: number;
        }, {
            model: string;
            maxResults?: number | undefined;
        }>;
        analyzer: z.ZodObject<{
            model: z.ZodString;
            contextWindow: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            contextWindow: number;
        }, {
            model: string;
            contextWindow?: number | undefined;
        }>;
        synthesizer: z.ZodObject<{
            model: z.ZodString;
            maxTokens: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            maxTokens: number;
        }, {
            model: string;
            maxTokens?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        orchestrator: {
            model: string;
            maxIterations: number;
            temperature: number;
        };
        retriever: {
            model: string;
            maxResults: number;
        };
        analyzer: {
            model: string;
            contextWindow: number;
        };
        synthesizer: {
            model: string;
            maxTokens: number;
        };
    }, {
        orchestrator: {
            model: string;
            maxIterations?: number | undefined;
            temperature?: number | undefined;
        };
        retriever: {
            model: string;
            maxResults?: number | undefined;
        };
        analyzer: {
            model: string;
            contextWindow?: number | undefined;
        };
        synthesizer: {
            model: string;
            maxTokens?: number | undefined;
        };
    }>;
    cache: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        maxSize: z.ZodDefault<z.ZodNumber>;
        ttl: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        maxSize: number;
        ttl: number;
    }, {
        enabled?: boolean | undefined;
        maxSize?: number | undefined;
        ttl?: number | undefined;
    }>;
    logging: z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
        format: z.ZodDefault<z.ZodEnum<["json", "text"]>>;
        file: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        level: "debug" | "info" | "warn" | "error";
        format: "json" | "text";
        file?: string | undefined;
    }, {
        level?: "debug" | "info" | "warn" | "error" | undefined;
        format?: "json" | "text" | undefined;
        file?: string | undefined;
    }>;
    mcp: z.ZodObject<{
        serverName: z.ZodDefault<z.ZodString>;
        version: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        serverName: string;
        version: string;
    }, {
        serverName?: string | undefined;
        version?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    chromadb: {
        host: string;
        port: number;
        collection: string;
        embeddingFunction: string;
        persistDirectory: string;
    };
    embeddings: {
        provider: "openai" | "anthropic" | "local";
        model: string;
        dimensions: number;
        batchSize: number;
        maxRetries: number;
        retryDelay: number;
    };
    retrieval: {
        topK: number;
        minScore: number;
        reranking: {
            model: string;
            enabled: boolean;
            topN: number;
        };
        hybridSearch: {
            enabled: boolean;
            keywordWeight: number;
            semanticWeight: number;
        };
    };
    ingestion: {
        chunkSize: number;
        chunkOverlap: number;
        supportedExtensions: string[];
        excludePatterns: string[];
        maxFileSize: number;
        watchMode: boolean;
    };
    agents: {
        orchestrator: {
            model: string;
            maxIterations: number;
            temperature: number;
        };
        retriever: {
            model: string;
            maxResults: number;
        };
        analyzer: {
            model: string;
            contextWindow: number;
        };
        synthesizer: {
            model: string;
            maxTokens: number;
        };
    };
    cache: {
        enabled: boolean;
        maxSize: number;
        ttl: number;
    };
    logging: {
        level: "debug" | "info" | "warn" | "error";
        format: "json" | "text";
        file?: string | undefined;
    };
    mcp: {
        serverName: string;
        version: string;
    };
}, {
    chromadb: {
        host?: string | undefined;
        port?: number | undefined;
        collection?: string | undefined;
        embeddingFunction?: string | undefined;
        persistDirectory?: string | undefined;
    };
    embeddings: {
        provider?: "openai" | "anthropic" | "local" | undefined;
        model?: string | undefined;
        dimensions?: number | undefined;
        batchSize?: number | undefined;
        maxRetries?: number | undefined;
        retryDelay?: number | undefined;
    };
    retrieval: {
        reranking: {
            model?: string | undefined;
            enabled?: boolean | undefined;
            topN?: number | undefined;
        };
        hybridSearch: {
            enabled?: boolean | undefined;
            keywordWeight?: number | undefined;
            semanticWeight?: number | undefined;
        };
        topK?: number | undefined;
        minScore?: number | undefined;
    };
    ingestion: {
        supportedExtensions: string[];
        excludePatterns: string[];
        chunkSize?: number | undefined;
        chunkOverlap?: number | undefined;
        maxFileSize?: number | undefined;
        watchMode?: boolean | undefined;
    };
    agents: {
        orchestrator: {
            model: string;
            maxIterations?: number | undefined;
            temperature?: number | undefined;
        };
        retriever: {
            model: string;
            maxResults?: number | undefined;
        };
        analyzer: {
            model: string;
            contextWindow?: number | undefined;
        };
        synthesizer: {
            model: string;
            maxTokens?: number | undefined;
        };
    };
    cache: {
        enabled?: boolean | undefined;
        maxSize?: number | undefined;
        ttl?: number | undefined;
    };
    logging: {
        level?: "debug" | "info" | "warn" | "error" | undefined;
        format?: "json" | "text" | undefined;
        file?: string | undefined;
    };
    mcp: {
        serverName?: string | undefined;
        version?: string | undefined;
    };
}>;
export type Config = z.infer<typeof ConfigSchema>;
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}
export interface MCPResource {
    uri: string;
    name: string;
    mimeType?: string;
    description?: string;
}
export interface MCPPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}
//# sourceMappingURL=types.d.ts.map