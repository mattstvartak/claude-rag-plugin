interface IngestionStats {
    totalFiles: number;
    processedFiles: number;
    skippedFiles: number;
    totalChunks: number;
    errors: Array<{
        file: string;
        error: string;
    }>;
    startTime: Date;
    endTime?: Date;
}
interface IngestionOptions {
    projectName?: string;
    forceReindex?: boolean;
    onProgress?: (stats: IngestionStats) => void;
}
interface PDFIngestionOptions {
    projectName?: string;
    documentName?: string;
    forceReindex?: boolean;
    maxSizeMB?: number;
    timeout?: number;
}
interface PDFIngestionResult {
    success: boolean;
    documentName: string;
    sourceUrl: string;
    chunks: number;
    pages: number;
    textLength: number;
    metadata?: {
        title?: string;
        author?: string;
        pageCount: number;
    };
    error?: string;
}
export declare class DocumentIngestionService {
    private chunker;
    private queue;
    private watcher;
    private fileHashes;
    constructor();
    ingestDirectory(directoryPath: string, options?: IngestionOptions): Promise<IngestionStats>;
    private processFile;
    ingestFile(filePath: string, options?: IngestionOptions): Promise<{
        chunks: number;
    }>;
    removeFile(filePath: string): Promise<void>;
    startWatching(directoryPath: string, options?: IngestionOptions): void;
    stopWatching(): void;
    /**
     * Ingest a PDF from a URL
     */
    ingestPDFFromURL(url: string, options?: PDFIngestionOptions): Promise<PDFIngestionResult>;
    /**
     * Remove an indexed PDF by its source URL
     */
    removePDF(url: string): Promise<void>;
    private extractNameFromURL;
}
export declare const getIngestionService: () => DocumentIngestionService;
export {};
//# sourceMappingURL=ingestion.d.ts.map