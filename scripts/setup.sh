#!/bin/bash
# Auto-setup script for claude-rag plugin

# Don't exit on error - we want to provide helpful messages
set +e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Setting up Claude RAG Plugin..."

# Step 1: Install dependencies and build
echo "📦 Installing dependencies..."
cd "$PLUGIN_DIR"
# Clear any stale lock files that might cause conflicts
rm -rf node_modules/.package-lock.json 2>/dev/null
npm install --silent 2>/dev/null || npm install --no-package-lock --silent
npm run build --silent

# Step 2: Start ChromaDB via Docker
echo "🐳 Setting up ChromaDB..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo ""
    echo "⚠️  Docker is not installed."
    echo ""
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    echo "After installing, run this setup again or manually start ChromaDB:"
    echo "  docker run -d --name chromadb -p 8000:8000 chromadb/chroma"
    echo ""
    DOCKER_AVAILABLE=false
else
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        echo ""
        echo "⚠️  Docker is installed but the Docker daemon is not running."
        echo ""
        echo "Please start Docker Desktop and try again."
        echo "  - On macOS: Open Docker Desktop from Applications"
        echo "  - On Linux: sudo systemctl start docker"
        echo "  - On Windows: Start Docker Desktop from the Start menu"
        echo ""
        echo "After starting Docker, run this command to start ChromaDB:"
        echo "  docker run -d --name chromadb -p 8000:8000 chromadb/chroma"
        echo ""
        DOCKER_AVAILABLE=false
    else
        DOCKER_AVAILABLE=true
    fi
fi

if [ "$DOCKER_AVAILABLE" = true ]; then
    # Check if ChromaDB container exists and start it
    if docker ps | grep -q chromadb; then
        echo "✅ ChromaDB is already running!"
    elif docker ps -a | grep -q chromadb; then
        echo "Starting existing ChromaDB container..."
        docker start chromadb
    else
        echo "Creating and starting ChromaDB container..."
        docker run -d --name chromadb -p 8000:8000 chromadb/chroma
    fi

    # Wait for ChromaDB to be ready
    echo "⏳ Waiting for ChromaDB to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:8000/api/v2/heartbeat > /dev/null 2>&1; then
            echo "✅ ChromaDB is ready!"
            break
        fi
        if [ $i -eq 30 ]; then
            echo "⚠️  ChromaDB didn't respond in time. It may still be starting up."
            echo "   Check status with: curl http://localhost:8000/api/v2/heartbeat"
        fi
        sleep 1
    done
fi

# Step 3: Register MCP server with Claude Code
echo "🔧 Registering MCP server..."
if command -v claude &> /dev/null; then
    # Remove existing server if it exists, then add fresh
    claude mcp remove claude-rag 2>/dev/null || true
    claude mcp add claude-rag -- node "$PLUGIN_DIR/dist/mcp/server.js" 2>/dev/null || true
    echo "✅ MCP server registered!"
else
    echo "⚠️  Claude CLI not found. MCP server path: $PLUGIN_DIR/dist/mcp/server.js"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$DOCKER_AVAILABLE" = true ]; then
    echo "✨ Setup complete! You can now use these commands in Claude Code:"
    echo ""
    echo "   /rag-index [path]  - Index a codebase"
    echo "   /rag-search <query> - Search indexed code"
    echo "   /rag-context <task> - Get context before making changes"
else
    echo "⚠️  Setup partially complete."
    echo ""
    echo "To finish setup:"
    echo "  1. Start Docker Desktop"
    echo "  2. Run: docker run -d --name chromadb -p 8000:8000 chromadb/chroma"
    echo ""
    echo "Then you can use these commands in Claude Code:"
    echo "   /rag-index [path]  - Index a codebase"
    echo "   /rag-search <query> - Search indexed code"
    echo "   /rag-context <task> - Get context before making changes"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
