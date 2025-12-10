# Claude RAG Plugin

A production-ready Claude Code plugin that combines ChromaDB vector embeddings with intelligent document retrieval and Multi-Agent Framework (MAF) orchestration for context-aware development assistance.

## Features

- **ChromaDB Vector Store**: Efficient semantic search with persistent embeddings
- **Intelligent Chunking**: Language-aware code chunking that preserves logical boundaries
- **Hybrid Search**: Combines semantic and keyword search with reciprocal rank fusion
- **Multi-Agent Framework**: Orchestrator, Retriever, Analyzer, and Synthesizer agents
- **MCP Integration**: Full Model Context Protocol support for Claude Code
- **Auto-Context**: Automatically retrieves relevant code before making changes

## Installation for Claude Code CLI

### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g claude-rag-plugin

# Or install locally in your project
npm install claude-rag-plugin
```

### Option 2: Install from Source

```bash
# Clone and build
git clone https://github.com/yourusername/claude-rag-plugin.git
cd claude-rag-plugin
npm install
npm run build
npm link  # Makes it available globally
```

## Quick Setup

### 1. Start ChromaDB

```bash
# Using Docker (recommended)
docker run -d -p 8000:8000 chromadb/chroma

# Or install locally
pip install chromadb
chroma run --host localhost --port 8000
```

### 2. Add to Claude Code

Run this command to add the MCP server to Claude Code:

```bash
# If installed globally via npm
claude mcp add claude-rag -- npx claude-rag serve

# If installed from source
claude mcp add claude-rag -- node /path/to/claude-rag-plugin/dist/mcp/server.js
```

Or manually edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-rag": {
      "command": "npx",
      "args": ["claude-rag", "serve"],
      "env": {
        "CHROMADB_HOST": "localhost",
        "CHROMADB_PORT": "8000"
      }
    }
  }
}
```

### 3. (Optional) Set Environment Variables

Only needed if you want higher-quality OpenAI embeddings:

```bash
# Optional - for better embeddings
export OPENAI_API_KEY="your-openai-key"
```

### 4. Index Your Codebase

From within Claude Code CLI, use the tool:

```
Use rag_index to index /path/to/your/codebase
```

Or from terminal:

```bash
claude-rag index /path/to/your/codebase --project "my-project"
```

## Using with Claude Code CLI

Once installed, Claude Code will automatically have access to these tools:

### Available Tools

| Tool | Description | Example Usage |
|------|-------------|---------------|
| `rag_context` | **Use first!** Gets relevant context before code changes | "Use rag_context for adding authentication" |
| `rag_search` | Semantic search across codebase | "Use rag_search to find error handling code" |
| `rag_query` | Ask questions, get AI-synthesized answers | "Use rag_query to explain the database layer" |
| `rag_index` | Index a directory | "Use rag_index on ./src" |
| `rag_patterns` | Find coding patterns and conventions | "Use rag_patterns for API routes" |
| `rag_dependencies` | Find code that depends on a target | "Use rag_dependencies for UserService" |
| `rag_status` | Check system status | "Use rag_status" |

### Example Prompts in Claude Code

```
# Index your codebase first
"Index this codebase using rag_index"

# Get context before making changes
"I want to add a new API endpoint. Use rag_context first to understand the patterns"

# Search for specific code
"Search for authentication middleware using rag_search"

# Ask questions about the codebase
"Use rag_query to explain how the payment system works"

# Find dependencies before refactoring
"Use rag_dependencies to find all code using the UserModel"
```

### Automatic Context (Cost Saving)

The `rag_context` tool is designed to automatically provide relevant context before Claude makes changes. This:
- Reduces token usage by providing targeted context
- Prevents Claude from re-reading many files
- Ensures consistency with existing patterns

Just tell Claude what you want to do, and it will use the RAG tools automatically:

```
"Add a new endpoint for user preferences following existing patterns"
```

Claude will automatically:
1. Use `rag_context` to find related code
2. Use `rag_patterns` to understand conventions
3. Make informed changes

## CLI Commands

```bash
# Index a codebase
claude-rag index ./src --project "my-app"

# Index with watch mode (re-index on changes)
claude-rag index ./src --watch

# Search for code
claude-rag search "authentication middleware"

# Search with filters
claude-rag search "error handling" --type ts,js --top-k 5

# Ask questions about the codebase
claude-rag query "How does the login flow work?"

# Check status
claude-rag status

# Clear all indexed documents
claude-rag clear --yes

# Initialize config in current directory
claude-rag init

# Start MCP server (used by Claude Code)
claude-rag serve
```

## Configuration

Create `.claude-rag.json` in your project root for project-specific settings:

```json
{
  "chromadb": {
    "host": "localhost",
    "port": 8000,
    "collection": "my_project"
  },
  "embeddings": {
    "provider": "openai",
    "model": "text-embedding-3-small"
  },
  "retrieval": {
    "topK": 10,
    "minScore": 0.7,
    "reranking": {
      "enabled": true
    }
  },
  "ingestion": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "excludePatterns": [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**"
    ]
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code CLI                         │
│                         (MCP Client)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │
│  │   Tools     │ │  Resources  │ │      Prompts        │   │
│  └──────┬──────┘ └──────┬──────┘ └──────────┬──────────┘   │
└─────────┼───────────────┼───────────────────┼───────────────┘
          │               │                   │
          ▼               ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                Multi-Agent Orchestrator                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │Retriever │ │ Analyzer │ │Synthesizer│ │ Orchestrator │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
└───────┼────────────┼────────────┼──────────────┼────────────┘
        │            │            │              │
        ▼            ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Retrieval System                           │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Semantic Search│  │ Keyword Search │  │   Reranking  │  │
│  └───────┬────────┘  └───────┬────────┘  └──────┬───────┘  │
└──────────┼───────────────────┼──────────────────┼───────────┘
           │                   │                  │
           ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      ChromaDB                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Vector Embeddings                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## API Usage (Programmatic)

```typescript
import ClaudeRAG from 'claude-rag-plugin';

const rag = new ClaudeRAG();

// Index a directory
await rag.index('./src', { projectName: 'my-project' });

// Search
const results = await rag.search('authentication', { topK: 5 });

// Query with AI
const answer = await rag.query('How does the login flow work?');

// Get status
const status = await rag.getStatus();
```

## Requirements

- Node.js >= 18
- ChromaDB server running (Docker recommended)
- **No API keys required by default!** Uses ChromaDB's built-in embeddings
- Optional: OpenAI API key for higher-quality embeddings (set `OPENAI_API_KEY`)

## Troubleshooting

### ChromaDB Connection Issues

```bash
# Check if ChromaDB is running
curl http://localhost:8000/api/v1/heartbeat

# Restart ChromaDB
docker restart <container-id>
```

### MCP Server Not Found

```bash
# Verify installation
which claude-rag

# Check Claude Code settings
cat ~/.claude/settings.json

# Test MCP server manually
claude-rag serve
```

### Indexing Errors

```bash
# Check file permissions
ls -la /path/to/codebase

# Try with verbose logging
LOG_LEVEL=debug claude-rag index ./src
```

## License

MIT
