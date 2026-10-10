@echo off
REM Development only. Installers are produced by npm run dist.
cd /d "%~dp0"
echo Starting Clubbox...
start "Clubbox" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
