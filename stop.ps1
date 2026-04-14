# stop.ps1 — gracefully stops all services started by start.ps1 (Windows).

param()

function Log { Write-Host "[stop] $args" -ForegroundColor White }
function Ok  { Write-Host "[stop] $args" -ForegroundColor Green }

function Stop-PidFile {
    param([string]$Name, [string]$PidFile)
    if (Test-Path $PidFile) {
        $pid = Get-Content $PidFile -Raw
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $pid -Force
            Ok "$Name stopped (pid $pid)"
        } else {
            Ok "$Name was not running"
        }
        Remove-Item $PidFile -Force
    } else {
        Ok "$Name`: no PID file found"
    }
}

Log "Stopping services..."
Stop-PidFile "Agent service" (Join-Path $env:TEMP "agent-service.pid")
Stop-PidFile "Store backend" (Join-Path $env:TEMP "store-backend.pid")
Stop-PidFile "llama-server"  (Join-Path $env:TEMP "llama-server.pid")

Write-Host ""
Write-Host "All services stopped." -ForegroundColor Green
