@echo off
REM Opens your regular Google Chrome so the bridge can drive it (attach mode).
REM Use it like normal Chrome: log in, browse, watch what the assistant does.
REM Chrome only allows remote control on a separate profile folder, so this keeps
REM its own profile (logins you make here are remembered).
set PROFILE=%~dp0chrome-profile
set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe
start "" "%CHROME%" --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 --user-data-dir="%PROFILE%" --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion --no-first-run
