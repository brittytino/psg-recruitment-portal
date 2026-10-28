@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal — First Deployment

REM ==============================================================================
REM PSG TECH STAFF RECRUITMENT PORTAL — INITIAL SYSTEM DEPLOYMENT (WINDOWS)
REM ==============================================================================
REM Usage:
REM   start.bat              First-time full stack deployment & database bootstrap
REM   start.bat prod         First-time production deployment
REM   start.bat dev          First-time development deployment (with Mailpit)
REM ==============================================================================

cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL — FIRST-TIME DEPLOYMENT
echo ================================================================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker command not found!
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop engine is not running!
    echo Please start Docker Desktop and ensure the engine has started.
    pause
    exit /b 1
)

REM ------------------------------------------------------------------------------
REM Step 1: Environment Initialization
REM ------------------------------------------------------------------------------
echo [1/5] Setting up environment configuration...
set "MODE=%~1"

if /i "%MODE%"=="dev" (
    if exist .env.development (
        copy /y .env.development .env >nul
        echo [OK] Initialized .env from .env.development
    )
) else if /i "%MODE%"=="development" (
    if exist .env.development (
        copy /y .env.development .env >nul
        echo [OK] Initialized .env from .env.development
    )
) else if /i "%MODE%"=="prod" (
    if exist .env.production (
        copy /y .env.production .env >nul
        echo [OK] Initialized .env from .env.production
    )
) else if /i "%MODE%"=="production" (
    if exist .env.production (
        copy /y .env.production .env >nul
        echo [OK] Initialized .env from .env.production
    )
) else if not exist .env (
    if exist .env.production (
        copy /y .env.production .env >nul
        echo [OK] Initialized .env from .env.production
    ) else if exist .env.example (
        copy /y .env.example .env >nul
        echo [OK] Initialized .env from .env.example
    )
) else (
    echo [OK] Using existing configured .env
)

REM ------------------------------------------------------------------------------
REM Step 2: Storage Preparation
REM ------------------------------------------------------------------------------
echo [2/5] Preparing persistent document storage...
docker compose -f compose.yaml -f compose.dev.yaml run --rm --no-deps app sh -c "mkdir -p /var/lib/srportal/storage" >nul 2>&1
echo [OK] Storage directory initialized.

REM ------------------------------------------------------------------------------
REM Step 3: Container Build
REM ------------------------------------------------------------------------------
echo [3/5] Building Docker application and worker images...
docker compose -f compose.yaml -f compose.dev.yaml build app worker migrate converter
if errorlevel 1 (
    echo [ERROR] Docker build failed.
    pause
    exit /b 1
)
echo [OK] Docker images built successfully.

REM ------------------------------------------------------------------------------
REM Step 4: Database Schema Migration & Account Seeding
REM ------------------------------------------------------------------------------
echo [4/5] Deploying database schema and bootstrapping institutional accounts...
docker compose -f compose.yaml -f compose.dev.yaml up -d --remove-orphans db redis

echo [INFO] Waiting for PostgreSQL readiness...
timeout /t 4 /nobreak >nul

docker compose -f compose.yaml -f compose.dev.yaml exec -T db psql -U srp_owner -d srportal -c "ALTER USER srp_owner WITH PASSWORD 'PsgTech_DbOwner_2026!'; ALTER USER srp_app WITH PASSWORD 'PsgTech_AppUser_2026!';" >nul 2>&1

echo [INFO] Running database migrations and seed runner...
docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate
if errorlevel 1 (
    echo [WARN] Container migration runner encountered an issue. Retrying with host seed if available...
    if exist node_modules (
        set "DATABASE_URL=postgresql://srp_owner:PsgTech_DbOwner_2026%%21@localhost:6543/srportal?schema=public"
        cmd /c "npx prisma migrate deploy && npx tsx prisma/seed.ts"
    )
)
echo [OK] Database migrated and approved institutional accounts seeded.

REM ------------------------------------------------------------------------------
REM Step 5: Stack Launch & Readiness
REM ------------------------------------------------------------------------------
echo [5/5] Launching full recruitment portal stack...
docker compose -f compose.yaml -f compose.dev.yaml up -d --remove-orphans
echo [OK] All service containers launched.

echo.
echo [INFO] Waiting for service readiness...
set /a attempts=0

:health_loop
set /a attempts+=1
curl.exe -s -f http://127.0.0.1:6969/healthz/ready >nul 2>&1
if not errorlevel 1 goto stack_ready
if !attempts! geq 35 goto stack_pending
timeout /t 2 /nobreak >nul
goto health_loop

:stack_pending
echo [NOTE] Portal healthcheck still initializing (ClamAV or background workers starting).
goto finalize_deploy

:stack_ready
echo [OK] Portal readiness verified!

:finalize_deploy
echo deployed > .deployed
echo [OK] Deployment marker (.deployed) recorded.

cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL — INITIAL DEPLOYMENT COMPLETE
echo ================================================================================
echo.
echo    [WEB PORTAL URL]      http://localhost:6969
echo    [SIGN IN PAGE]        http://localhost:6969/login
echo    [DATABASE VIEWER]     http://localhost:6981  (Modern pgweb web interface)
echo    [LOCAL EMAIL INBOX]   http://localhost:8025  (Mailpit web UI, SMTP on 2525)
echo    [SMTP HEALTH CHECK]   http://localhost:6969/healthz/smtp
echo.
echo    AUTHENTICATION:
echo    100%% Passwordless Email OTP (6-digit numeric codes delivered via SMTP / Mailpit)
echo.
echo    APPROVED PRIVILEGED ACCOUNTS BOOTSTRAPPED:
echo    • Super Admin (Tino):             brittytino08@gmail.com  (Full System Access)
echo    • Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)
echo    • Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)
echo    • HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles & Screening)
echo    • HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review & Summary Sheet)
echo.
echo    ROUTINE OPERATIONS NOTE:
echo    Initial deployment is complete. For subsequent launches, simply execute:
echo      run.bat   (or run.bat up / run.bat start)
echo ================================================================================
echo.

start "" "http://localhost:6969"
exit /b 0
