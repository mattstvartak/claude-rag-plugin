import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { v4 as uuidv4 } from 'uuid';
import { getConfigValue } from './config.js';
import { Document, DocumentMetadata, RetrievalResult } from './types.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('vector-store');

export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;
  private initialized = false;

  constructor() {
    const chromaConfig = getConfigValue('chromadb');
    this.client = new ChromaClient({
      path: `http://${chromaConfig.host}:${chromaConfig.port}`,
    });
    this.collectionName = chromaConfig.collection;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      logger.info('Initializing ChromaDB connection...');

      // Try to get existing collection or create new one
      this.collection = await this.client.getOrCreateCollection({
        name: this.collectionName,
        metadata: {
          description: 'Claude RAG Plugin document collection',
          created: new Date().toISOString(),
        },
      });

      this.initialized = true;
      logger.info('ChromaDB initialized successfully', {
        collection: this.collectionName,
      });
    } catch (error) {
      logger.error('Failed to initialize ChromaDB', { error });
      throw new Error(
        `Failed to connect to ChromaDB. Ensure ChromaDB is running. Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.collection) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }
  }

  async addDocuments(
    documents: Document[],
    embeddings: number[][]
  ): Promise<string[]> {
    this.ensureInitialized();

    const ids = documents.map((doc) => doc.id || uuidv4());
    const contents = documents.map((doc) => doc.content);
    const metadatas = documents.map((doc) => this.flattenMetadata(doc.metadata));

    try {
      await this.collection!.add({
        ids,
        embeddings,
        documents: contents,
        metadatas,
      });

      logger.info('Documents added to vector store', { count: documents.length });
      return ids;
    } catch (error) {
      logger.error('Failed to add documents', { error });
      throw error;
    }
  }

  async updateDocuments(
    ids: string[],
    documents: Document[],
    embeddings: number[][]
  ): Promise<void> {
    this.ensureInitialized();

    const contents = documents.map((doc) => doc.content);
    const metadatas = documents.map((doc) => this.flattenMetadata(doc.metadata));

    try {
      await this.collection!.update({
        ids,
        embeddings,
        documents: contents,
        metadatas,
      });

      logger.info('Documents updated in vector store', { count: ids.length });
    } catch (error) {
      logger.error('Failed to update documents', { error });
      throw error;
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    this.ensureInitialized();

    try {
      await this.collection!.delete({ ids });
      logger.info('Documents deleted from vector store', { count: ids.length });
    } catch (error) {
      logger.error('Failed to delete documents', { error });
      throw error;
    }
  }

  async deleteByFilePath(filePath: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.collection!.delete({
        where: { filePath: { $eq: filePath } },
      });
      logger.info('Documents deleted by file path', { filePath });
    } catch (error) {
      logger.error('Failed to delete documents by file path', { error, filePath });
      throw error;
    }
  }

  async query(
    queryEmbedding: number[],
    topK: number = 10,
    filters?: Record<string, unknown>
  ): Promise<RetrievalResult[]> {
    this.ensureInitialized();

    try {
      const whereClause = filters ? this.buildWhereClause(filters) : undefined;

      const results = await this.collection!.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        where: whereClause,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
      });

      return this.formatResults(results);
    } catch (error) {
      logger.error('Failed to query vector store', { error });
      throw error;
    }
  }

  async getDocumentsByFilePath(filePath: string): Promise<Document[]> {
    this.ensureInitialized();

    try {
      const results = await this.collection!.get({
        where: { filePath: { $eq: filePath } },
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas],
      });

      return this.formatDocuments(results);
    } catch (error) {
      logger.error('Failed to get documents by file path', { error, filePath });
      throw error;
    }
  }

  async getDocumentCount(): Promise<number> {
    this.ensureInitialized();
    return await this.collection!.count();
  }

  async listCollections(): Promise<string[]> {
    const collections = await this.client.listCollections();
    return collections.map((c) => c.name);
  }

  async deleteCollection(): Promise<void> {
    try {
      await this.client.deleteCollection({ name: this.collectionName });
      this.collection = null;
      this.initialized = false;
      logger.info('Collection deleted', { collection: this.collectionName });
    } catch (error) {
      logger.error('Failed to delete collection', { error });
      throw error;
    }
  }

  private flattenMetadata(metadata: DocumentMetadata): Record<string, string | number | boolean> {
    return {
      filePath: metadata.filePath,
      fileName: metadata.fileName,
      fileType: metadata.fileType,
      language: metadata.language || '',
      chunkIndex: metadata.chunkIndex,
      totalChunks: metadata.totalChunks,
      startLine: metadata.startLine || 0,
      endLine: metadata.endLine || 0,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      hash: metadata.hash,
      projectName: metadata.projectName || '',
      tags: metadata.tags?.join(',') || '',
    };
  }

  private unflattenMetadata(metadata: Record<string, unknown>): DocumentMetadata {
    return {
      filePath: String(metadata['filePath'] || ''),
      fileName: String(metadata['fileName'] || ''),
      fileType: String(metadata['fileType'] || ''),
      language: metadata['language'] ? String(metadata['language']) : undefined,
      chunkIndex: Number(metadata['chunkIndex'] || 0),
      totalChunks: Number(metadata['totalChunks'] || 1),
      startLine: metadata['startLine'] ? Number(metadata['startLine']) : undefined,
      endLine: metadata['endLine'] ? Number(metadata['endLine']) : undefined,
      createdAt: String(metadata['createdAt'] || new Date().toISOString()),
      updatedAt: String(metadata['updatedAt'] || new Date().toISOString()),
      hash: String(metadata['hash'] || ''),
      projectName: metadata['projectName'] ? String(metadata['projectName']) : undefined,
      tags: metadata['tags'] ? String(metadata['tags']).split(',').filter(Boolean) : undefined,
    };
  }

  private buildWhereClause(
    filters: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const conditions: Record<string, unknown>[] = [];

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push({ [key]: { $eq: value } });
      }
    }

    if (conditions.length === 0) return undefined;
    if (conditions.length === 1) return conditions[0];
    return { $and: conditions };
  }

  private formatResults(results: {
    ids: string[][];
    documents?: (string | null)[][] | null;
    metadatas?: (Record<string, unknown> | null)[][] | null;
    distances?: number[][] | null;
  }): RetrievalResult[] {
    const ids = results.ids[0] || [];
    const documents = results.documents?.[0] || [];
    const metadatas = results.metadatas?.[0] || [];
    const distances = results.distances?.[0] || [];

    return ids.map((id, index) => ({
      document: {
        id,
        content: documents[index] || '',
        metadata: this.unflattenMetadata(metadatas[index] || {}),
      },
      score: 1 - (distances[index] || 0), // Convert distance to similarity score
    }));
  }

  private formatDocuments(results: {
    ids: string[];
    documents?: (string | null)[] | null;
    metadatas?: (Record<string, unknown> | null)[] | null;
  }): Document[] {
    const ids = results.ids || [];
    const documents = results.documents || [];
    const metadatas = results.metadatas || [];

    return ids.map((id, index) => ({
      id,
      content: documents[index] || '',
      metadata: this.unflattenMetadata(metadatas[index] || {}),
    }));
  }
}

// Singleton instance
let vectorStoreInstance: VectorStore | null = null;

export const getVectorStore = (): VectorStore => {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
  }
  return vectorStoreInstance;
};
