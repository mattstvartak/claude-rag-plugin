"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
const zod_1 = require("zod");
// Configuration Schema
exports.ConfigSchema = zod_1.z.object({
    chromadb: zod_1.z.object({
        host: zod_1.z.string().default('localhost'),
        port: zod_1.z.number().default(8000),
        collection: zod_1.z.string().default('claude_rag_documents'),
        embeddingFunction: zod_1.z.string().default('openai'),
        persistDirectory: zod_1.z.string().default('./.chromadb'),
    }),
    embeddings: zod_1.z.object({
        provider: zod_1.z.enum(['openai', 'anthropic', 'local']).default('openai'),
        model: zod_1.z.string().default('text-embedding-3-small'),
        dimensions: zod_1.z.number().default(1536),
        batchSize: zod_1.z.number().default(100),
        maxRetries: zod_1.z.number().default(3),
        retryDelay: zod_1.z.number().default(1000),
    }),
    retrieval: zod_1.z.object({
        topK: zod_1.z.number().default(10),
        minScore: zod_1.z.number().default(0.7),
        reranking: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            model: zod_1.z.string().default('claude-3-haiku-20240307'),
            topN: zod_1.z.number().default(5),
        }),
        hybridSearch: zod_1.z.object({
            enabled: zod_1.z.boolean().default(true),
            keywordWeight: zod_1.z.number().default(0.3),
            semanticWeight: zod_1.z.number().default(0.7),
        }),
    }),
    ingestion: zod_1.z.object({
        chunkSize: zod_1.z.number().default(1000),
        chunkOverlap: zod_1.z.number().default(200),
        supportedExtensions: zod_1.z.array(zod_1.z.string()),
        excludePatterns: zod_1.z.array(zod_1.z.string()),
        maxFileSize: zod_1.z.number().default(1048576),
        watchMode: zod_1.z.boolean().default(false),
    }),
    agents: zod_1.z.object({
        orchestrator: zod_1.z.object({
            model: zod_1.z.string(),
            maxIterations: zod_1.z.number().default(10),
            temperature: zod_1.z.number().default(0.1),
        }),
        retriever: zod_1.z.object({
            model: zod_1.z.string(),
            maxResults: zod_1.z.number().default(20),
        }),
        analyzer: zod_1.z.object({
            model: zod_1.z.string(),
            contextWindow: zod_1.z.number().default(100000),
        }),
        synthesizer: zod_1.z.object({
            model: zod_1.z.string(),
            maxTokens: zod_1.z.number().default(4096),
        }),
    }),
    cache: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        maxSize: zod_1.z.number().default(1000),
        ttl: zod_1.z.number().default(3600000),
    }),
    logging: zod_1.z.object({
        level: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        format: zod_1.z.enum(['json', 'text']).default('json'),
        file: zod_1.z.string().optional(),
    }),
    mcp: zod_1.z.object({
        serverName: zod_1.z.string().default('claude-rag'),
        version: zod_1.z.string().default('1.0.0'),
    }),
});
//# sourceMappingURL=types.js.map