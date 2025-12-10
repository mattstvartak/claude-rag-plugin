---
description: Get relevant codebase context before making changes (reduces token usage)
allowed-tools: ["mcp__claude-rag__rag_context", "mcp__claude-rag__rag_patterns", "mcp__claude-rag__rag_dependencies"]
---

# Get Context for Task

**IMPORTANT**: This command requires the `claude-rag` MCP server to be loaded.

**DO NOT** attempt to read files directly or implement your own context gathering. You must ONLY use the MCP tools listed below.

## If MCP tools are not available

If you cannot find `rag_context`, `rag_patterns`, or `rag_dependencies` tools, tell the user:

1. Run `/mcp` to check if `claude-rag` is in the server list
2. If not listed, restart Claude Code to load the MCP server
3. If still not working, run `/rag-setup` to verify ChromaDB is running

**Do not improvise or create alternative solutions.**

## When MCP tools are available

Before making any code changes for the task: $ARGUMENTS

1. Use `rag_context` to retrieve relevant code context
2. Use `rag_patterns` to understand existing conventions
3. Use `rag_dependencies` if modifying existing code

This ensures changes follow existing patterns and don't break dependent code.

Summarize the relevant context found and any patterns that should be followed.
