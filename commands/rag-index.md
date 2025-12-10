---
description: Index a codebase directory into the RAG system for semantic search
allowed-tools: ["mcp__claude-rag__rag_index", "mcp__claude-rag__rag_status"]
---

# Index Codebase

**IMPORTANT**: This command requires the `claude-rag` MCP server to be loaded.

**DO NOT** attempt to create scripts, use Python, or implement indexing yourself. You must ONLY use the MCP tools listed below.

## If MCP tools are not available

If you cannot find `rag_index` or `rag_status` tools, tell the user:

1. Run `/mcp` to check if `claude-rag` is in the server list
2. If not listed, restart Claude Code to load the MCP server
3. If still not working, run `/rag-setup` to verify ChromaDB is running

**Do not improvise or create alternative solutions.**

## When MCP tools are available

Use the `rag_index` tool to index the codebase at: $ARGUMENTS

If no path is provided, use the current working directory.

After indexing, use `rag_status` to confirm the documents were indexed successfully.

Report the number of files processed and any errors encountered.
