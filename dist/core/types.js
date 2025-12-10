import { z } from 'zod';
// Configuration Schema
export const ConfigSchema = z.object({
    chromadb: z.object({
        host: z.string().default('localhost'),
        port: z.number().default(8000),
        collection: z.string().default('claude_rag_documents'),
        persistDirectory: z.string().default('./.chromadb'),
    }),
    embeddings: z.object({
        provider: z.enum(['openai', 'anthropic', 'local', 'chroma']).default('chroma'),
        model: z.string().default('text-embedding-3-small'),
        dimensions: z.number().default(1536),
        batchSize: z.number().default(100),
        maxRetries: z.number().default(3),
        retryDelay: z.number().default(1000),
    }),
    retrieval: z.object({
        topK: z.number().default(10),
        minScore: z.number().default(0.7),
        reranking: z.object({
            enabled: z.boolean().default(true),
            model: z.string().default('claude-3-haiku-20240307'),
            topN: z.number().default(5),
        }),
        hybridSearch: z.object({
            enabled: z.boolean().default(true),
            keywordWeight: z.number().default(0.3),
            semanticWeight: z.number().default(0.7),
        }),
    }),
    ingestion: z.object({
        chunkSize: z.number().default(1000),
        chunkOverlap: z.number().default(200),
        supportedExtensions: z.array(z.string()),
        excludePatterns: z.array(z.string()),
        maxFileSize: z.number().default(1048576),
        watchMode: z.boolean().default(false),
    }),
    agents: z.object({
        orchestrator: z.object({
            model: z.string(),
            maxIterations: z.number().default(10),
            temperature: z.number().default(0.1),
        }),
        retriever: z.object({
            model: z.string(),
            maxResults: z.number().default(20),
        }),
        analyzer: z.object({
            model: z.string(),
            contextWindow: z.number().default(100000),
        }),
        synthesizer: z.object({
            model: z.string(),
            maxTokens: z.number().default(4096),
        }),
    }),
    cache: z.object({
        enabled: z.boolean().default(true),
        maxSize: z.number().default(1000),
        ttl: z.number().default(3600000),
    }),
    logging: z.object({
        level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
        format: z.enum(['json', 'text']).default('json'),
        file: z.string().optional(),
    }),
    mcp: z.object({
        serverName: z.string().default('claude-rag'),
        version: z.string().default('1.0.0'),
    }),
});
//# sourceMappingURL=types.js.map