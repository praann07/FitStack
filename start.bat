@echo off
title FitStack
cd /d "%~dp0frontend"

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"

echo Starting FitStack dev server...
call npm run dev
