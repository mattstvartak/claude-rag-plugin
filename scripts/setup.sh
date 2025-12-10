#!/bin/bash
# Auto-setup script for claude-rag plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Setting up Claude RAG Plugin..."

# Step 1: Install dependencies and build
echo "📦 Installing dependencies..."
cd "$PLUGIN_DIR"
npm install --silent
npm run build --silent

# Step 2: Start ChromaDB via Docker
echo "🐳 Starting ChromaDB..."
if command -v docker &> /dev/null; then
    if ! docker ps | grep -q chromadb; then
        if docker ps -a | grep -q chromadb; then
            docker start chromadb
        else
            docker run -d --name chromadb -p 8000:8000 chromadb/chroma
        fi
    fi

    # Wait for ChromaDB to be ready
    echo "⏳ Waiting for ChromaDB..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
            echo "✅ ChromaDB is ready!"
            break
        fi
        sleep 1
    done
else
    echo "⚠️  Docker not found. Please install Docker and run: docker run -d -p 8000:8000 chromadb/chroma"
fi

# Step 3: Register MCP server with Claude Code
echo "🔧 Registering MCP server..."
if command -v claude &> /dev/null; then
    claude mcp add claude-rag -- node "$PLUGIN_DIR/dist/mcp/server.js" 2>/dev/null || true
    echo "✅ MCP server registered!"
else
    echo "⚠️  Claude CLI not found. MCP server path: $PLUGIN_DIR/dist/mcp/server.js"
fi

echo ""
echo "✨ Setup complete! You can now use these commands in Claude Code:"
echo "   /rag-index [path]  - Index a codebase"
echo "   /rag-search <query> - Search indexed code"
echo "   /rag-context <task> - Get context before making changes"
echo ""
