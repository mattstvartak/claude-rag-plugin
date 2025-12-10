"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIngestionService = exports.DocumentIngestionService = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const glob_1 = require("glob");
const chokidar_1 = __importDefault(require("chokidar"));
const p_queue_1 = __importDefault(require("p-queue"));
const config_js_1 = require("../core/config.js");
const vector_store_js_1 = require("../core/vector-store.js");
const logger_js_1 = require("../utils/logger.js");
const hashing_js_1 = require("../utils/hashing.js");
const chunker_js_1 = require("./chunker.js");
const provider_js_1 = require("./provider.js");
const logger = (0, logger_js_1.createChildLogger)('ingestion');
class DocumentIngestionService {
    chunker;
    queue;
    watcher = null;
    fileHashes = new Map();
    constructor() {
        this.chunker = new chunker_js_1.DocumentChunker();
        this.queue = new p_queue_1.default({ concurrency: 5 });
    }
    async ingestDirectory(directoryPath, options = {}) {
        const ingestionConfig = (0, config_js_1.getConfigValue)('ingestion');
        const stats = {
            totalFiles: 0,
            processedFiles: 0,
            skippedFiles: 0,
            totalChunks: 0,
            errors: [],
            startTime: new Date(),
        };
        const resolvedPath = (0, path_1.resolve)(directoryPath);
        logger.info('Starting directory ingestion', { path: resolvedPath });
        // Build glob patterns
        const includePatterns = ingestionConfig.supportedExtensions.map((ext) => `**/*${ext}`);
        // Get all matching files
        const files = [];
        for (const pattern of includePatterns) {
            const matches = await (0, glob_1.glob)(pattern, {
                cwd: resolvedPath,
                absolute: true,
                ignore: ingestionConfig.excludePatterns,
                nodir: true,
            });
            files.push(...matches);
        }
        // Remove duplicates
        const uniqueFiles = [...new Set(files)];
        stats.totalFiles = uniqueFiles.length;
        logger.info('Found files to process', { count: uniqueFiles.length });
        // Initialize services
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        const embeddingProvider = (0, provider_js_1.getEmbeddingProvider)();
        // Process files in parallel with queue
        const processPromises = uniqueFiles.map((filePath) => this.queue.add(async () => {
            try {
                const result = await this.processFile(filePath, vectorStore, embeddingProvider, options);
                if (result.skipped) {
                    stats.skippedFiles++;
                }
                else {
                    stats.processedFiles++;
                    stats.totalChunks += result.chunks;
                }
                if (options.onProgress) {
                    options.onProgress({ ...stats });
                }
            }
            catch (error) {
                stats.errors.push({
                    file: filePath,
                    error: error instanceof Error ? error.message : String(error),
                });
                logger.error('Failed to process file', { filePath, error });
            }
        }));
        await Promise.all(processPromises);
        stats.endTime = new Date();
        logger.info('Directory ingestion completed', {
            processed: stats.processedFiles,
            skipped: stats.skippedFiles,
            chunks: stats.totalChunks,
            errors: stats.errors.length,
            duration: `${(stats.endTime.getTime() - stats.startTime.getTime()) / 1000}s`,
        });
        return stats;
    }
    async processFile(filePath, vectorStore, embeddingProvider, options) {
        const ingestionConfig = (0, config_js_1.getConfigValue)('ingestion');
        // Check file size
        const fileStat = await (0, promises_1.stat)(filePath);
        if (fileStat.size > ingestionConfig.maxFileSize) {
            logger.debug('File too large, skipping', { filePath, size: fileStat.size });
            return { skipped: true, chunks: 0 };
        }
        // Read file content
        const content = await (0, promises_1.readFile)(filePath, 'utf-8');
        const contentHash = (0, hashing_js_1.hashContent)(content);
        // Check if file has changed
        if (!options.forceReindex) {
            const existingHash = this.fileHashes.get(filePath);
            if (existingHash === contentHash) {
                logger.debug('File unchanged, skipping', { filePath });
                return { skipped: true, chunks: 0 };
            }
            // Check existing documents in vector store
            const existingDocs = await vectorStore.getDocumentsByFilePath(filePath);
            if (existingDocs.length > 0 && existingDocs[0]?.metadata.hash === contentHash) {
                this.fileHashes.set(filePath, contentHash);
                return { skipped: true, chunks: 0 };
            }
        }
        // Delete existing documents for this file
        await vectorStore.deleteByFilePath(filePath);
        // Chunk the document
        const fileName = (0, path_1.basename)(filePath);
        const fileType = (0, path_1.extname)(filePath);
        const chunks = this.chunker.chunkDocument(content, filePath, fileName, fileType, options.projectName);
        if (chunks.length === 0) {
            return { skipped: true, chunks: 0 };
        }
        // Generate embeddings
        const embeddings = await embeddingProvider.generateEmbeddings({
            texts: chunks.map((c) => c.content),
        });
        // Store in vector database
        await vectorStore.addDocuments(chunks.map((c) => ({
            id: c.id,
            content: c.content,
            metadata: c.metadata,
        })), embeddings.embeddings);
        // Update hash cache
        this.fileHashes.set(filePath, contentHash);
        logger.debug('File processed', { filePath, chunks: chunks.length });
        return { skipped: false, chunks: chunks.length };
    }
    async ingestFile(filePath, options = {}) {
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        const embeddingProvider = (0, provider_js_1.getEmbeddingProvider)();
        const result = await this.processFile((0, path_1.resolve)(filePath), vectorStore, embeddingProvider, { ...options, forceReindex: true });
        return { chunks: result.chunks };
    }
    async removeFile(filePath) {
        const vectorStore = (0, vector_store_js_1.getVectorStore)();
        await vectorStore.initialize();
        await vectorStore.deleteByFilePath((0, path_1.resolve)(filePath));
        this.fileHashes.delete((0, path_1.resolve)(filePath));
        logger.info('File removed from index', { filePath });
    }
    startWatching(directoryPath, options = {}) {
        const ingestionConfig = (0, config_js_1.getConfigValue)('ingestion');
        const resolvedPath = (0, path_1.resolve)(directoryPath);
        logger.info('Starting file watcher', { path: resolvedPath });
        this.watcher = chokidar_1.default.watch(resolvedPath, {
            ignored: ingestionConfig.excludePatterns,
            persistent: true,
            ignoreInitial: true,
        });
        this.watcher.on('add', async (filePath) => {
            const ext = (0, path_1.extname)(filePath);
            if (ingestionConfig.supportedExtensions.includes(ext)) {
                logger.info('New file detected', { filePath });
                await this.ingestFile(filePath, options);
            }
        });
        this.watcher.on('change', async (filePath) => {
            const ext = (0, path_1.extname)(filePath);
            if (ingestionConfig.supportedExtensions.includes(ext)) {
                logger.info('File change detected', { filePath });
                await this.ingestFile(filePath, options);
            }
        });
        this.watcher.on('unlink', async (filePath) => {
            logger.info('File deletion detected', { filePath });
            await this.removeFile(filePath);
        });
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            logger.info('File watcher stopped');
        }
    }
}
exports.DocumentIngestionService = DocumentIngestionService;
// Singleton instance
let ingestionServiceInstance = null;
const getIngestionService = () => {
    if (!ingestionServiceInstance) {
        ingestionServiceInstance = new DocumentIngestionService();
    }
    return ingestionServiceInstance;
};
exports.getIngestionService = getIngestionService;
//# sourceMappingURL=ingestion.js.map