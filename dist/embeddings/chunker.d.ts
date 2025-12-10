import { DocumentChunk } from '../core/types.js';
interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    preserveCodeBlocks?: boolean;
    preserveMarkdownStructure?: boolean;
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
    private estimateTokenCount;
}
export declare const createChunker: (options?: ChunkOptions) => DocumentChunker;
export {};
//# sourceMappingURL=chunker.d.ts.map