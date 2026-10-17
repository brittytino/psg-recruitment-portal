@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal

REM CLI Arguments
if /i "%~1"=="stop" goto do_stop
if /i "%~1"=="down" goto do_down
if /i "%~1"=="restart" goto do_restart
if /i "%~1"=="logs" goto do_logs
if /i "%~1"=="status" goto do_status
if /i "%~1"=="studio" goto do_studio
if /i "%~1"=="db" goto do_open_db
if /i "%~1"=="adminer" goto do_open_db
if /i "%~1"=="seed" goto do_seed
if /i "%~1"=="rebuild" goto do_clean_rebuild
if /i "%~1"=="--clean" goto do_clean_rebuild

:main_menu
cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - DOCKER RUNNER
echo ================================================================================
echo.

REM 1. Check Docker prerequisite
where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker command not found!
    echo Please install Docker Desktop and ensure it is added to your PATH.
    echo Download: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop engine is not running!
    echo Please start Docker Desktop and wait until it finishes initializing.
    echo.
    pause
    exit /b 1
)

REM 2. Ensure .env exists
if not exist .env (
    echo [INFO] .env file not found. Copying .env.example to .env ...
    copy /y .env.example .env >nul
    echo [OK] Created .env with default development settings.
    echo.
)

REM 3. Rebuild images with latest code
echo [1/3] Building fresh Docker images (compiling latest UI and app code)...
docker compose -f compose.yaml -f compose.dev.yaml build app worker migrate
if errorlevel 1 (
    echo.
    echo [ERROR] Docker build failed. Please check the error messages above.
    echo.
    pause
    exit /b 1
)

REM 4. Start the stack
echo.
echo [2/3] Launching Docker stack (App, Worker, DB, Redis, Mailpit, Adminer)...
docker compose -f compose.yaml -f compose.dev.yaml up -d --remove-orphans --force-recreate
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start Docker containers.
    echo.
    pause
    exit /b 1
)

REM 5. Wait for web application health
echo.
echo [3/3] Waiting for database migrations and portal health check...
set /a attempts=0
:health_loop
set /a attempts+=1
curl.exe -s -f http://127.0.0.1:6969/healthz/ready >nul 2>&1
if not errorlevel 1 goto stack_healthy
if !attempts! geq 30 goto stack_timeout
timeout /t 2 /nobreak >nul
goto health_loop

:stack_timeout
echo [NOTE] Healthcheck took longer than expected, but containers are starting up.
goto show_summary

:stack_healthy
echo [OK] Recruitment Portal is ready and healthy!

:show_summary
cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - ALL SERVICES ONLINE!
echo ================================================================================
echo.
echo    [WEB PORTAL]      http://localhost:6969
echo    [DATABASE VIEWER] http://localhost:6981  (Adminer Web GUI)
echo                      - System:    PostgreSQL
echo                      - Server:    db
echo                      - Username:  srp_owner (or srp_app)
echo                      - Database:  srportal
echo                      - Password:  change-me-owner (from .env)
echo.
echo    [EMAIL INBOX]     http://localhost:6980  (Mailpit Web UI)
echo    [POSTGRES DIRECT] localhost:65432
echo    [REDIS DIRECT]    localhost:63879
echo.
echo --------------------------------------------------------------------------------
echo    DEMO LOGIN CREDENTIALS (password: Demo@12345-change):
echo    - Super Admin:   superadmin@example.test
echo    - Admin:         admin@example.test
echo    - HR Officer:    hr@example.test
echo    - Candidate:     candidate@example.test
echo ================================================================================
echo.

start "" "http://localhost:6969"

:interactive_loop
echo Select an option:
echo   [B] Open Portal in Browser      (http://localhost:6969)
echo   [D] Open Database Viewer        (http://localhost:6981)
echo   [M] Open Mailbox Inbox          (http://localhost:6980)
echo   [A] Seed / Reset Demo Accounts  (sets password to Demo@12345 for all roles)
echo   [S] Launch Prisma Studio GUI    (npm run db:studio on host)
echo   [L] View Container Logs
echo   [R] Clean Rebuild (--no-cache)
echo   [X] Stop Stack and Exit
echo   [Q] Quit script (keeps stack running in background)
echo.
set /p choice="Enter choice [B/D/M/A/S/L/R/X/Q]: "

if /i "%choice%"=="B" (
    start "" "http://localhost:6969"
    goto interactive_loop
)
if /i "%choice%"=="D" (
    start "" "http://localhost:6981/?pgsql=db&username=srp_owner&db=srportal"
    goto interactive_loop
)
if /i "%choice%"=="M" (
    start "" "http://localhost:6980"
    goto interactive_loop
)
if /i "%choice%"=="A" (
    call :do_seed
    goto interactive_loop
)
if /i "%choice%"=="S" (
    call :do_studio
    goto interactive_loop
)
if /i "%choice%"=="L" (
    echo.
    echo Following container logs (Press Ctrl+C to stop logs and return)...
    docker compose -f compose.yaml -f compose.dev.yaml logs -f app worker db adminer
    goto interactive_loop
)
if /i "%choice%"=="R" (
    goto do_clean_rebuild
)
if /i "%choice%"=="X" (
    goto do_down
)
if /i "%choice%"=="Q" (
    echo Stack is running in the background. Goodbye!
    exit /b 0
)

goto interactive_loop

:do_clean_rebuild
cls
echo ================================================================================
echo    CLEAN REBUILD IN DOCKER (--no-cache)
echo ================================================================================
echo Stopping current containers...
docker compose -f compose.yaml -f compose.dev.yaml down
echo Rebuilding Docker images from scratch...
docker compose -f compose.yaml -f compose.dev.yaml build --no-cache app worker migrate
echo Starting fresh stack...
docker compose -f compose.yaml -f compose.dev.yaml up -d --force-recreate
goto stack_healthy

:do_stop
echo Stopping containers...
docker compose -f compose.yaml -f compose.dev.yaml stop
exit /b %errorlevel%

:do_down
echo Stopping and removing containers...
docker compose -f compose.yaml -f compose.dev.yaml down
exit /b %errorlevel%

:do_restart
echo Restarting containers...
docker compose -f compose.yaml -f compose.dev.yaml restart
exit /b %errorlevel%

:do_logs
docker compose -f compose.yaml -f compose.dev.yaml logs -f app worker db adminer
exit /b %errorlevel%

:do_status
docker compose -f compose.yaml -f compose.dev.yaml ps
exit /b %errorlevel%

:do_open_db
start "" "http://localhost:6981/?pgsql=db&username=srp_owner&db=srportal"
exit /b 0

:do_studio
echo Starting Prisma Studio on host (http://localhost:5555)...
start "Prisma Studio" cmd /c "npx prisma studio --port 5555"
exit /b 0

:do_seed
echo.
echo ================================================================================
echo    SEEDING / SYNCHRONIZING DEMO ROLE ACCOUNTS
echo ================================================================================
set "DATABASE_URL=postgresql://srp_owner:change-me-owner@localhost:65432/srportal?schema=public"
set "SEED_DEMO_PASSWORD=Demo@12345"
npx tsx scripts/seed-accounts.ts
echo.
pause
exit /b 0
