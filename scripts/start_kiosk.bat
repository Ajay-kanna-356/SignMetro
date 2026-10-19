@echo off
:: SignMeet — Windows kiosk startup script
:: Starts both services and opens the kiosk UI in Microsoft Edge.
::
:: Prerequisites:
::   - Python >=3.10 with recognition\requirements.txt installed
::   - Node.js >=18 with npm install already run
::   - isl_transformer_best_132.keras in the project root
::   - dataset_sign_metro\ in the project root (for class discovery fallback)
::
:: Usage: double-click scripts\start_kiosk.bat  (from project root)
::        or: cd SignMetro && scripts\start_kiosk.bat

setlocal
set ROOT=%~dp0..
cd /d "%ROOT%"

echo ============================================================
echo  SignMeet Kiosk Startup
echo ============================================================

:: ---- 1. Start Python recognition service ----
echo [1/3] Starting Python recognition service...
start "SignMeet-Python" cmd /k "python -m recognition.service"

:: Wait for Python to initialise model (model load ~3-5 s)
timeout /t 5 /nobreak >nul

:: ---- 2. Start Node.js backend ----
echo [2/3] Starting Node.js backend...
start "SignMeet-Node" cmd /k "npm run dev"

:: Wait for Express to bind
timeout /t 3 /nobreak >nul

:: ---- 3. Open kiosk UI in Edge (kiosk / fullscreen mode) ----
echo [3/3] Opening kiosk UI...
start "" msedge --app=http://localhost:3000 --window-size=1920,1080

echo ============================================================
echo  SignMeet is running.
echo  Kiosk UI   → http://localhost:3000
echo  Python WS  → ws://localhost:8765
echo  Camera     → http://localhost:8766/video_feed
echo  API status → http://localhost:3000/api/status
echo ============================================================
echo  Close this window OR press Ctrl+C in each service window to stop.
