---
description: Search the indexed codebase using semantic search
allowed-tools: ["mcp__claude-rag__rag_search"]
---

# Search Codebase

**IMPORTANT**: This command requires the `claude-rag` MCP server to be loaded.

**DO NOT** attempt to use grep, find, or any other search method. You must ONLY use the `rag_search` MCP tool.

## If MCP tools are not available

If you cannot find the `rag_search` tool, tell the user:

1. Run `/mcp` to check if `claude-rag` is in the server list
2. If not listed, restart Claude Code to load the MCP server
3. If still not working, run `/rag-setup` to verify ChromaDB is running

**Do not improvise or create alternative solutions.**

## When MCP tools are available

Search the indexed codebase for: $ARGUMENTS

Use the `rag_search` tool with the provided query. Return the most relevant code snippets with their file paths and line numbers.

Summarize what was found and highlight the most relevant results.
