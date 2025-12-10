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
}
export declare const getIngestionService: () => DocumentIngestionService;
export {};
//# sourceMappingURL=ingestion.d.ts.map