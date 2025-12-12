@echo off
echo Starting skej System...

:: Start Backend (Port 3000)
echo Starting Backend...
start "skej Backend" /D "%~dp0skej-backend" cmd /k "node server.js"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start Frontend (Port 3001)
echo Starting Frontend...
start "skej Frontend" /D "%~dp0skej-app" cmd /k "npm run dev -- -p 3001"

:: Open Application
timeout /t 5 /nobreak >nul
start http://localhost:3001

