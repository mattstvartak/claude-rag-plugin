---
description: Instructions for restarting the claude-rag MCP server
allowed-tools: []
---

# Restart RAG MCP Server

MCP servers cannot be restarted from within Claude Code. To restart the claude-rag MCP server:

**Simply restart Claude Code.**

This will reload all MCP servers including claude-rag.

## If that doesn't work

1. Exit Claude Code
2. Run in your terminal:
   ```bash
   claude mcp remove claude-rag
   claude mcp add claude-rag -- node ~/.claude/plugins/claude-rag@mattstvartak/dist/mcp/server.js
   ```
3. Start Claude Code again

## Verify

After restarting, run `/mcp` to confirm `claude-rag` appears in the server list.
