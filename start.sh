#!/usr/bin/env bash
# start.sh — starts all three services.
#   1. llama-server  (LLM inference, port 11435)
#   2. Store backend (Express API + admin UI, port 3000)
#   3. Agent service (ADK chat endpoint, port 3001)
#
# Supports macOS and Linux. Run ./setup.sh first.

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BOLD}[start]${NC} $1"; }
ok()   { echo -e "${GREEN}[start]${NC} ✓ $1"; }
fail() { echo -e "${RED}[start]${NC} ✗ $1"; exit 1; }

OS="$(uname -s)"

# ── Locate llama-server binary ───────────────────────────────────────────────
if [ "$OS" = "Darwin" ]; then
  LLAMA_SERVER_BIN="llama-server"
elif [ "$OS" = "Linux" ]; then
  if [ -f .llama-server-path ]; then
    LLAMA_SERVER_BIN=$(cat .llama-server-path)
  else
    LLAMA_SERVER_BIN="$(pwd)/bin/llama-server"
  fi
else
  fail "Unsupported OS: $OS. Use start.ps1 on Windows."
fi

command -v "$LLAMA_SERVER_BIN" >/dev/null 2>&1 || [ -x "$LLAMA_SERVER_BIN" ] || \
  fail "llama-server not found. Run ./setup.sh first."

# ── Locate GGUF model ────────────────────────────────────────────────────────
MODEL_MANIFEST="$HOME/.ollama/models/manifests/registry.ollama.ai/library/qwen3/8b"
[ -f "$MODEL_MANIFEST" ] || fail "Model manifest not found. Run ./setup.sh first."

BLOB_HASH=$(python3 -c "
import json
with open('$MODEL_MANIFEST') as f:
    m = json.load(f)
for l in m['layers']:
    if 'model' in l.get('mediaType', ''):
        print(l['digest'].replace('sha256:', 'sha256-'))
        break
")
GGUF_PATH="$HOME/.ollama/models/blobs/$BLOB_HASH"
[ -f "$GGUF_PATH" ] || fail "Model file not found at $GGUF_PATH. Run ./setup.sh first."

# ── llama-server ─────────────────────────────────────────────────────────────
log "Starting llama-server on port 11435..."
"$LLAMA_SERVER_BIN" \
  --model "$GGUF_PATH" \
  --port 11435 \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  >/tmp/llama-server.log 2>&1 &
LLAMA_PID=$!
echo $LLAMA_PID > /tmp/llama-server.pid

for i in $(seq 1 30); do
  if curl -s http://localhost:11435/health 2>/dev/null | grep -q ok; then
    ok "llama-server ready (pid $LLAMA_PID)"
    break
  fi
  [ "$i" -eq 30 ] && fail "llama-server did not start in time. Check /tmp/llama-server.log"
  sleep 2
done

# ── Store backend ─────────────────────────────────────────────────────────────
log "Starting store backend on port 3000..."
node server.js >/tmp/store-backend.log 2>&1 &
STORE_PID=$!
echo $STORE_PID > /tmp/store-backend.pid
sleep 2

kill -0 $STORE_PID 2>/dev/null || fail "Store backend failed to start. Check /tmp/store-backend.log"
ok "Store backend ready (pid $STORE_PID)"

# ── Agent service ─────────────────────────────────────────────────────────────
log "Starting agent service on port 3001..."
(cd agent && npx ts-node src/index.ts) >/tmp/agent-service.log 2>&1 &
AGENT_PID=$!
echo $AGENT_PID > /tmp/agent-service.pid
sleep 3

kill -0 $AGENT_PID 2>/dev/null || fail "Agent service failed to start. Check /tmp/agent-service.log"
ok "Agent service ready (pid $AGENT_PID)"

echo ""
echo -e "${GREEN}${BOLD}All services running.${NC}"
echo ""
echo "  Admin UI  →  http://localhost:3000/admin"
echo "  Store API →  http://localhost:3000/api"
echo "  Agent API →  http://localhost:3001/chat"
echo ""
echo "To stop all services, run:  ./stop.sh"
