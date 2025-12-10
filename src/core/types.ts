import { z } from 'zod';

// Document Types
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

// Retrieval Types
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

// Embedding Types
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

// Agent Types
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

// Orchestration Types
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

// Configuration Schema
export const ConfigSchema = z.object({
  chromadb: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(8000),
    collection: z.string().default('claude_rag_documents'),
    embeddingFunction: z.string().default('openai'),
    persistDirectory: z.string().default('./.chromadb'),
  }),
  embeddings: z.object({
    provider: z.enum(['openai', 'anthropic', 'local']).default('openai'),
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

export type Config = z.infer<typeof ConfigSchema>;

// MCP Types
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
