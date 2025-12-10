import { DocumentChunker } from '../src/embeddings/chunker';

// Mock config
jest.mock('../src/core/config', () => ({
  getConfigValue: jest.fn().mockReturnValue({
    chunkSize: 500,
    chunkOverlap: 100,
    supportedExtensions: ['.ts', '.js', '.py', '.md'],
    excludePatterns: ['**/node_modules/**'],
    maxFileSize: 1048576,
    watchMode: false,
  }),
}));

describe('DocumentChunker', () => {
  let chunker: DocumentChunker;

  beforeEach(() => {
    chunker = new DocumentChunker();
  });

  describe('chunkDocument', () => {
    it('should chunk a simple text file', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.txt',
        'file.txt',
        '.txt'
      );

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]?.metadata.filePath).toBe('/test/file.txt');
      expect(chunks[0]?.metadata.fileName).toBe('file.txt');
    });

    it('should detect TypeScript language', () => {
      const content = `
export function hello(): string {
  return 'Hello, World!';
}
`;
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.ts',
        'file.ts',
        '.ts'
      );

      expect(chunks[0]?.metadata.language).toBe('typescript');
    });

    it('should detect Python language', () => {
      const content = `
def hello():
    return 'Hello, World!'
`;
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.py',
        'file.py',
        '.py'
      );

      expect(chunks[0]?.metadata.language).toBe('python');
    });

    it('should include line numbers in metadata', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.txt',
        'file.txt',
        '.txt'
      );

      expect(chunks[0]?.metadata.startLine).toBeDefined();
      expect(chunks[0]?.metadata.endLine).toBeDefined();
    });

    it('should generate unique IDs for chunks', () => {
      const content = 'Some content';
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.txt',
        'file.txt',
        '.txt'
      );

      expect(chunks[0]?.id).toBeDefined();
      expect(chunks[0]?.id.length).toBeGreaterThan(0);
    });

    it('should handle empty content', () => {
      const chunks = chunker.chunkDocument(
        '',
        '/test/empty.txt',
        'empty.txt',
        '.txt'
      );

      expect(chunks.length).toBe(1);
    });

    it('should split code at function boundaries', () => {
      const content = `
function one() {
  console.log('one');
}

function two() {
  console.log('two');
}

function three() {
  console.log('three');
}
`.repeat(10);

      const chunks = chunker.chunkDocument(
        content,
        '/test/functions.js',
        'functions.js',
        '.js'
      );

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should preserve markdown structure', () => {
      const content = `
# Heading 1

Some content here.

## Heading 2

More content.

### Heading 3

Even more content.
`.repeat(5);

      const chunks = chunker.chunkDocument(
        content,
        '/test/docs.md',
        'docs.md',
        '.md'
      );

      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should estimate token count', () => {
      const content = 'This is a test string with multiple words.';
      const chunks = chunker.chunkDocument(
        content,
        '/test/file.txt',
        'file.txt',
        '.txt'
      );

      expect(chunks[0]?.tokenCount).toBeGreaterThan(0);
    });

    it('should include project name in metadata', () => {
      const chunks = chunker.chunkDocument(
        'content',
        '/test/file.txt',
        'file.txt',
        '.txt',
        'my-project'
      );

      expect(chunks[0]?.metadata.projectName).toBe('my-project');
    });
  });
});
