@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal - Development

echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - DEVELOPMENT RUNNER
echo ================================================================================
echo.

if not exist .env.development (
    if exist .env.example (
        copy /y .env.example .env.development >nul
    )
)

echo [INFO] Copying .env.development to .env...
copy /y .env.development .env >nul
echo [OK] Active environment set to Development (http://localhost:6969)

call run.bat %*
