@echo off
cd /d "%~dp0"

echo Radyoloji sistemi baslatiliyor...
start "Radyoloji Sistemi" cmd /k "node server.js"

timeout /t 2 /nobreak >nul
start http://localhost:4000
