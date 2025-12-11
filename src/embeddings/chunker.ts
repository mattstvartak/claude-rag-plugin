import { getConfigValue } from '../core/config.js';
import { DocumentChunk, DocumentMetadata } from '../core/types.js';
import { createChildLogger } from '../utils/logger.js';
import { generateDocumentId, hashContent } from '../utils/hashing.js';
import type { PDFPage } from '../fetchers/pdf-fetcher.js';

const logger = createChildLogger('chunker');

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

interface LineInfo {
  content: string;
  lineNumber: number;
}

export class DocumentChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(options?: ChunkOptions) {
    const ingestionConfig = getConfigValue('ingestion');
    this.chunkSize = options?.chunkSize ?? ingestionConfig.chunkSize;
    this.chunkOverlap = options?.chunkOverlap ?? ingestionConfig.chunkOverlap;
  }

  chunkDocument(
    content: string,
    filePath: string,
    fileName: string,
    fileType: string,
    projectName?: string
  ): DocumentChunk[] {
    const language = this.detectLanguage(fileType);
    const chunks: DocumentChunk[] = [];

    // Choose chunking strategy based on file type
    let rawChunks: { content: string; startLine: number; endLine: number }[];

    if (this.isCodeFile(fileType)) {
      rawChunks = this.chunkCode(content, language);
    } else if (this.isMarkdownFile(fileType)) {
      rawChunks = this.chunkMarkdown(content);
    } else {
      rawChunks = this.chunkText(content);
    }

    const now = new Date().toISOString();

    rawChunks.forEach((chunk, index) => {
      const metadata: DocumentMetadata = {
        filePath,
        fileName,
        fileType,
        language,
        chunkIndex: index,
        totalChunks: rawChunks.length,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        createdAt: now,
        updatedAt: now,
        hash: hashContent(chunk.content),
        projectName,
      };

      chunks.push({
        id: generateDocumentId(filePath, index),
        content: chunk.content,
        metadata,
        tokenCount: this.estimateTokenCount(chunk.content),
      });
    });

    logger.debug('Document chunked', {
      filePath,
      totalChunks: chunks.length,
    });

    return chunks;
  }

  private chunkCode(
    content: string,
    language?: string
  ): { content: string; startLine: number; endLine: number }[] {
    const lines = content.split('\n');
    const chunks: { content: string; startLine: number; endLine: number }[] = [];

    // Try to split on logical boundaries (functions, classes, etc.)
    const boundaries = this.findCodeBoundaries(lines, language);

    if (boundaries.length > 0) {
      let currentChunk: LineInfo[] = [];
      let currentSize = 0;
      let chunkStartLine = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineSize = line.length + 1; // +1 for newline

        // Check if this is a boundary and we have content
        if (boundaries.includes(i) && currentChunk.length > 0) {
          // If current chunk is big enough, save it
          if (currentSize >= this.chunkSize * 0.5) {
            chunks.push({
              content: currentChunk.map((l) => l.content).join('\n'),
              startLine: chunkStartLine,
              endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
            });

            // Start new chunk with overlap
            const overlapLines = this.getOverlapLines(currentChunk);
            currentChunk = overlapLines;
            currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
            chunkStartLine = overlapLines.length > 0 ? overlapLines[0]!.lineNumber : i + 1;
          }
        }

        currentChunk.push({ content: line, lineNumber: i + 1 });
        currentSize += lineSize;

        // Force split if chunk is too large
        if (currentSize >= this.chunkSize) {
          chunks.push({
            content: currentChunk.map((l) => l.content).join('\n'),
            startLine: chunkStartLine,
            endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
          });

          const overlapLines = this.getOverlapLines(currentChunk);
          currentChunk = overlapLines;
          currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
          chunkStartLine = overlapLines.length > 0 ? overlapLines[0]!.lineNumber : i + 2;
        }
      }

      // Don't forget the last chunk
      if (currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.map((l) => l.content).join('\n'),
          startLine: chunkStartLine,
          endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
        });
      }
    } else {
      // Fall back to simple text chunking
      return this.chunkText(content);
    }

    return chunks;
  }

  private findCodeBoundaries(lines: string[], language?: string): number[] {
    const boundaries: number[] = [];

    // Common patterns for function/class definitions
    const patterns: RegExp[] = [
      // JavaScript/TypeScript
      /^(export\s+)?(async\s+)?function\s+\w+/,
      /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(/,
      /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?function/,
      /^(export\s+)?class\s+\w+/,
      /^(export\s+)?interface\s+\w+/,
      /^(export\s+)?type\s+\w+/,
      /^(export\s+)?enum\s+\w+/,
      // Python
      /^(async\s+)?def\s+\w+/,
      /^class\s+\w+/,
      // Go
      /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/,
      /^type\s+\w+\s+(struct|interface)/,
      // Rust
      /^(pub\s+)?(async\s+)?fn\s+\w+/,
      /^(pub\s+)?struct\s+\w+/,
      /^(pub\s+)?impl\s+/,
      /^(pub\s+)?trait\s+\w+/,
      // Java
      /^(public|private|protected)?\s*(static\s+)?(class|interface|enum)\s+\w+/,
      /^(public|private|protected)?\s*(static\s+)?(\w+\s+)+\w+\s*\(/,
    ];

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      for (const pattern of patterns) {
        if (pattern.test(trimmedLine)) {
          boundaries.push(index);
          break;
        }
      }
    });

    return boundaries;
  }

  private chunkMarkdown(
    content: string
  ): { content: string; startLine: number; endLine: number }[] {
    const lines = content.split('\n');
    const chunks: { content: string; startLine: number; endLine: number }[] = [];

    let currentChunk: LineInfo[] = [];
    let currentSize = 0;
    let chunkStartLine = 1;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineSize = line.length + 1;

      // Track code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Check for heading (potential split point)
      const isHeading = /^#{1,6}\s/.test(line) && !inCodeBlock;

      if (isHeading && currentChunk.length > 0 && currentSize >= this.chunkSize * 0.3) {
        chunks.push({
          content: currentChunk.map((l) => l.content).join('\n'),
          startLine: chunkStartLine,
          endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
        });

        currentChunk = [];
        currentSize = 0;
        chunkStartLine = i + 1;
      }

      currentChunk.push({ content: line, lineNumber: i + 1 });
      currentSize += lineSize;

      // Force split if chunk is too large (but not in code block)
      if (currentSize >= this.chunkSize && !inCodeBlock) {
        chunks.push({
          content: currentChunk.map((l) => l.content).join('\n'),
          startLine: chunkStartLine,
          endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
        });

        const overlapLines = this.getOverlapLines(currentChunk);
        currentChunk = overlapLines;
        currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
        chunkStartLine = overlapLines.length > 0 ? overlapLines[0]!.lineNumber : i + 2;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.map((l) => l.content).join('\n'),
        startLine: chunkStartLine,
        endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
      });
    }

    return chunks;
  }

  private chunkText(
    content: string
  ): { content: string; startLine: number; endLine: number }[] {
    const lines = content.split('\n');
    const chunks: { content: string; startLine: number; endLine: number }[] = [];

    let currentChunk: LineInfo[] = [];
    let currentSize = 0;
    let chunkStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineSize = line.length + 1;

      currentChunk.push({ content: line, lineNumber: i + 1 });
      currentSize += lineSize;

      if (currentSize >= this.chunkSize) {
        chunks.push({
          content: currentChunk.map((l) => l.content).join('\n'),
          startLine: chunkStartLine,
          endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
        });

        const overlapLines = this.getOverlapLines(currentChunk);
        currentChunk = overlapLines;
        currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
        chunkStartLine = overlapLines.length > 0 ? overlapLines[0]!.lineNumber : i + 2;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.map((l) => l.content).join('\n'),
        startLine: chunkStartLine,
        endLine: currentChunk[currentChunk.length - 1]!.lineNumber,
      });
    }

    return chunks;
  }

  private getOverlapLines(chunk: LineInfo[]): LineInfo[] {
    if (this.chunkOverlap <= 0) return [];

    let overlapSize = 0;
    const overlapLines: LineInfo[] = [];

    for (let i = chunk.length - 1; i >= 0; i--) {
      const line = chunk[i]!;
      const lineSize = line.content.length + 1;

      if (overlapSize + lineSize > this.chunkOverlap) break;

      overlapLines.unshift(line);
      overlapSize += lineSize;
    }

    return overlapLines;
  }

  private detectLanguage(fileType: string): string | undefined {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.php': 'php',
      '.cs': 'csharp',
      '.cpp': 'cpp',
      '.c': 'c',
      '.h': 'c',
      '.hpp': 'cpp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sql': 'sql',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.md': 'markdown',
      '.mdx': 'markdown',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.less': 'less',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.xml': 'xml',
    };

    return languageMap[fileType.toLowerCase()];
  }

  private isCodeFile(fileType: string): boolean {
    const codeExtensions = [
      '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
      '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.hpp', '.swift',
      '.kt', '.scala', '.sh', '.bash', '.zsh',
    ];
    return codeExtensions.includes(fileType.toLowerCase());
  }

  private isMarkdownFile(fileType: string): boolean {
    return ['.md', '.mdx'].includes(fileType.toLowerCase());
  }

  private isPDFFile(fileType: string): boolean {
    return fileType.toLowerCase() === '.pdf';
  }

  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Chunk a PDF document, optionally using page information for better boundaries
   */
  chunkPDFDocument(
    content: string,
    sourcePath: string,
    documentName: string,
    projectName?: string,
    options?: PDFChunkOptions
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const pages = options?.pages;

    // If we have page information, chunk by pages
    if (pages && pages.length > 0) {
      return this.chunkPDFByPages(pages, sourcePath, documentName, projectName);
    }

    // Otherwise, use text-based chunking with larger chunks for PDFs
    const rawChunks = this.chunkPDFText(content);
    const now = new Date().toISOString();

    rawChunks.forEach((chunk, index) => {
      const metadata: DocumentMetadata = {
        filePath: sourcePath,
        fileName: documentName,
        fileType: '.pdf',
        language: 'pdf',
        chunkIndex: index,
        totalChunks: rawChunks.length,
        startLine: chunk.startPage,
        endLine: chunk.endPage,
        createdAt: now,
        updatedAt: now,
        hash: hashContent(chunk.content),
        projectName,
      };

      chunks.push({
        id: generateDocumentId(sourcePath, index),
        content: chunk.content,
        metadata,
        tokenCount: this.estimateTokenCount(chunk.content),
      });
    });

    logger.debug('PDF document chunked', {
      sourcePath,
      totalChunks: chunks.length,
    });

    return chunks;
  }

  private chunkPDFByPages(
    pages: PDFPage[],
    sourcePath: string,
    documentName: string,
    projectName?: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const now = new Date().toISOString();

    let currentChunk: { content: string; startPage: number; endPage: number } | null = null;
    let currentSize = 0;

    for (const page of pages) {
      const pageContent = page.content.trim();
      if (!pageContent) continue;

      const pageSize = pageContent.length;

      // If this page alone exceeds chunk size, split it
      if (pageSize > this.chunkSize) {
        // Save current chunk if exists
        if (currentChunk && currentChunk.content.trim()) {
          const chunkIndex = chunks.length;
          chunks.push({
            id: generateDocumentId(sourcePath, chunkIndex),
            content: currentChunk.content.trim(),
            metadata: {
              filePath: sourcePath,
              fileName: documentName,
              fileType: '.pdf',
              language: 'pdf',
              chunkIndex,
              totalChunks: -1, // Will update later
              startLine: currentChunk.startPage,
              endLine: currentChunk.endPage,
              createdAt: now,
              updatedAt: now,
              hash: hashContent(currentChunk.content),
              projectName,
            },
            tokenCount: this.estimateTokenCount(currentChunk.content),
          });
          currentChunk = null;
          currentSize = 0;
        }

        // Split the large page into smaller chunks
        const subChunks = this.chunkLargePage(pageContent, page.pageNumber);
        for (const subChunk of subChunks) {
          const chunkIndex = chunks.length;
          chunks.push({
            id: generateDocumentId(sourcePath, chunkIndex),
            content: subChunk.content,
            metadata: {
              filePath: sourcePath,
              fileName: documentName,
              fileType: '.pdf',
              language: 'pdf',
              chunkIndex,
              totalChunks: -1,
              startLine: subChunk.startPage,
              endLine: subChunk.endPage,
              createdAt: now,
              updatedAt: now,
              hash: hashContent(subChunk.content),
              projectName,
            },
            tokenCount: this.estimateTokenCount(subChunk.content),
          });
        }
        continue;
      }

      // Check if adding this page would exceed chunk size
      if (currentChunk && currentSize + pageSize > this.chunkSize) {
        // Save current chunk
        const chunkIndex = chunks.length;
        chunks.push({
          id: generateDocumentId(sourcePath, chunkIndex),
          content: currentChunk.content.trim(),
          metadata: {
            filePath: sourcePath,
            fileName: documentName,
            fileType: '.pdf',
            language: 'pdf',
            chunkIndex,
            totalChunks: -1,
            startLine: currentChunk.startPage,
            endLine: currentChunk.endPage,
            createdAt: now,
            updatedAt: now,
            hash: hashContent(currentChunk.content),
            projectName,
          },
          tokenCount: this.estimateTokenCount(currentChunk.content),
        });

        currentChunk = null;
        currentSize = 0;
      }

      // Add page to current chunk
      if (!currentChunk) {
        currentChunk = {
          content: pageContent,
          startPage: page.pageNumber,
          endPage: page.pageNumber,
        };
        currentSize = pageSize;
      } else {
        currentChunk.content += '\n\n' + pageContent;
        currentChunk.endPage = page.pageNumber;
        currentSize += pageSize + 2;
      }
    }

    // Don't forget the last chunk
    if (currentChunk && currentChunk.content.trim()) {
      const chunkIndex = chunks.length;
      chunks.push({
        id: generateDocumentId(sourcePath, chunkIndex),
        content: currentChunk.content.trim(),
        metadata: {
          filePath: sourcePath,
          fileName: documentName,
          fileType: '.pdf',
          language: 'pdf',
          chunkIndex,
          totalChunks: -1,
          startLine: currentChunk.startPage,
          endLine: currentChunk.endPage,
          createdAt: now,
          updatedAt: now,
          hash: hashContent(currentChunk.content),
          projectName,
        },
        tokenCount: this.estimateTokenCount(currentChunk.content),
      });
    }

    // Update totalChunks in all metadata
    for (const chunk of chunks) {
      chunk.metadata.totalChunks = chunks.length;
    }

    return chunks;
  }

  private chunkLargePage(
    content: string,
    pageNumber: number
  ): { content: string; startPage: number; endPage: number }[] {
    const chunks: { content: string; startPage: number; endPage: number }[] = [];

    // Split on paragraph boundaries (double newline) or sentence boundaries
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

    let currentContent = '';
    let currentSize = 0;

    for (const paragraph of paragraphs) {
      const paraSize = paragraph.length;

      if (paraSize > this.chunkSize) {
        // Save current if exists
        if (currentContent.trim()) {
          chunks.push({
            content: currentContent.trim(),
            startPage: pageNumber,
            endPage: pageNumber,
          });
          currentContent = '';
          currentSize = 0;
        }

        // Split large paragraph by sentences
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        for (const sentence of sentences) {
          if (currentSize + sentence.length > this.chunkSize && currentContent.trim()) {
            chunks.push({
              content: currentContent.trim(),
              startPage: pageNumber,
              endPage: pageNumber,
            });
            currentContent = sentence;
            currentSize = sentence.length;
          } else {
            currentContent += ' ' + sentence;
            currentSize += sentence.length + 1;
          }
        }
      } else if (currentSize + paraSize > this.chunkSize) {
        // Save current chunk
        if (currentContent.trim()) {
          chunks.push({
            content: currentContent.trim(),
            startPage: pageNumber,
            endPage: pageNumber,
          });
        }
        currentContent = paragraph;
        currentSize = paraSize;
      } else {
        currentContent += '\n\n' + paragraph;
        currentSize += paraSize + 2;
      }
    }

    // Add remaining content
    if (currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        startPage: pageNumber,
        endPage: pageNumber,
      });
    }

    return chunks;
  }

  private chunkPDFText(
    content: string
  ): { content: string; startPage: number; endPage: number }[] {
    // Use paragraph-based chunking for PDFs without page info
    const chunks: { content: string; startPage: number; endPage: number }[] = [];
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());

    let currentContent = '';
    let currentSize = 0;
    let chunkCount = 0;

    for (const paragraph of paragraphs) {
      const paraSize = paragraph.length;

      if (currentSize + paraSize > this.chunkSize && currentContent.trim()) {
        chunks.push({
          content: currentContent.trim(),
          startPage: chunkCount + 1,
          endPage: chunkCount + 1,
        });
        chunkCount++;

        // Keep overlap
        const overlapContent = this.getTextOverlap(currentContent);
        currentContent = overlapContent + '\n\n' + paragraph;
        currentSize = currentContent.length;
      } else {
        currentContent += (currentContent ? '\n\n' : '') + paragraph;
        currentSize += paraSize + 2;
      }
    }

    if (currentContent.trim()) {
      chunks.push({
        content: currentContent.trim(),
        startPage: chunkCount + 1,
        endPage: chunkCount + 1,
      });
    }

    return chunks;
  }

  private getTextOverlap(text: string): string {
    if (this.chunkOverlap <= 0) return '';

    // Get roughly chunkOverlap characters from the end
    const words = text.split(/\s+/);
    let overlapText = '';
    let overlapSize = 0;

    for (let i = words.length - 1; i >= 0; i--) {
      const word = words[i]!;
      if (overlapSize + word.length + 1 > this.chunkOverlap) break;
      overlapText = word + ' ' + overlapText;
      overlapSize += word.length + 1;
    }

    return overlapText.trim();
  }
}

export const createChunker = (options?: ChunkOptions): DocumentChunker => {
  return new DocumentChunker(options);
};
