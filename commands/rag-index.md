---
description: Index a codebase directory into the RAG system for semantic search
allowed-tools: ["mcp__claude-rag__rag_index", "mcp__claude-rag__rag_status"]
---

# Index Codebase

Index the specified directory (or current directory if none provided) into the RAG system.

Use the `rag_index` tool to index the codebase at: $ARGUMENTS

If no path is provided, use the current working directory.

After indexing, use `rag_status` to confirm the documents were indexed successfully.

Report the number of files processed and any errors encountered.
