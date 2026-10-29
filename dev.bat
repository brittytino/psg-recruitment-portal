@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal - Development and Demo

echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - DEVELOPMENT AND DEMO RUNNER
echo ================================================================================
echo.

if not exist .env.development (
    if exist .env.example (
        copy /y .env.example .env.development >nul
    )
)

echo [INFO] Activating Development / Demo environment (.env.development to .env)...
copy /y .env.development .env >nul
echo [OK] Active environment set to Development / Demo (http://localhost:6969)

call run.bat dev %*
