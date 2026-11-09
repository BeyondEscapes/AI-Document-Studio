@echo off
title AI Document Studio - Beyond Escapes
cd /d "%~dp0"
echo Starting AI Document Studio...
echo Opening http://localhost:3000 in your browser...
start http://localhost:3000
npm run dev
pause
