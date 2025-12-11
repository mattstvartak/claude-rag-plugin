import { createWriteStream, createReadStream } from 'fs';
import { mkdir, unlink, stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join, basename } from 'path';
import { tmpdir } from 'os';
import { createChildLogger } from '../utils/logger.js';
import { hashContent } from '../utils/hashing.js';

// pdf-parse type
type PDFParseFunction = (dataBuffer: Buffer, options?: {
  pagerender?: ((pageData: unknown) => string | Promise<string>) | undefined;
  max?: number | undefined;
}) => Promise<{
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: unknown;
  text: string;
}>;

// Use dynamic import for pdf-parse since it's CommonJS
let pdfParse: PDFParseFunction;

const logger = createChildLogger('pdf-fetcher');

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pageCount: number;
}

export interface PDFContent {
  text: string;
  metadata: PDFMetadata;
  pages: PDFPage[];
  sourceUrl: string;
  hash: string;
  downloadedAt: string;
}

export interface PDFPage {
  pageNumber: number;
  content: string;
}

export interface PDFFetchOptions {
  maxSizeMB?: number;
  timeout?: number;
  userAgent?: string;
}

const DEFAULT_OPTIONS: Required<PDFFetchOptions> = {
  maxSizeMB: 50, // 50MB max for PDFs (D&D rulebooks can be large)
  timeout: 60000, // 60 second timeout
  userAgent: 'Claude-RAG-Plugin/1.0',
};

async function loadPdfParse(): Promise<PDFParseFunction> {
  if (!pdfParse) {
    // pdf-parse uses CommonJS export, handle both default and named exports
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const module = await import('pdf-parse') as any;
    pdfParse = (module.default || module) as PDFParseFunction;
  }
  return pdfParse;
}

export class PDFFetcher {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || join(tmpdir(), 'claude-rag-pdf-cache');
  }

  async fetchAndParse(url: string, options: PDFFetchOptions = {}): Promise<PDFContent> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    logger.info('Fetching PDF from URL', { url });

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Ensure cache directory exists
    await mkdir(this.cacheDir, { recursive: true });

    // Generate a filename from the URL
    const urlHash = hashContent(url).slice(0, 16);
    const originalName = basename(parsedUrl.pathname) || 'document.pdf';
    const tempFilePath = join(this.cacheDir, `${urlHash}-${originalName}`);

    try {
      // Fetch the PDF
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': opts.userAgent,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
      }

      // Check content type
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/pdf') && !contentType.includes('octet-stream')) {
        logger.warn('Content-Type is not PDF', { contentType, url });
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const sizeBytes = parseInt(contentLength, 10);
        const sizeMB = sizeBytes / (1024 * 1024);
        if (sizeMB > opts.maxSizeMB) {
          throw new Error(`PDF too large: ${sizeMB.toFixed(2)}MB exceeds max ${opts.maxSizeMB}MB`);
        }
        logger.info('PDF size', { sizeMB: sizeMB.toFixed(2), url });
      }

      // Stream to temporary file
      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const fileStream = createWriteStream(tempFilePath);
      // Node.js fetch response body is a web ReadableStream, need to convert
      const nodeStream = await import('stream');
      const readable = nodeStream.Readable.fromWeb(response.body as import('stream/web').ReadableStream);
      await pipeline(readable, fileStream);

      // Verify file was downloaded
      const fileStat = await stat(tempFilePath);
      const actualSizeMB = fileStat.size / (1024 * 1024);
      if (actualSizeMB > opts.maxSizeMB) {
        throw new Error(`PDF too large: ${actualSizeMB.toFixed(2)}MB exceeds max ${opts.maxSizeMB}MB`);
      }

      logger.info('PDF downloaded successfully', {
        path: tempFilePath,
        sizeMB: actualSizeMB.toFixed(2)
      });

      // Parse the PDF
      const pdfContent = await this.parsePDF(tempFilePath, url);

      return pdfContent;

    } finally {
      // Clean up temp file
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async parseLocalPDF(filePath: string): Promise<PDFContent> {
    return this.parsePDF(filePath, `file://${filePath}`);
  }

  private async parsePDF(filePath: string, sourceUrl: string): Promise<PDFContent> {
    logger.info('Parsing PDF', { filePath });

    const parse = await loadPdfParse();

    // Read the PDF file
    const dataBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });

    // Parse with pdf-parse (simple mode without custom page render)
    const data = await parse(dataBuffer);

    // Extract pages (pdf-parse gives us the full text, we'll split by page markers or estimate)
    const pages = this.extractPages(data.text, data.numpages);

    // Build metadata - info object may have arbitrary properties
    const info = data.info as Record<string, string | undefined> | undefined;
    const metadata: PDFMetadata = {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creator: info?.Creator,
      producer: info?.Producer,
      creationDate: info?.CreationDate ? this.parseDate(info.CreationDate) : undefined,
      modificationDate: info?.ModDate ? this.parseDate(info.ModDate) : undefined,
      pageCount: data.numpages,
    };

    const content: PDFContent = {
      text: data.text,
      metadata,
      pages,
      sourceUrl,
      hash: hashContent(data.text),
      downloadedAt: new Date().toISOString(),
    };

    logger.info('PDF parsed successfully', {
      pages: data.numpages,
      textLength: data.text.length,
      title: metadata.title,
    });

    return content;
  }

  private extractPages(fullText: string, pageCount: number): PDFPage[] {
    // pdf-parse doesn't give us page boundaries directly, so we estimate
    // by splitting the text roughly evenly across pages
    const pages: PDFPage[] = [];

    if (pageCount <= 0) {
      return [{ pageNumber: 1, content: fullText }];
    }

    // Try to split on common page break patterns
    const pageBreakPatterns = [
      /\f/g, // Form feed character
      /\n{4,}/g, // Multiple newlines
    ];

    let splits: string[] = [fullText];

    for (const pattern of pageBreakPatterns) {
      if (fullText.match(pattern)) {
        splits = fullText.split(pattern).filter(s => s.trim().length > 0);
        if (splits.length >= pageCount * 0.5) {
          // Good enough split
          break;
        }
      }
    }

    // If we couldn't split well, just divide evenly
    if (splits.length < pageCount * 0.5) {
      const avgLength = Math.ceil(fullText.length / pageCount);
      splits = [];
      for (let i = 0; i < fullText.length; i += avgLength) {
        splits.push(fullText.slice(i, i + avgLength));
      }
    }

    // Create page objects
    for (let i = 0; i < splits.length; i++) {
      pages.push({
        pageNumber: i + 1,
        content: splits[i]!.trim(),
      });
    }

    return pages;
  }

  private parseDate(dateStr: string): Date | undefined {
    try {
      // PDF dates are in format: D:YYYYMMDDHHmmSS
      if (dateStr.startsWith('D:')) {
        const cleaned = dateStr.slice(2);
        const year = parseInt(cleaned.slice(0, 4), 10);
        const month = parseInt(cleaned.slice(4, 6), 10) - 1;
        const day = parseInt(cleaned.slice(6, 8), 10);
        const hour = parseInt(cleaned.slice(8, 10), 10) || 0;
        const minute = parseInt(cleaned.slice(10, 12), 10) || 0;
        const second = parseInt(cleaned.slice(12, 14), 10) || 0;
        return new Date(year, month, day, hour, minute, second);
      }
      return new Date(dateStr);
    } catch {
      return undefined;
    }
  }
}

// Singleton instance
let fetcherInstance: PDFFetcher | null = null;

export const getPDFFetcher = (cacheDir?: string): PDFFetcher => {
  if (!fetcherInstance) {
    fetcherInstance = new PDFFetcher(cacheDir);
  }
  return fetcherInstance;
};
