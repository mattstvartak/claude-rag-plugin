import { readFile, stat } from 'fs/promises';
import { basename, extname, resolve } from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import PQueue from 'p-queue';
import { getConfigValue } from '../core/config.js';
import { getVectorStore } from '../core/vector-store.js';
import { createChildLogger } from '../utils/logger.js';
import { hashContent } from '../utils/hashing.js';
import { DocumentChunker } from './chunker.js';
import { getEmbeddingProvider } from './provider.js';
import { getPDFFetcher } from '../fetchers/pdf-fetcher.js';
const logger = createChildLogger('ingestion');
export class DocumentIngestionService {
    chunker;
    queue;
    watcher = null;
    fileHashes = new Map();
    constructor() {
        this.chunker = new DocumentChunker();
        this.queue = new PQueue({ concurrency: 5 });
    }
    async ingestDirectory(directoryPath, options = {}) {
        const ingestionConfig = getConfigValue('ingestion');
        const stats = {
            totalFiles: 0,
            processedFiles: 0,
            skippedFiles: 0,
            totalChunks: 0,
            errors: [],
            startTime: new Date(),
        };
        const resolvedPath = resolve(directoryPath);
        logger.info('Starting directory ingestion', { path: resolvedPath });
        // Build glob patterns
        const includePatterns = ingestionConfig.supportedExtensions.map((ext) => `**/*${ext}`);
        // Get all matching files
        const files = [];
        for (const pattern of includePatterns) {
            const matches = await glob(pattern, {
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
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        const embeddingProvider = getEmbeddingProvider();
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
        const ingestionConfig = getConfigValue('ingestion');
        // Check file size
        const fileStat = await stat(filePath);
        if (fileStat.size > ingestionConfig.maxFileSize) {
            logger.debug('File too large, skipping', { filePath, size: fileStat.size });
            return { skipped: true, chunks: 0 };
        }
        // Read file content
        const content = await readFile(filePath, 'utf-8');
        const contentHash = hashContent(content);
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
        const fileName = basename(filePath);
        const fileType = extname(filePath);
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
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        const embeddingProvider = getEmbeddingProvider();
        const result = await this.processFile(resolve(filePath), vectorStore, embeddingProvider, { ...options, forceReindex: true });
        return { chunks: result.chunks };
    }
    async removeFile(filePath) {
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        await vectorStore.deleteByFilePath(resolve(filePath));
        this.fileHashes.delete(resolve(filePath));
        logger.info('File removed from index', { filePath });
    }
    startWatching(directoryPath, options = {}) {
        const ingestionConfig = getConfigValue('ingestion');
        const resolvedPath = resolve(directoryPath);
        logger.info('Starting file watcher', { path: resolvedPath });
        this.watcher = chokidar.watch(resolvedPath, {
            ignored: ingestionConfig.excludePatterns,
            persistent: true,
            ignoreInitial: true,
        });
        this.watcher.on('add', async (filePath) => {
            const ext = extname(filePath);
            if (ingestionConfig.supportedExtensions.includes(ext)) {
                logger.info('New file detected', { filePath });
                await this.ingestFile(filePath, options);
            }
        });
        this.watcher.on('change', async (filePath) => {
            const ext = extname(filePath);
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
    /**
     * Ingest a PDF from a URL
     */
    async ingestPDFFromURL(url, options = {}) {
        logger.info('Starting PDF ingestion from URL', { url });
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        const embeddingProvider = getEmbeddingProvider();
        try {
            // Fetch and parse the PDF
            const pdfFetcher = getPDFFetcher();
            const pdfContent = await pdfFetcher.fetchAndParse(url, {
                maxSizeMB: options.maxSizeMB,
                timeout: options.timeout,
            });
            // Generate a document name
            const documentName = options.documentName ||
                pdfContent.metadata.title ||
                this.extractNameFromURL(url);
            // Use URL as the "file path" for storage
            const sourcePath = `pdf://${url}`;
            // Check if already indexed (unless force reindex)
            if (!options.forceReindex) {
                const existingDocs = await vectorStore.getDocumentsByFilePath(sourcePath);
                if (existingDocs.length > 0 && existingDocs[0]?.metadata.hash === pdfContent.hash) {
                    logger.info('PDF already indexed and unchanged', { url });
                    return {
                        success: true,
                        documentName,
                        sourceUrl: url,
                        chunks: existingDocs.length,
                        pages: pdfContent.metadata.pageCount,
                        textLength: pdfContent.text.length,
                        metadata: {
                            title: pdfContent.metadata.title,
                            author: pdfContent.metadata.author,
                            pageCount: pdfContent.metadata.pageCount,
                        },
                    };
                }
            }
            // Delete existing documents for this URL
            await vectorStore.deleteByFilePath(sourcePath);
            // Chunk the PDF content
            const chunks = this.chunker.chunkPDFDocument(pdfContent.text, sourcePath, documentName, options.projectName, { pages: pdfContent.pages });
            if (chunks.length === 0) {
                return {
                    success: false,
                    documentName,
                    sourceUrl: url,
                    chunks: 0,
                    pages: pdfContent.metadata.pageCount,
                    textLength: pdfContent.text.length,
                    error: 'No content could be extracted from the PDF',
                };
            }
            // Update metadata with PDF-specific info
            for (const chunk of chunks) {
                chunk.metadata.hash = pdfContent.hash;
                // Store URL info in tags for easy querying
                chunk.metadata.tags = [
                    'pdf',
                    `source:${url}`,
                    ...(pdfContent.metadata.title ? [`title:${pdfContent.metadata.title}`] : []),
                    ...(pdfContent.metadata.author ? [`author:${pdfContent.metadata.author}`] : []),
                ];
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
            logger.info('PDF ingested successfully', {
                url,
                documentName,
                chunks: chunks.length,
                pages: pdfContent.metadata.pageCount,
            });
            return {
                success: true,
                documentName,
                sourceUrl: url,
                chunks: chunks.length,
                pages: pdfContent.metadata.pageCount,
                textLength: pdfContent.text.length,
                metadata: {
                    title: pdfContent.metadata.title,
                    author: pdfContent.metadata.author,
                    pageCount: pdfContent.metadata.pageCount,
                },
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error('Failed to ingest PDF from URL', { url, error: errorMessage });
            return {
                success: false,
                documentName: options.documentName || this.extractNameFromURL(url),
                sourceUrl: url,
                chunks: 0,
                pages: 0,
                textLength: 0,
                error: errorMessage,
            };
        }
    }
    /**
     * Remove an indexed PDF by its source URL
     */
    async removePDF(url) {
        const sourcePath = `pdf://${url}`;
        const vectorStore = getVectorStore();
        await vectorStore.initialize();
        await vectorStore.deleteByFilePath(sourcePath);
        logger.info('PDF removed from index', { url });
    }
    extractNameFromURL(url) {
        try {
            const parsedUrl = new URL(url);
            const pathname = parsedUrl.pathname;
            const filename = basename(pathname);
            // Remove .pdf extension if present
            const nameWithoutExt = filename.replace(/\.pdf$/i, '');
            // Clean up URL encoding
            const decoded = decodeURIComponent(nameWithoutExt);
            // Replace underscores and dashes with spaces
            const cleaned = decoded.replace(/[-_]+/g, ' ');
            return cleaned || 'Untitled PDF';
        }
        catch {
            return 'Untitled PDF';
        }
    }
}
// Singleton instance
let ingestionServiceInstance = null;
export const getIngestionService = () => {
    if (!ingestionServiceInstance) {
        ingestionServiceInstance = new DocumentIngestionService();
    }
    return ingestionServiceInstance;
};
//# sourceMappingURL=ingestion.js.map