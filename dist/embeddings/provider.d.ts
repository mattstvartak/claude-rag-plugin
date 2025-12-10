import { EmbeddingRequest, EmbeddingResponse } from '../core/types.js';
export interface EmbeddingProvider {
    generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
    generateEmbedding(text: string): Promise<number[]>;
}
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private client;
    private model;
    private dimensions;
    private queue;
    private maxRetries;
    private retryDelay;
    private cache;
    constructor();
    generateEmbeddings(request: EmbeddingRequest): Promise<EmbeddingResponse>;
    private processBatch;
    generateEmbedding(text: string): Promise<number[]>;
}
export declare function createEmbeddingProvider(): EmbeddingProvider;
export declare const getEmbeddingProvider: () => EmbeddingProvider;
//# sourceMappingURL=provider.d.ts.map