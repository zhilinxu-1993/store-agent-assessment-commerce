#!/usr/bin/env bash
# stop.sh — gracefully stops all services started by start.sh.

BOLD='\033[1m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${BOLD}[stop]${NC} $1"; }
ok()  { echo -e "${GREEN}[stop]${NC} ✓ $1"; }

stop_pid_file() {
  local name="$1"
  local pidfile="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      ok "$name stopped (pid $pid)"
    else
      ok "$name was not running"
    fi
    rm -f "$pidfile"
  else
    ok "$name: no PID file found"
  fi
}

log "Stopping services..."
stop_pid_file "Agent service"   /tmp/agent-service.pid
stop_pid_file "Store backend"   /tmp/store-backend.pid
stop_pid_file "llama-server"    /tmp/llama-server.pid

echo ""
echo -e "${GREEN}${BOLD}All services stopped.${NC}"
