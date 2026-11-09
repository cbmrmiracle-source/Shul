@echo off
REM Starts the Chrome bridge and restarts it if it ever exits.
cd /d "%~dp0"
:loop
node src\agent.mjs
echo Bridge stopped - restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
