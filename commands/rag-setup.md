---
description: Start ChromaDB if not running and verify the RAG system is ready
allowed-tools: ["Bash"]
---

# RAG Setup Check

This command ensures ChromaDB is running and the RAG system is ready.

**Note**: If you installed via the plugin marketplace, setup should already be complete. This command is for troubleshooting or manual setup.

## Steps:

1. Check if Docker is running and start ChromaDB:
```bash
docker info > /dev/null 2>&1 && (docker ps | grep -q chromadb || (docker ps -a | grep -q chromadb && docker start chromadb || docker run -d --name chromadb -p 8000:8000 chromadb/chroma)) || echo "Docker is not running. Please start Docker Desktop first."
```

2. Wait for ChromaDB to be ready (up to 30 seconds):
```bash
for i in {1..30}; do curl -s http://localhost:8000/api/v2/heartbeat > /dev/null 2>&1 && echo "ChromaDB is ready!" && break || sleep 1; done
```

3. Verify the setup:
```bash
curl -s http://localhost:8000/api/v2/heartbeat && echo "RAG system is ready! You can now use /rag-index to index your codebase."
```

If ChromaDB is not responding, make sure Docker Desktop is running and try again.
