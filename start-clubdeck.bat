@echo off
cd /d "%~dp0"
echo Starting Clubdeck Desktop Studio...
start "" ".\node_modules\electron\dist\electron.exe" .
