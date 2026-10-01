@echo off
cd /d "%~dp0dashboard"
if not exist data.json node import.mjs ..
echo Open http://127.0.0.1:4173 in your browser.
node server.mjs
pause
