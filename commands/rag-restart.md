---
description: Restart the claude-rag MCP server to reload configuration or fix issues
allowed-tools: ["Bash"]
---

# Restart RAG MCP Server

This command restarts the claude-rag MCP server.

**Note**: After running this command, you may need to restart Claude Code for the changes to take full effect.

## Steps:

1. Remove and re-add the MCP server:
```bash
claude mcp remove claude-rag 2>/dev/null; claude mcp add claude-rag -- node "$(claude mcp list 2>/dev/null | grep -A1 claude-rag | grep args | sed 's/.*node //' | tr -d '\"' || echo '/Users/matt/.claude/plugins/claude-rag@mattstvartak/dist/mcp/server.js')"
```

2. Verify the server is registered:
```bash
claude mcp list | grep -A2 claude-rag && echo "MCP server re-registered. Please restart Claude Code to load the updated server."
```

If the server doesn't appear after restart, try running `/rag-setup` to ensure ChromaDB is running.
