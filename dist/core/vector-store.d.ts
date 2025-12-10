import { Document, RetrievalResult } from './types.js';
export declare class VectorStore {
    private client;
    private collection;
    private collectionName;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    private ensureInitialized;
    addDocuments(documents: Document[], embeddings: number[][]): Promise<string[]>;
    updateDocuments(ids: string[], documents: Document[], embeddings: number[][]): Promise<void>;
    deleteDocuments(ids: string[]): Promise<void>;
    deleteByFilePath(filePath: string): Promise<void>;
    query(queryEmbedding: number[], topK?: number, filters?: Record<string, unknown>): Promise<RetrievalResult[]>;
    getDocumentsByFilePath(filePath: string): Promise<Document[]>;
    getDocumentCount(): Promise<number>;
    listCollections(): Promise<string[]>;
    deleteCollection(): Promise<void>;
    private flattenMetadata;
    private unflattenMetadata;
    private buildWhereClause;
    private formatResults;
    private formatDocuments;
}
export declare const getVectorStore: () => VectorStore;
//# sourceMappingURL=vector-store.d.ts.map