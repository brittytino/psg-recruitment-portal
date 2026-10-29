@echo off
rem Development stack on Windows (Docker Desktop). Usage: dev.bat [up^|stop^|down^|logs^|status^|seed^|rebuild^|env^|help]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\portal.ps1" dev %*
if errorlevel 1 pause
