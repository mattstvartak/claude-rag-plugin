import { DocumentChunk } from '../core/types.js';
import type { PDFPage } from '../fetchers/pdf-fetcher.js';
interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    preserveCodeBlocks?: boolean;
    preserveMarkdownStructure?: boolean;
}
interface PDFChunkOptions extends ChunkOptions {
    sourceUrl?: string;
    pages?: PDFPage[];
}
export declare class DocumentChunker {
    private chunkSize;
    private chunkOverlap;
    constructor(options?: ChunkOptions);
    chunkDocument(content: string, filePath: string, fileName: string, fileType: string, projectName?: string): DocumentChunk[];
    private chunkCode;
    private findCodeBoundaries;
    private chunkMarkdown;
    private chunkText;
    private getOverlapLines;
    private detectLanguage;
    private isCodeFile;
    private isMarkdownFile;
    private isPDFFile;
    private estimateTokenCount;
    /**
     * Chunk a PDF document, optionally using page information for better boundaries
     */
    chunkPDFDocument(content: string, sourcePath: string, documentName: string, projectName?: string, options?: PDFChunkOptions): DocumentChunk[];
    private chunkPDFByPages;
    private chunkLargePage;
    private chunkPDFText;
    private getTextOverlap;
}
export declare const createChunker: (options?: ChunkOptions) => DocumentChunker;
export {};
//# sourceMappingURL=chunker.d.ts.map