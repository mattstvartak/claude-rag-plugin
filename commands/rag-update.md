---
description: Update the claude-rag plugin to the latest version
allowed-tools: []
---

# Update Claude RAG Plugin

To update the plugin to the latest version, run these commands:

```
/plugin uninstall claude-rag@mattstvartak
/plugin install claude-rag@mattstvartak
```

Then restart Claude Code to reload the MCP server.

After restarting, verify with `/mcp` that `claude-rag` appears in the server list.
