---
description: Ask a question about the codebase and get an AI-synthesized answer
allowed-tools: ["mcp__claude-rag__rag_query"]
---

# Query Codebase

**IMPORTANT**: This command requires the `claude-rag` MCP server to be loaded.

**DO NOT** attempt to answer by reading files directly. You must ONLY use the `rag_query` MCP tool.

## If MCP tools are not available

If you cannot find the `rag_query` tool, tell the user:

1. Run `/mcp` to check if `claude-rag` is in the server list
2. If not listed, restart Claude Code to load the MCP server
3. If still not working, run `/rag-setup` to verify ChromaDB is running

**Do not improvise or create alternative solutions.**

## When MCP tools are available

Answer this question about the codebase: $ARGUMENTS

Use the `rag_query` tool to get a comprehensive answer based on the indexed code.

Present the answer clearly with references to relevant files.
