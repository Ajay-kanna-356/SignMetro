# SignMeet — PowerShell kiosk startup script
# Starts both services and opens the kiosk UI in default browser / Edge.

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SignMeet Kiosk Startup (PowerShell)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Start Python recognition service
Write-Host "[1/3] Starting Python recognition service..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; python -m recognition.service"

Write-Host "Waiting 5 seconds for model initialization..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# 2. Start Node.js backend
Write-Host "[2/3] Starting Node.js backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ProjectRoot'; npm run dev"

Write-Host "Waiting 3 seconds for Node server..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# 3. Open kiosk UI
Write-Host "[3/3] Opening kiosk UI..." -ForegroundColor Green
Start-Process "http://localhost:3000"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SignMeet is running!" -ForegroundColor Green
Write-Host "  Kiosk UI   -> http://localhost:3000"
Write-Host "  Python WS  -> ws://localhost:8765"
Write-Host "  Camera     -> http://localhost:8766/video_feed"
Write-Host "  API status -> http://localhost:3000/api/status"
Write-Host "============================================================" -ForegroundColor Cyan
