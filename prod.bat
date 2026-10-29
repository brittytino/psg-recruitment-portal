@echo off
rem Production stack on Windows (Docker Desktop). Linux servers use ./prod.sh instead.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\portal.ps1" prod %*
if errorlevel 1 pause
