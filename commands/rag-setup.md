---
description: Automatically set up the RAG system - starts ChromaDB and configures everything
allowed-tools: ["Bash"]
---

# RAG Auto-Setup

Set up the RAG system automatically. Run these commands in sequence:

1. First, check if Docker is available and start ChromaDB:
```bash
docker ps -a | grep chromadb || docker run -d --name chromadb -p 8000:8000 chromadb/chroma
docker start chromadb 2>/dev/null || true
```

2. Wait for ChromaDB to be ready:
```bash
for i in {1..30}; do curl -s http://localhost:8000/api/v2/heartbeat && break || sleep 1; done
```

3. Install plugin dependencies and build:
```bash
cd "$(dirname "$(dirname "$0")")" && rm -rf node_modules/.package-lock.json package-lock.json 2>/dev/null; npm install --no-package-lock && npm run build
```

4. Add MCP server to Claude Code settings:
```bash
claude mcp add claude-rag -- node "$(pwd)/dist/mcp/server.js"
```

Report success and tell the user they can now use `/rag-index` to index their codebase.
