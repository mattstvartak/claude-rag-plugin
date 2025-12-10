"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVectorStore = exports.VectorStore = void 0;
const chromadb_1 = require("chromadb");
const uuid_1 = require("uuid");
const config_js_1 = require("./config.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createChildLogger)('vector-store');
class VectorStore {
    client;
    collection = null;
    collectionName;
    initialized = false;
    constructor() {
        const chromaConfig = (0, config_js_1.getConfigValue)('chromadb');
        this.client = new chromadb_1.ChromaClient({
            path: `http://${chromaConfig.host}:${chromaConfig.port}`,
        });
        this.collectionName = chromaConfig.collection;
    }
    async initialize() {
        if (this.initialized)
            return;
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
        }
        catch (error) {
            logger.error('Failed to initialize ChromaDB', { error });
            throw new Error(`Failed to connect to ChromaDB. Ensure ChromaDB is running. Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    ensureInitialized() {
        if (!this.initialized || !this.collection) {
            throw new Error('VectorStore not initialized. Call initialize() first.');
        }
    }
    async addDocuments(documents, embeddings) {
        this.ensureInitialized();
        const ids = documents.map((doc) => doc.id || (0, uuid_1.v4)());
        const contents = documents.map((doc) => doc.content);
        const metadatas = documents.map((doc) => this.flattenMetadata(doc.metadata));
        try {
            await this.collection.add({
                ids,
                embeddings,
                documents: contents,
                metadatas,
            });
            logger.info('Documents added to vector store', { count: documents.length });
            return ids;
        }
        catch (error) {
            logger.error('Failed to add documents', { error });
            throw error;
        }
    }
    async updateDocuments(ids, documents, embeddings) {
        this.ensureInitialized();
        const contents = documents.map((doc) => doc.content);
        const metadatas = documents.map((doc) => this.flattenMetadata(doc.metadata));
        try {
            await this.collection.update({
                ids,
                embeddings,
                documents: contents,
                metadatas,
            });
            logger.info('Documents updated in vector store', { count: ids.length });
        }
        catch (error) {
            logger.error('Failed to update documents', { error });
            throw error;
        }
    }
    async deleteDocuments(ids) {
        this.ensureInitialized();
        try {
            await this.collection.delete({ ids });
            logger.info('Documents deleted from vector store', { count: ids.length });
        }
        catch (error) {
            logger.error('Failed to delete documents', { error });
            throw error;
        }
    }
    async deleteByFilePath(filePath) {
        this.ensureInitialized();
        try {
            await this.collection.delete({
                where: { filePath: { $eq: filePath } },
            });
            logger.info('Documents deleted by file path', { filePath });
        }
        catch (error) {
            logger.error('Failed to delete documents by file path', { error, filePath });
            throw error;
        }
    }
    async query(queryEmbedding, topK = 10, filters) {
        this.ensureInitialized();
        try {
            const whereClause = filters ? this.buildWhereClause(filters) : undefined;
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: topK,
                where: whereClause,
                include: [chromadb_1.IncludeEnum.Documents, chromadb_1.IncludeEnum.Metadatas, chromadb_1.IncludeEnum.Distances],
            });
            return this.formatResults(results);
        }
        catch (error) {
            logger.error('Failed to query vector store', { error });
            throw error;
        }
    }
    async getDocumentsByFilePath(filePath) {
        this.ensureInitialized();
        try {
            const results = await this.collection.get({
                where: { filePath: { $eq: filePath } },
                include: [chromadb_1.IncludeEnum.Documents, chromadb_1.IncludeEnum.Metadatas],
            });
            return this.formatDocuments(results);
        }
        catch (error) {
            logger.error('Failed to get documents by file path', { error, filePath });
            throw error;
        }
    }
    async getDocumentCount() {
        this.ensureInitialized();
        return await this.collection.count();
    }
    async listCollections() {
        const collections = await this.client.listCollections();
        return collections.map((c) => c.name);
    }
    async deleteCollection() {
        try {
            await this.client.deleteCollection({ name: this.collectionName });
            this.collection = null;
            this.initialized = false;
            logger.info('Collection deleted', { collection: this.collectionName });
        }
        catch (error) {
            logger.error('Failed to delete collection', { error });
            throw error;
        }
    }
    flattenMetadata(metadata) {
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
    unflattenMetadata(metadata) {
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
    buildWhereClause(filters) {
        const conditions = [];
        for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== null) {
                conditions.push({ [key]: { $eq: value } });
            }
        }
        if (conditions.length === 0)
            return undefined;
        if (conditions.length === 1)
            return conditions[0];
        return { $and: conditions };
    }
    formatResults(results) {
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
    formatDocuments(results) {
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
exports.VectorStore = VectorStore;
// Singleton instance
let vectorStoreInstance = null;
const getVectorStore = () => {
    if (!vectorStoreInstance) {
        vectorStoreInstance = new VectorStore();
    }
    return vectorStoreInstance;
};
exports.getVectorStore = getVectorStore;
//# sourceMappingURL=vector-store.js.map