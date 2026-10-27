@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal - Production

echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - PRODUCTION RUNNER
echo ================================================================================
echo.

if not exist .env.production (
    echo [ERROR] .env.production not found!
    pause
    exit /b 1
)

echo [INFO] Copying .env.production to .env...
copy /y .env.production .env >nul
echo [OK] Active environment set to Production (https://recruitments.psgtech.ac.in)

call run.bat %*
