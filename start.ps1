# start.ps1 — starts all three services (Windows).
#   1. llama-server  (LLM inference, port 11435)
#   2. Store backend (Express API + admin UI, port 3000)
#   3. Agent service (ADK chat endpoint, port 3001)
#
# Run .\setup.ps1 first.

param()
$ErrorActionPreference = "Stop"

function Log  { Write-Host "[start] $args" -ForegroundColor White }
function Ok   { Write-Host "[start] $args" -ForegroundColor Green }
function Fail { Write-Host "[start] $args" -ForegroundColor Red; exit 1 }

$PidDir = $env:TEMP
$PYTHON = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }

# ── Locate llama-server ───────────────────────────────────────────────────────
$LlamaExe = Join-Path $PSScriptRoot "bin\llama-server.exe"
if (-not (Test-Path $LlamaExe)) { Fail "llama-server.exe not found. Run .\setup.ps1 first." }

# ── Locate GGUF model ─────────────────────────────────────────────────────────
$ModelManifest = Join-Path $env:USERPROFILE ".ollama\models\manifests\registry.ollama.ai\library\qwen3\8b"
if (-not (Test-Path $ModelManifest)) { Fail "Model manifest not found. Run .\setup.ps1 first." }

$blobHash = & $PYTHON -c @"
import json
with open(r'$ModelManifest') as f:
    m = json.load(f)
for l in m['layers']:
    if 'model' in l.get('mediaType', ''):
        print(l['digest'].replace('sha256:', 'sha256-'))
        break
"@
$GgufPath = Join-Path $env:USERPROFILE ".ollama\models\blobs\$blobHash"
if (-not (Test-Path $GgufPath)) { Fail "Model file not found at $GgufPath. Run .\setup.ps1 first." }

# ── llama-server ──────────────────────────────────────────────────────────────
Log "Starting llama-server on port 11435..."
$llamaLog  = Join-Path $env:TEMP "llama-server.log"
$llamaProc = Start-Process -FilePath $LlamaExe `
    -ArgumentList "--model `"$GgufPath`" --port 11435 --ctx-size 8192 --n-gpu-layers 99" `
    -RedirectStandardOutput $llamaLog -RedirectStandardError $llamaLog `
    -PassThru -WindowStyle Hidden
$llamaProc.Id | Out-File (Join-Path $PidDir "llama-server.pid") -Encoding ascii

# Wait for health endpoint
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-RestMethod "http://localhost:11435/health" -ErrorAction Stop
        if ($r.status -eq "ok") { $ready = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (-not $ready) { Fail "llama-server did not start in time. Check $llamaLog" }
Ok "llama-server ready (pid $($llamaProc.Id))"

# ── Store backend ─────────────────────────────────────────────────────────────
Log "Starting store backend on port 3000..."
$storeLog  = Join-Path $env:TEMP "store-backend.log"
$storeProc = Start-Process -FilePath "node" -ArgumentList "server.js" `
    -WorkingDirectory $PSScriptRoot `
    -RedirectStandardOutput $storeLog -RedirectStandardError $storeLog `
    -PassThru -WindowStyle Hidden
$storeProc.Id | Out-File (Join-Path $PidDir "store-backend.pid") -Encoding ascii
Start-Sleep -Seconds 2

if ($storeProc.HasExited) { Fail "Store backend failed to start. Check $storeLog" }
Ok "Store backend ready (pid $($storeProc.Id))"

# ── Agent service ─────────────────────────────────────────────────────────────
Log "Starting agent service on port 3001..."
$agentLog  = Join-Path $env:TEMP "agent-service.log"
$agentProc = Start-Process -FilePath "npx" -ArgumentList "ts-node src/index.ts" `
    -WorkingDirectory (Join-Path $PSScriptRoot "agent") `
    -RedirectStandardOutput $agentLog -RedirectStandardError $agentLog `
    -PassThru -WindowStyle Hidden
$agentProc.Id | Out-File (Join-Path $PidDir "agent-service.pid") -Encoding ascii
Start-Sleep -Seconds 3

if ($agentProc.HasExited) { Fail "Agent service failed to start. Check $agentLog" }
Ok "Agent service ready (pid $($agentProc.Id))"

Write-Host ""
Write-Host "All services running." -ForegroundColor Green
Write-Host ""
Write-Host "  Admin UI  ->  http://localhost:3000/admin"
Write-Host "  Store API ->  http://localhost:3000/api"
Write-Host "  Agent API ->  http://localhost:3001/chat"
Write-Host ""
Write-Host "To stop all services, run:  .\stop.ps1"
