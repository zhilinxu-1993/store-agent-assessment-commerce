#!/usr/bin/env bash
# start.sh — starts all three services required by the store admin agent demo.
#   1. llama-server  (LLM inference, port 11435)
#   2. Store backend (Express API + admin UI, port 3000)
#   3. Agent service (ADK chat endpoint, port 3001)
#
# Prerequisites: run ./setup.sh once before this script.

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${BOLD}[start]${NC} $1"; }
ok()   { echo -e "${GREEN}[start]${NC} ✓ $1"; }
warn() { echo -e "${YELLOW}[start]${NC} ⚠ $1"; }
fail() { echo -e "${RED}[start]${NC} ✗ $1"; exit 1; }

# ── locate the GGUF model ───────────────────────────────────────────────────
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

# ── llama-server ────────────────────────────────────────────────────────────
log "Starting llama-server on port 11435..."
llama-server \
  --model "$GGUF_PATH" \
  --port 11435 \
  --ctx-size 8192 \
  --n-gpu-layers 99 \
  >/tmp/llama-server.log 2>&1 &
LLAMA_PID=$!
echo $LLAMA_PID > /tmp/llama-server.pid

# wait for llama-server to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:11435/health | grep -q ok 2>/dev/null; then
    ok "llama-server ready (pid $LLAMA_PID)"
    break
  fi
  [ "$i" -eq 30 ] && fail "llama-server did not start in time. Check /tmp/llama-server.log"
  sleep 2
done

# ── Store backend ────────────────────────────────────────────────────────────
log "Starting store backend on port 3000..."
node server.js >/tmp/store-backend.log 2>&1 &
STORE_PID=$!
echo $STORE_PID > /tmp/store-backend.pid
sleep 2

if kill -0 $STORE_PID 2>/dev/null; then
  ok "Store backend ready (pid $STORE_PID)"
else
  fail "Store backend failed to start. Check /tmp/store-backend.log"
fi

# ── Agent service ────────────────────────────────────────────────────────────
log "Starting agent service on port 3001..."
(cd agent && npx ts-node src/index.ts) >/tmp/agent-service.log 2>&1 &
AGENT_PID=$!
echo $AGENT_PID > /tmp/agent-service.pid
sleep 3

if kill -0 $AGENT_PID 2>/dev/null; then
  ok "Agent service ready (pid $AGENT_PID)"
else
  fail "Agent service failed to start. Check /tmp/agent-service.log"
fi

echo ""
echo -e "${GREEN}${BOLD}All services running.${NC}"
echo ""
echo "  Admin UI  →  http://localhost:3000/admin"
echo "  Store API →  http://localhost:3000/api"
echo "  Agent API →  http://localhost:3001/chat"
echo ""
echo "To stop all services, run:  ./stop.sh"
