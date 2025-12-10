---
description: Get relevant codebase context before making changes (reduces token usage)
allowed-tools: ["mcp__claude-rag__rag_context", "mcp__claude-rag__rag_patterns", "mcp__claude-rag__rag_dependencies"]
---

# Get Context for Task

Before making any code changes for the task: $ARGUMENTS

1. Use `rag_context` to retrieve relevant code context
2. Use `rag_patterns` to understand existing conventions
3. Use `rag_dependencies` if modifying existing code

This ensures changes follow existing patterns and don't break dependent code.

Summarize the relevant context found and any patterns that should be followed.
