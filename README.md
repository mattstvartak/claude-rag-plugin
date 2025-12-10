# Claude RAG Plugin

A production-ready Claude Code plugin that combines ChromaDB vector embeddings with intelligent document retrieval and Multi-Agent Framework (MAF) orchestration for context-aware development assistance.

## Features

- **ChromaDB Vector Store**: Efficient semantic search with persistent embeddings
- **Intelligent Chunking**: Language-aware code chunking that preserves logical boundaries
- **Hybrid Search**: Combines semantic and keyword search with reciprocal rank fusion
- **Multi-Agent Framework**: Orchestrator, Retriever, Analyzer, and Synthesizer agents
- **MCP Integration**: Full Model Context Protocol support for Claude Code
- **Auto-Context**: Automatically retrieves relevant code before making changes

## Quick Start

### 1. Install Dependencies

```bash
cd claude-rag-plugin
npm install
npm run build
```

### 2. Set Up Environment

```bash
cp .env.example .env
# Edit .env with your API keys:
# - OPENAI_API_KEY (for embeddings)
# - ANTHROPIC_API_KEY (for agents)
```

### 3. Start ChromaDB

```bash
# Using Docker (recommended)
docker run -p 8000:8000 chromadb/chroma

# Or install locally
pip install chromadb
chroma run --host localhost --port 8000
```

### 4. Index Your Codebase

```bash
# Using CLI
npx claude-rag index /path/to/your/codebase

# Or with project name
npx claude-rag index /path/to/your/codebase --project "my-project"
```

### 5. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "claude-rag": {
      "command": "node",
      "args": ["/path/to/claude-rag-plugin/dist/mcp/server.js"],
      "env": {
        "OPENAI_API_KEY": "your-key",
        "ANTHROPIC_API_KEY": "your-key"
      }
    }
  }
}
```

## Usage

### CLI Commands

```bash
# Index a codebase
claude-rag index ./src --project "my-app"

# Search for code
claude-rag search "authentication middleware"

# Ask questions about the codebase
claude-rag query "How does the login flow work?"

# Check status
claude-rag status

# Clear all indexed documents
claude-rag clear --yes

# Initialize config in current directory
claude-rag init
```

### MCP Tools (Available in Claude Code)

Once configured, Claude Code automatically has access to these tools:

| Tool | Description |
|------|-------------|
| `rag_context` | **Use first!** Gets relevant context before making code changes |
| `rag_search` | Semantic search across the codebase |
| `rag_query` | Ask questions, get AI-synthesized answers |
| `rag_index` | Index a directory |
| `rag_patterns` | Find coding patterns and conventions |
| `rag_dependencies` | Find code that depends on a target |
| `rag_status` | Check system status |

### Example Workflow

When you ask Claude Code to make changes:

1. Claude automatically uses `rag_context` to understand related code
2. Uses `rag_patterns` to follow existing conventions
3. Uses `rag_dependencies` to avoid breaking changes
4. Makes informed modifications

## Configuration

Create `.claude-rag.json` in your project root:

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
      "**/dist/**"
    ]
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Claude Code                             │
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

## API Usage

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
- ChromaDB server running
- OpenAI API key (for embeddings)
- Anthropic API key (for agents)

## License

MIT
