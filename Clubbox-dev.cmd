@echo off
REM Personal / free launch path under Windows 11 Smart App Control.
REM Packaged Clubbox.exe is blocked (unsigned + no reputation).
REM Official Electron.exe often still runs via Microsoft app intelligence.
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "dist\index.html" (
  echo Building Clubbox...
  call npm run build
  if errorlevel 1 exit /b 1
)

echo Starting Clubbox via Electron ^(no installer^)...
call npm run desktop:preview
exit /b %ERRORLEVEL%
