#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  CallToolRequest,
  ReadResourceRequest,
  GetPromptRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { getConfigValue } from '../core/config.js';
import { getVectorStore } from '../core/vector-store.js';
import { getIngestionService } from '../embeddings/ingestion.js';
import { getRetriever } from '../retrieval/retriever.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('mcp-server');

// Tool definitions - designed for automatic usage by Claude Code
const TOOLS = [
  {
    name: 'rag_context',
    description: `IMPORTANT: Use this tool FIRST before making any code changes or answering questions about the codebase.
This tool automatically retrieves relevant context from the indexed codebase based on your task.
It helps you understand existing patterns, find related code, and avoid breaking changes.
Always use this before: refactoring, adding features, fixing bugs, or explaining code.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        task: {
          type: 'string',
          description: 'Description of what you are trying to do (e.g., "add authentication middleware", "fix the login bug", "refactor the API routes")',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific file paths you plan to modify',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: additional keywords to search for',
        },
        compact: {
          type: 'boolean',
          description: 'Return compact results (file paths only, no content) to reduce token usage. Useful for initial exploration before diving deeper.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 15). Lower values reduce token usage.',
        },
        maxContentLength: {
          type: 'number',
          description: 'Maximum characters per result (default: unlimited). Use 300-500 for summaries.',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'rag_search',
    description: 'Search the indexed codebase using semantic search. Returns relevant code snippets, documentation, and file references.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The search query - natural language or code-related',
        },
        topK: {
          type: 'number',
          description: 'Number of results (default: 10)',
        },
        fileTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by extensions (e.g., [".ts", ".py"])',
        },
        compact: {
          type: 'boolean',
          description: 'Return compact results (file paths and line numbers only, no content) to reduce token usage. Use this for initial exploration.',
        },
        maxContentLength: {
          type: 'number',
          description: 'Maximum characters per result content (default: unlimited). Use smaller values like 200-500 to reduce token usage.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'rag_query',
    description: 'Ask a question about the codebase. Uses multi-agent system to retrieve, analyze, and synthesize information.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'Your question about the codebase',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'rag_index',
    description: 'Index a directory into the RAG system. Run this first to enable semantic search on your codebase.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Path to the directory to index',
        },
        projectName: {
          type: 'string',
          description: 'Name for the project',
        },
        forceReindex: {
          type: 'boolean',
          description: 'Force re-indexing unchanged files',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'rag_status',
    description: 'Get RAG system status including document count.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'rag_patterns',
    description: 'Find coding patterns and conventions used in the codebase. Useful before implementing new features to ensure consistency.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Type of pattern to find (e.g., "error handling", "API routes", "database queries", "testing", "logging")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'rag_dependencies',
    description: 'Find all code that depends on or is related to a specific file, function, or component.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          description: 'The file path, function name, or component to find dependencies for',
        },
      },
      required: ['target'],
    },
  },
  {
    name: 'rag_index_pdf',
    description: 'Index a PDF document from a URL into the RAG system. Useful for indexing rulebooks, documentation, manuals, and other reference materials. The PDF will be downloaded, parsed, chunked, and made searchable.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the PDF to download and index (must be a direct link to a PDF file)',
        },
        documentName: {
          type: 'string',
          description: 'Optional: A friendly name for the document (defaults to PDF title or filename)',
        },
        projectName: {
          type: 'string',
          description: 'Optional: Project name to associate with this PDF',
        },
        forceReindex: {
          type: 'boolean',
          description: 'Optional: Force re-indexing even if the PDF was already indexed',
        },
        maxSizeMB: {
          type: 'number',
          description: 'Optional: Maximum PDF size in MB (default: 50MB)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rag_remove_pdf',
    description: 'Remove a previously indexed PDF from the RAG system by its source URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The URL of the PDF to remove from the index',
        },
      },
      required: ['url'],
    },
  },
];

// Prompt definitions
const PROMPTS = [
  {
    name: 'refactor_with_context',
    description: 'Refactor code with full codebase context to avoid breaking changes',
    arguments: [
      { name: 'target', description: 'File or function to refactor', required: true },
      { name: 'goal', description: 'What the refactoring should achieve', required: true },
    ],
  },
  {
    name: 'implement_feature',
    description: 'Implement a new feature following existing patterns',
    arguments: [
      { name: 'feature', description: 'Feature to implement', required: true },
    ],
  },
  {
    name: 'fix_bug',
    description: 'Fix a bug with understanding of related code',
    arguments: [
      { name: 'bug', description: 'Description of the bug', required: true },
      { name: 'location', description: 'Where the bug occurs (optional)', required: false },
    ],
  },
  {
    name: 'code_review',
    description: 'Review code against codebase patterns',
    arguments: [
      { name: 'code', description: 'Code to review', required: true },
    ],
  },
];

async function createMCPServer() {
  const mcpConfig = getConfigValue('mcp');

  const server = new Server(
    {
      name: mcpConfig.serverName,
      version: mcpConfig.version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Initialize services lazily
  let servicesInitialized = false;
  const vectorStore = getVectorStore();
  const ingestionService = getIngestionService();
  const retriever = getRetriever();

  async function ensureInitialized() {
    if (!servicesInitialized) {
      await vectorStore.initialize();
      servicesInitialized = true;
    }
  }

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    logger.info('Tool called', { name, args });

    try {
      switch (name) {
        case 'rag_context': {
          await ensureInitialized();
          const task = (args?.['task'] as string) || '';
          const files = (args?.['files'] as string[]) || [];
          const keywords = (args?.['keywords'] as string[]) || [];
          const compact = args?.['compact'] as boolean | undefined;
          const maxResults = (args?.['maxResults'] as number) || 15;
          const maxContentLength = args?.['maxContentLength'] as number | undefined;

          // Build comprehensive search query
          const searchQueries = [task, ...keywords];
          if (files.length > 0) {
            searchQueries.push(...files.map(f => `file:${f}`));
          }

          // Get relevant context from multiple angles
          const contextResults = await Promise.all([
            retriever.retrieve({ query: task, topK: Math.min(8, maxResults) }),
            ...keywords.slice(0, 3).map(kw =>
              retriever.retrieve({ query: kw, topK: 3 })
            ),
          ]);

          // Deduplicate and merge results
          const seenIds = new Set<string>();
          const allResults = contextResults.flat().filter(r => {
            if (seenIds.has(r.document.id)) return false;
            seenIds.add(r.document.id);
            return true;
          }).sort((a, b) => b.score - a.score).slice(0, maxResults);

          // Compact mode: minimal token usage
          if (compact) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  task,
                  relevantFiles: allResults.map(r => ({
                    file: r.document.metadata.filePath,
                    lines: `${r.document.metadata.startLine || 1}-${r.document.metadata.endLine || 'end'}`,
                    relevance: (r.score * 100).toFixed(0) + '%',
                  })),
                  summary: `Found ${allResults.length} relevant code sections for task: "${task}"`,
                  hint: 'Use Read tool to view specific files, or call rag_context again without compact mode for full content.',
                }, null, 2),
              }],
            };
          }

          // Format context for Claude
          const contextOutput = {
            task,
            relevantCode: allResults.map(r => {
              const content = maxContentLength
                ? r.document.content.slice(0, maxContentLength) + (r.document.content.length > maxContentLength ? '...' : '')
                : r.document.content;
              return {
                file: r.document.metadata.filePath,
                lines: `${r.document.metadata.startLine || 1}-${r.document.metadata.endLine || 'end'}`,
                relevance: (r.score * 100).toFixed(1) + '%',
                language: r.document.metadata.language || 'unknown',
                content,
              };
            }),
            summary: `Found ${allResults.length} relevant code sections for task: "${task}"`,
            recommendations: [
              'Review the code patterns used in similar files',
              'Check for existing utilities that might be reusable',
              'Ensure changes follow the established conventions',
            ],
          };

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(contextOutput, null, 2),
            }],
          };
        }

        case 'rag_search': {
          await ensureInitialized();
          const query = args?.['query'] as string;
          const topK = (args?.['topK'] as number) || 10;
          const fileTypes = args?.['fileTypes'] as string[] | undefined;
          const compact = args?.['compact'] as boolean | undefined;
          const maxContentLength = args?.['maxContentLength'] as number | undefined;

          const results = await retriever.retrieve({
            query,
            topK,
            ...(fileTypes && { filters: { fileType: fileTypes } }),
          });

          // Compact mode: only return file paths and line numbers (minimal tokens)
          if (compact) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  results: results.map(r => ({
                    file: r.document.metadata.filePath,
                    lines: `${r.document.metadata.startLine}-${r.document.metadata.endLine}`,
                    score: (r.score * 100).toFixed(0) + '%',
                  })),
                  totalResults: results.length,
                  hint: 'Use Read tool to view specific files, or search again without compact mode for content.',
                }, null, 2),
              }],
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                results: results.map(r => ({
                  filePath: r.document.metadata.filePath,
                  score: r.score,
                  lines: `${r.document.metadata.startLine}-${r.document.metadata.endLine}`,
                  content: maxContentLength
                    ? r.document.content.slice(0, maxContentLength) + (r.document.content.length > maxContentLength ? '...' : '')
                    : r.document.content,
                })),
                totalResults: results.length,
              }, null, 2),
            }],
          };
        }

        case 'rag_query': {
          await ensureInitialized();
          const question = args?.['question'] as string;

          // Search for relevant code and return results for Claude to interpret
          const results = await retriever.retrieve({ query: question, topK: 10 });
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                question,
                relevantCode: results.map(r => ({
                  file: r.document.metadata.filePath,
                  lines: `${r.document.metadata.startLine}-${r.document.metadata.endLine}`,
                  score: (r.score * 100).toFixed(1) + '%',
                  language: r.document.metadata.language || 'unknown',
                  content: r.document.content,
                })),
                totalResults: results.length,
                hint: 'Use these code snippets to answer the question about the codebase.',
              }, null, 2),
            }],
          };
        }

        case 'rag_index': {
          const path = args?.['path'] as string;
          const projectName = args?.['projectName'] as string | undefined;
          const forceReindex = args?.['forceReindex'] as boolean | undefined;

          const options: { projectName?: string; forceReindex?: boolean } = {};
          if (projectName) options.projectName = projectName;
          if (forceReindex !== undefined) options.forceReindex = forceReindex;

          const stats = await ingestionService.ingestDirectory(path, options);

          // Include error details if there were errors
          const errorDetails = stats.errors.length > 0
            ? stats.errors.slice(0, 10).map(e => ({ file: e.file, error: e.error }))
            : [];

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: stats.errors.length === 0,
                stats: {
                  totalFiles: stats.totalFiles,
                  processedFiles: stats.processedFiles,
                  skippedFiles: stats.skippedFiles,
                  totalChunks: stats.totalChunks,
                  errorCount: stats.errors.length,
                  duration: stats.endTime
                    ? `${(stats.endTime.getTime() - stats.startTime.getTime()) / 1000}s`
                    : 'in progress',
                },
                ...(errorDetails.length > 0 && {
                  sampleErrors: errorDetails,
                  note: stats.errors.length > 10
                    ? `Showing first 10 of ${stats.errors.length} errors`
                    : undefined,
                }),
              }, null, 2),
            }],
          };
        }

        case 'rag_status': {
          await ensureInitialized();
          const count = await vectorStore.getDocumentCount();
          const collections = await vectorStore.listCollections();

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'active',
                documentCount: count,
                collections,
                config: {
                  embeddingModel: getConfigValue('embeddings').model,
                  chunkSize: getConfigValue('ingestion').chunkSize,
                },
              }, null, 2),
            }],
          };
        }

        case 'rag_patterns': {
          await ensureInitialized();
          const pattern = args?.['pattern'] as string;

          // Search for the pattern type
          const results = await retriever.retrieve({
            query: `${pattern} pattern implementation example`,
            topK: 10,
          });

          // Return examples for Claude to analyze
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                pattern,
                examples: results.slice(0, 8).map(r => ({
                  file: r.document.metadata.filePath,
                  lines: `${r.document.metadata.startLine}-${r.document.metadata.endLine}`,
                  score: (r.score * 100).toFixed(1) + '%',
                  content: r.document.content,
                })),
                totalResults: results.length,
                hint: `Analyze these code examples to identify patterns for "${pattern}". Look for conventions, common approaches, and best practices used in this codebase.`,
              }, null, 2),
            }],
          };
        }

        case 'rag_dependencies': {
          await ensureInitialized();
          const target = args?.['target'] as string;

          // Search for imports/usages of the target
          const results = await retriever.retrieve({
            query: `import ${target} require ${target} from ${target}`,
            topK: 15,
          });

          // Filter to likely dependencies
          const dependencies = results.filter(r => {
            const content = r.document.content.toLowerCase();
            const targetLower = target.toLowerCase();
            return content.includes(targetLower) ||
                   content.includes(`import`) ||
                   content.includes(`require`);
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                target,
                dependents: dependencies.map(r => ({
                  file: r.document.metadata.filePath,
                  lines: `${r.document.metadata.startLine}-${r.document.metadata.endLine}`,
                  relevance: (r.score * 100).toFixed(1) + '%',
                  snippet: r.document.content.slice(0, 300),
                })),
                count: dependencies.length,
              }, null, 2),
            }],
          };
        }

        case 'rag_index_pdf': {
          const url = args?.['url'] as string;
          const documentName = args?.['documentName'] as string | undefined;
          const projectName = args?.['projectName'] as string | undefined;
          const forceReindex = args?.['forceReindex'] as boolean | undefined;
          const maxSizeMB = args?.['maxSizeMB'] as number | undefined;

          if (!url) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'URL is required' }),
              }],
              isError: true,
            };
          }

          // Validate URL format
          try {
            new URL(url);
          } catch {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'Invalid URL format' }),
              }],
              isError: true,
            };
          }

          const result = await ingestionService.ingestPDFFromURL(url, {
            documentName,
            projectName,
            forceReindex,
            maxSizeMB,
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: result.success,
                documentName: result.documentName,
                sourceUrl: result.sourceUrl,
                stats: {
                  chunks: result.chunks,
                  pages: result.pages,
                  textLength: result.textLength,
                },
                metadata: result.metadata,
                ...(result.error && { error: result.error }),
              }, null, 2),
            }],
            ...(result.error && { isError: true }),
          };
        }

        case 'rag_remove_pdf': {
          const url = args?.['url'] as string;

          if (!url) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: 'URL is required' }),
              }],
              isError: true,
            };
          }

          await ingestionService.removePDF(url);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `PDF removed from index: ${url}`,
              }, null, 2),
            }],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error('Tool execution failed', { name, error });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        }],
        isError: true,
      };
    }
  });

  // List resources handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'rag://status',
          name: 'RAG System Status',
          mimeType: 'application/json',
          description: 'Current status of the RAG system',
        },
        {
          uri: 'rag://config',
          name: 'RAG Configuration',
          mimeType: 'application/json',
          description: 'Current configuration',
        },
      ],
    };
  });

  // Read resource handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
    const { uri } = request.params;

    switch (uri) {
      case 'rag://status': {
        await ensureInitialized();
        const count = await vectorStore.getDocumentCount();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ documentCount: count, status: 'active' }, null, 2),
          }],
        };
      }

      case 'rag://config': {
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              embeddings: getConfigValue('embeddings'),
              retrieval: getConfigValue('retrieval'),
              ingestion: getConfigValue('ingestion'),
            }, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  });

  // List prompts handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPTS };
  });

  // Get prompt handler
  server.setRequestHandler(GetPromptRequestSchema, async (request: GetPromptRequest) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'refactor_with_context': {
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `I need to refactor: ${args?.['target']}
Goal: ${args?.['goal']}

IMPORTANT: Before making any changes:
1. Use rag_context to understand the current implementation and related code
2. Use rag_dependencies to find all code that depends on this
3. Use rag_patterns to ensure the refactored code follows existing conventions

Then provide a safe refactoring plan that won't break dependent code.`,
            },
          }],
        };
      }

      case 'implement_feature': {
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `I need to implement: ${args?.['feature']}

IMPORTANT: Before implementing:
1. Use rag_context to find similar features in the codebase
2. Use rag_patterns to understand the conventions used
3. Use rag_search to find related utilities and helpers

Then implement the feature following the established patterns.`,
            },
          }],
        };
      }

      case 'fix_bug': {
        const location = args?.['location'] ? ` in ${args['location']}` : '';
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `I need to fix a bug: ${args?.['bug']}${location}

IMPORTANT: Before fixing:
1. Use rag_context to understand the code around the bug
2. Use rag_dependencies to see what might be affected by the fix
3. Use rag_search to find similar bugs that were fixed before

Then provide a fix that doesn't introduce regressions.`,
            },
          }],
        };
      }

      case 'code_review': {
        return {
          messages: [{
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Review this code against codebase conventions:

\`\`\`
${args?.['code']}
\`\`\`

Use rag_patterns and rag_search to compare against existing code. Check for:
1. Consistency with existing patterns
2. Proper error handling per codebase conventions
3. Matching code style
4. Potential issues based on similar code`,
            },
          }],
        };
      }

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  return server;
}

// Main entry point
async function main() {
  logger.info('Starting Claude RAG MCP Server...');

  const server = await createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  logger.info('Claude RAG MCP Server running');
}

main().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error('Failed to start MCP server', { error: errorMessage, stack: errorStack });
  console.error('MCP Server Error:', errorMessage);
  if (errorStack) console.error(errorStack);
  process.exit(1);
});
