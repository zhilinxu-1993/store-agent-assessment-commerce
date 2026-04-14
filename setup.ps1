# setup.ps1 — one-time setup for the store admin agent project (Windows).
# Run once in PowerShell before using start.ps1.
# Requires PowerShell 5.1+ and internet access.

param()
$ErrorActionPreference = "Stop"

function Log  { Write-Host "[setup] $args" -ForegroundColor White }
function Ok   { Write-Host "[setup] $args" -ForegroundColor Green }
function Warn { Write-Host "[setup] $args" -ForegroundColor Yellow }
function Fail { Write-Host "[setup] $args" -ForegroundColor Red; exit 1 }

# ── Prerequisites ─────────────────────────────────────────────────────────────
Log "Checking prerequisites..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Warn "Node.js not found. Attempting install via winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + $env:PATH
}
$nodeVer = node -e "process.exit(parseInt(process.versions.node) < 18 ? 1 : 0)" 2>$null
if ($LASTEXITCODE -ne 0) { Fail "Node.js 18+ required. Current: $(node --version)" }
Ok "Node $(node --version), npm $(npm --version)"

if (-not (Get-Command python3 -ErrorAction SilentlyContinue) -and
    -not (Get-Command python  -ErrorAction SilentlyContinue)) {
    Fail "Python 3 is required. Install from https://python.org"
}
$PYTHON = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" } else { "python" }

# ── llama-server binary ───────────────────────────────────────────────────────
$BinDir   = Join-Path $PSScriptRoot "bin"
$LlamaExe = Join-Path $BinDir "llama-server.exe"

if (Test-Path $LlamaExe) {
    Ok "llama-server already present at $LlamaExe"
} else {
    Log "Downloading llama-server binary for Windows x64..."
    New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

    $release  = Invoke-RestMethod "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
    $asset    = $release.assets | Where-Object { $_.name -match "win" -and $_.name -match "avx2" -and $_.name -match "x64" -and $_.name -match "\.zip$" } | Select-Object -First 1
    if (-not $asset) {
        $asset = $release.assets | Where-Object { $_.name -match "win" -and $_.name -match "x64" -and $_.name -match "\.zip$" } | Select-Object -First 1
    }
    if (-not $asset) { Fail "Could not find a Windows x64 llama.cpp release. Check https://github.com/ggml-org/llama.cpp/releases" }

    $tmpZip = Join-Path $env:TEMP "llama-win.zip"
    Log "Downloading $($asset.name)..."
    Invoke-WebRequest $asset.browser_download_url -OutFile $tmpZip
    Expand-Archive $tmpZip -DestinationPath $BinDir -Force
    Remove-Item $tmpZip

    # Binary may be in a sub-folder inside the zip
    $found = Get-ChildItem $BinDir -Recurse -Filter "llama-server.exe" | Select-Object -First 1
    if (-not $found) { Fail "llama-server.exe not found after extracting zip." }
    if ($found.FullName -ne $LlamaExe) {
        Move-Item $found.FullName $LlamaExe -Force
    }
    Ok "llama-server installed at $LlamaExe"
}

# ── Ollama + Qwen3 8b model ───────────────────────────────────────────────────
$ModelManifest = Join-Path $env:USERPROFILE ".ollama\models\manifests\registry.ollama.ai\library\qwen3\8b"

if (Test-Path $ModelManifest) {
    Ok "Qwen3 8b model already downloaded"
} else {
    Log "Downloading Qwen3 8b model via Ollama (5.2 GB — this will take a while)..."

    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Log "Installing Ollama..."
        winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + $env:PATH
        Start-Sleep -Seconds 3
    }

    $ollamaJob = Start-Process ollama -ArgumentList "serve" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 5
    ollama pull qwen3:8b
    Stop-Process -Id $ollamaJob.Id -ErrorAction SilentlyContinue
    Ok "Qwen3 8b downloaded"
}

# ── Verify model blob ─────────────────────────────────────────────────────────
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
if (-not (Test-Path $GgufPath)) { Fail "Model file not found at $GgufPath" }
Ok "Model file verified: $GgufPath"

# ── npm dependencies ──────────────────────────────────────────────────────────
Log "Installing store backend dependencies..."
npm install
Ok "Store backend dependencies installed"

Log "Installing agent service dependencies..."
Push-Location agent
npm install
Pop-Location
Ok "Agent service dependencies installed"

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start all services, run:  .\start.ps1"
Write-Host "Then open:  http://localhost:3000/admin"
