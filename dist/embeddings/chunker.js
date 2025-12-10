"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChunker = exports.DocumentChunker = void 0;
const config_js_1 = require("../core/config.js");
const logger_js_1 = require("../utils/logger.js");
const hashing_js_1 = require("../utils/hashing.js");
const logger = (0, logger_js_1.createChildLogger)('chunker');
class DocumentChunker {
    chunkSize;
    chunkOverlap;
    constructor(options) {
        const ingestionConfig = (0, config_js_1.getConfigValue)('ingestion');
        this.chunkSize = options?.chunkSize ?? ingestionConfig.chunkSize;
        this.chunkOverlap = options?.chunkOverlap ?? ingestionConfig.chunkOverlap;
    }
    chunkDocument(content, filePath, fileName, fileType, projectName) {
        const language = this.detectLanguage(fileType);
        const chunks = [];
        // Choose chunking strategy based on file type
        let rawChunks;
        if (this.isCodeFile(fileType)) {
            rawChunks = this.chunkCode(content, language);
        }
        else if (this.isMarkdownFile(fileType)) {
            rawChunks = this.chunkMarkdown(content);
        }
        else {
            rawChunks = this.chunkText(content);
        }
        const now = new Date().toISOString();
        rawChunks.forEach((chunk, index) => {
            const metadata = {
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
                hash: (0, hashing_js_1.hashContent)(chunk.content),
                projectName,
            };
            chunks.push({
                id: (0, hashing_js_1.generateDocumentId)(filePath, index),
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
    chunkCode(content, language) {
        const lines = content.split('\n');
        const chunks = [];
        // Try to split on logical boundaries (functions, classes, etc.)
        const boundaries = this.findCodeBoundaries(lines, language);
        if (boundaries.length > 0) {
            let currentChunk = [];
            let currentSize = 0;
            let chunkStartLine = 1;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lineSize = line.length + 1; // +1 for newline
                // Check if this is a boundary and we have content
                if (boundaries.includes(i) && currentChunk.length > 0) {
                    // If current chunk is big enough, save it
                    if (currentSize >= this.chunkSize * 0.5) {
                        chunks.push({
                            content: currentChunk.map((l) => l.content).join('\n'),
                            startLine: chunkStartLine,
                            endLine: currentChunk[currentChunk.length - 1].lineNumber,
                        });
                        // Start new chunk with overlap
                        const overlapLines = this.getOverlapLines(currentChunk);
                        currentChunk = overlapLines;
                        currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
                        chunkStartLine = overlapLines.length > 0 ? overlapLines[0].lineNumber : i + 1;
                    }
                }
                currentChunk.push({ content: line, lineNumber: i + 1 });
                currentSize += lineSize;
                // Force split if chunk is too large
                if (currentSize >= this.chunkSize) {
                    chunks.push({
                        content: currentChunk.map((l) => l.content).join('\n'),
                        startLine: chunkStartLine,
                        endLine: currentChunk[currentChunk.length - 1].lineNumber,
                    });
                    const overlapLines = this.getOverlapLines(currentChunk);
                    currentChunk = overlapLines;
                    currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
                    chunkStartLine = overlapLines.length > 0 ? overlapLines[0].lineNumber : i + 2;
                }
            }
            // Don't forget the last chunk
            if (currentChunk.length > 0) {
                chunks.push({
                    content: currentChunk.map((l) => l.content).join('\n'),
                    startLine: chunkStartLine,
                    endLine: currentChunk[currentChunk.length - 1].lineNumber,
                });
            }
        }
        else {
            // Fall back to simple text chunking
            return this.chunkText(content);
        }
        return chunks;
    }
    findCodeBoundaries(lines, language) {
        const boundaries = [];
        // Common patterns for function/class definitions
        const patterns = [
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
    chunkMarkdown(content) {
        const lines = content.split('\n');
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;
        let chunkStartLine = 1;
        let inCodeBlock = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
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
                    endLine: currentChunk[currentChunk.length - 1].lineNumber,
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
                    endLine: currentChunk[currentChunk.length - 1].lineNumber,
                });
                const overlapLines = this.getOverlapLines(currentChunk);
                currentChunk = overlapLines;
                currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
                chunkStartLine = overlapLines.length > 0 ? overlapLines[0].lineNumber : i + 2;
            }
        }
        if (currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.map((l) => l.content).join('\n'),
                startLine: chunkStartLine,
                endLine: currentChunk[currentChunk.length - 1].lineNumber,
            });
        }
        return chunks;
    }
    chunkText(content) {
        const lines = content.split('\n');
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;
        let chunkStartLine = 1;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineSize = line.length + 1;
            currentChunk.push({ content: line, lineNumber: i + 1 });
            currentSize += lineSize;
            if (currentSize >= this.chunkSize) {
                chunks.push({
                    content: currentChunk.map((l) => l.content).join('\n'),
                    startLine: chunkStartLine,
                    endLine: currentChunk[currentChunk.length - 1].lineNumber,
                });
                const overlapLines = this.getOverlapLines(currentChunk);
                currentChunk = overlapLines;
                currentSize = overlapLines.reduce((sum, l) => sum + l.content.length + 1, 0);
                chunkStartLine = overlapLines.length > 0 ? overlapLines[0].lineNumber : i + 2;
            }
        }
        if (currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.map((l) => l.content).join('\n'),
                startLine: chunkStartLine,
                endLine: currentChunk[currentChunk.length - 1].lineNumber,
            });
        }
        return chunks;
    }
    getOverlapLines(chunk) {
        if (this.chunkOverlap <= 0)
            return [];
        let overlapSize = 0;
        const overlapLines = [];
        for (let i = chunk.length - 1; i >= 0; i--) {
            const line = chunk[i];
            const lineSize = line.content.length + 1;
            if (overlapSize + lineSize > this.chunkOverlap)
                break;
            overlapLines.unshift(line);
            overlapSize += lineSize;
        }
        return overlapLines;
    }
    detectLanguage(fileType) {
        const languageMap = {
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
    isCodeFile(fileType) {
        const codeExtensions = [
            '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
            '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.hpp', '.swift',
            '.kt', '.scala', '.sh', '.bash', '.zsh',
        ];
        return codeExtensions.includes(fileType.toLowerCase());
    }
    isMarkdownFile(fileType) {
        return ['.md', '.mdx'].includes(fileType.toLowerCase());
    }
    estimateTokenCount(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}
exports.DocumentChunker = DocumentChunker;
const createChunker = (options) => {
    return new DocumentChunker(options);
};
exports.createChunker = createChunker;
//# sourceMappingURL=chunker.js.map