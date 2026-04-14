#!/usr/bin/env bash
# setup.sh — one-time setup for the store admin agent project.
# Installs all dependencies and downloads the LLM model.
# Run once before using start.sh.

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BOLD}[setup]${NC} $1"; }
ok()   { echo -e "${GREEN}[setup]${NC} ✓ $1"; }
warn() { echo -e "${YELLOW}[setup]${NC} ⚠ $1"; }
fail() { echo -e "${RED}[setup]${NC} ✗ $1"; exit 1; }

log "Checking prerequisites..."
command -v node >/dev/null 2>&1 || fail "Node.js is required. Install from https://nodejs.org (v18+)"
command -v npm  >/dev/null 2>&1 || fail "npm is required."
command -v brew >/dev/null 2>&1 || fail "Homebrew is required. Install from https://brew.sh"
NODE_VER=$(node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>/dev/null && echo ok || echo fail)
[ "$NODE_VER" = "fail" ] && fail "Node.js 18+ required. Current: $(node --version)"
ok "Node $(node --version), npm $(npm --version)"

log "Installing llama.cpp (inference runtime)..."
if brew list llama.cpp >/dev/null 2>&1; then
    ok "llama.cpp already installed ($(brew list --versions llama.cpp))"
else
    brew install llama.cpp
    ok "llama.cpp installed"
fi

log "Checking for Qwen3 8b model..."
MODEL_MANIFEST="$HOME/.ollama/models/manifests/registry.ollama.ai/library/qwen3/8b"

if [ -f "$MODEL_MANIFEST" ]; then
    ok "Qwen3 8b model already downloaded"
else
    log "Downloading Qwen3 8b model via Ollama (5.2 GB — this will take a while)..."
    if ! command -v ollama >/dev/null 2>&1; then
        log "Installing Ollama (needed for model download)..."
        brew install ollama
    fi
    ollama serve &>/tmp/ollama-setup.log &
    OLLAMA_PID=$!
    sleep 3
    ollama pull qwen3:8b
    kill $OLLAMA_PID 2>/dev/null || true
    ok "Qwen3 8b downloaded"
fi

BLOB_HASH=$(python3 -c "
import json, sys
with open('$MODEL_MANIFEST') as f:
    m = json.load(f)
for l in m['layers']:
    if 'model' in l.get('mediaType', ''):
        print(l['digest'].replace('sha256:', 'sha256-'))
        break
" 2>/dev/null)
GGUF_PATH="$HOME/.ollama/models/blobs/$BLOB_HASH"
[ -f "$GGUF_PATH" ] || fail "Model file not found at $GGUF_PATH"
ok "Model file verified: $GGUF_PATH"

log "Installing store backend dependencies..."
npm install
ok "Store backend dependencies installed"

log "Installing agent service dependencies..."
(cd agent && npm install)
ok "Agent service dependencies installed"

echo ""
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo "To start all services, run:  ./start.sh"
echo "Then open:  http://localhost:3000/admin"
