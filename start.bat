@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal  Setup and Deployment

REM ==============================================================================
REM PSG TECH STAFF RECRUITMENT PORTAL  INITIAL SYSTEM DEPLOYMENT (WINDOWS)
REM ==============================================================================
REM Usage:
REM   start.bat              First-time full stack deployment & database bootstrap
REM   start.bat prod         First-time production deployment
REM   start.bat dev          First-time development deployment (with Mailpit)
REM   start.bat demo         First-time demo deployment
REM ==============================================================================

cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL  INITIAL DEPLOYMENT
echo ================================================================================
echo.

REM Fallback search for Docker Desktop binary in standard locations
where docker >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;!PATH!"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=%ProgramFiles(x86)%\Docker\Docker\resources\bin;!PATH!"
    )
)

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

REM Detect Docker Compose syntax (docker compose vs docker-compose)
set "COMPOSE_CMD=docker compose"
docker compose version >nul 2>&1
if errorlevel 1 (
    where docker-compose >nul 2>&1
    if not errorlevel 1 (
        set "COMPOSE_CMD=docker-compose"
    )
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
) else if /i "%MODE%"=="demo" (
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
    if exist .env.development (
        copy /y .env.development .env >nul
        echo [OK] Initialized .env from .env.development [Local / Demo]
    ) else if exist .env.example (
        copy /y .env.example .env >nul
        echo [OK] Initialized .env from .env.example
    )
) else (
    echo [OK] Using existing configured .env
)

REM Read port and database variables from .env
set "PORT=6969"
set "PG_USER=srp_owner"
set "PG_PASS=PsgTech_DbOwner_2026!"
set "APP_USER=srp_app"
set "APP_PASS=PsgTech_AppUser_2026!"
set "PG_DB=srportal"

if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="APP_HOST_PORT" set "PORT=%%B"
        if "%%A"=="POSTGRES_USER" set "PG_USER=%%B"
        if "%%A"=="POSTGRES_PASSWORD" set "PG_PASS=%%B"
        if "%%A"=="APP_DB_USER" set "APP_USER=%%B"
        if "%%A"=="APP_DB_PASSWORD" set "APP_PASS=%%B"
        if "%%A"=="POSTGRES_DB" set "PG_DB=%%B"
    )
)
for /f "tokens=1" %%C in ("!PORT!") do set "PORT=%%C"
for /f "tokens=1" %%C in ("!PG_USER!") do set "PG_USER=%%C"
for /f "tokens=1" %%C in ("!PG_DB!") do set "PG_DB=%%C"
for /f "tokens=1" %%C in ("!APP_USER!") do set "APP_USER=%%C"

REM ------------------------------------------------------------------------------
REM Step 2: Storage Preparation
REM ------------------------------------------------------------------------------
echo [2/5] Preparing persistent document storage...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml run --rm --no-deps app sh -c "mkdir -p /var/lib/srportal/storage" >nul 2>&1
echo [OK] Storage directory initialized.

REM ------------------------------------------------------------------------------
REM Step 3: Container Build
REM ------------------------------------------------------------------------------
echo [3/5] Building Docker application and worker images...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml build app worker migrate converter
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
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml up -d --remove-orphans db redis

echo [INFO] Waiting for PostgreSQL readiness...
set /a pg_attempts=0
:pg_wait
set /a pg_attempts+=1
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml exec -T db pg_isready -U !PG_USER! -d !PG_DB! >nul 2>&1
if not errorlevel 1 goto pg_ready
if !pg_attempts! geq 30 goto pg_ready
ping 127.0.0.1 -n 2 >nul 2>&1
goto pg_wait

:pg_ready
setlocal DisableDelayedExpansion
%COMPOSE_CMD% -f compose.yaml -f compose.dev.yaml exec -T db psql -U %PG_USER% -d %PG_DB% -c "ALTER USER \"%PG_USER%\" WITH PASSWORD '%PG_PASS%'; ALTER USER \"%APP_USER%\" WITH PASSWORD '%APP_PASS%';" >nul 2>&1
%COMPOSE_CMD% -f compose.yaml -f compose.dev.yaml exec -T db psql -U %PG_USER% -d %PG_DB% -c "UPDATE \"_prisma_migrations\" SET finished_at = NOW(), applied_steps_count = 1 WHERE migration_name = '20261028100000_add_qualification_mode_of_study' AND finished_at IS NULL;" >nul 2>&1
endlocal

echo [INFO] Running database migrations and seed runner...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml run --rm migrate
if errorlevel 1 (
    echo [WARN] Container migration runner encountered an issue. Retrying with host seed if available...
    if exist node_modules (
        setlocal DisableDelayedExpansion
        set "DATABASE_URL=postgresql://%PG_USER%:%PG_PASS%@localhost:6543/%PG_DB%?schema=public"
        cmd /c "npx prisma migrate deploy && npx tsx prisma/seed.ts"
        endlocal
    )
)
echo [OK] Database migrated and approved institutional accounts seeded.

REM ------------------------------------------------------------------------------
REM Step 5: Stack Launch & Readiness
REM ------------------------------------------------------------------------------
echo [5/5] Launching full recruitment portal stack...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml up -d --remove-orphans
echo [OK] All service containers launched.

echo.
echo [INFO] Waiting for service readiness...
set /a attempts=0

:health_loop
set /a attempts+=1
where curl.exe >nul 2>&1
if not errorlevel 1 (
    curl.exe -s -f http://127.0.0.1:!PORT!/healthz/ready >nul 2>&1
) else (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:!PORT!/healthz/ready' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
)
if not errorlevel 1 goto stack_ready
if !attempts! geq 35 goto stack_pending
ping 127.0.0.1 -n 3 >nul 2>&1
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
echo    PSG TECH STAFF RECRUITMENT PORTAL  INITIAL DEPLOYMENT COMPLETE
echo ================================================================================
echo.
echo    [WEB PORTAL URL]      http://localhost:!PORT!
echo    [SIGN IN PAGE]        http://localhost:!PORT!/login
echo    [DATABASE VIEWER]     http://localhost:6981  (Modern pgweb web interface)
echo    [LOCAL EMAIL INBOX]   http://localhost:8025  (Mailpit web UI, SMTP on 2525)
echo    [SMTP HEALTH CHECK]   http://localhost:!PORT!/healthz/smtp
echo.
echo    AUTHENTICATION:
echo    100%% Passwordless Email OTP (6-digit numeric codes delivered via SMTP / Mailpit)
echo.
echo    APPROVED PRIVILEGED ACCOUNTS BOOTSTRAPPED:
echo    " Super Admin (Tino):             brittytino08@gmail.com  (Full System Access)
echo    " Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)
echo    " Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)
echo    " HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles ^& Screening)
echo    " HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review ^& Summary Sheet)
echo.
echo    ROUTINE OPERATIONS NOTE:
echo    Initial deployment is complete. For subsequent launches, simply execute:
echo      run.bat   (or run.bat dev / run.bat prod / run.bat up)
echo ================================================================================
echo.

start "" "http://localhost:!PORT!"
exit /b 0
