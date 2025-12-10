# Claude RAG Plugin

Index your codebase once, then let Claude automatically retrieve relevant context before making changes. Reduces API costs by providing targeted context instead of reading entire files.

## Prerequisites

Before installing, ensure you have:

- **Docker** - Required to run ChromaDB vector database
  ```bash
  # Verify Docker is installed
  docker --version
  ```
- **Node.js 18+** - Required for the plugin runtime
  ```bash
  # Verify Node.js version
  node --version
  ```
- **Claude Code CLI** - The plugin runs inside Claude Code
  ```bash
  # Verify Claude Code is installed
  claude --version
  ```

## Features

- **One-Click Install**: Automatic setup via Claude Code marketplace
- **No API Keys Required**: Uses ChromaDB's built-in embeddings by default
- **ChromaDB Vector Store**: Efficient semantic search with persistent embeddings
- **Intelligent Chunking**: Language-aware code chunking that preserves logical boundaries
- **Hybrid Search**: Combines semantic and keyword search with reciprocal rank fusion
- **Multi-Agent Framework**: Orchestrator, Retriever, Analyzer, and Synthesizer agents
- **Auto-Context**: Automatically retrieves relevant code before making changes

## Installation via Claude Code Marketplace (Recommended)

The easiest way to install - everything is set up automatically:

```bash
# Step 1: Add the marketplace
/plugin marketplace add mattstvartak/claude-rag-plugin

# Step 2: Install the plugin
/plugin install claude-rag@mattstvartak
```

Or use the interactive menu:
```bash
/plugin
# Then select "Browse Plugins" to find and install claude-rag
```

This automatically:
- Installs all dependencies
- Starts ChromaDB via Docker
- Registers the MCP server with Claude Code

**Requirements**: Docker must be installed on your system.

## Manual Installation

If you prefer to install manually:

### Option 1: Install from Source

```bash
# Clone the repository
git clone https://github.com/mattstvartak/claude-rag-plugin.git
cd claude-rag-plugin

# Run the setup script (handles everything)
./scripts/setup.sh
```

### Option 2: Step-by-Step Manual Setup

```bash
# 1. Clone and build
git clone https://github.com/mattstvartak/claude-rag-plugin.git
cd claude-rag-plugin
npm install
npm run build

# 2. Start ChromaDB
docker run -d --name chromadb -p 8000:8000 chromadb/chroma

# 3. Register MCP server with Claude Code
claude mcp add claude-rag -- node /path/to/claude-rag-plugin/dist/mcp/server.js
```

### (Optional) OpenAI Embeddings

For higher-quality embeddings, set your OpenAI API key:

```bash
export OPENAI_API_KEY="your-openai-key"
```

## Quick Start

After installation, index your codebase:

```
/rag-index /path/to/your/codebase
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

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | Any recent version | Required for ChromaDB |
| Node.js | >= 18 | Runtime environment |
| Claude Code CLI | >= 1.0.0 | Plugin host |
| OpenAI API Key | Optional | For higher-quality embeddings |

**No API keys required by default!** The plugin uses ChromaDB's built-in sentence-transformer embeddings.

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
