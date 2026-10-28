
@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal

REM CLI Arguments
if /i "%~1"=="help" goto do_help
if /i "%~1"=="-h" goto do_help
if /i "%~1"=="--help" goto do_help
if /i "%~1"=="/?" goto do_help
if /i "%~1"=="up" goto do_up_headless
if /i "%~1"=="start" goto do_up_headless
if /i "%~1"=="stop" goto do_stop
if /i "%~1"=="down" goto do_down
if /i "%~1"=="restart" goto do_restart
if /i "%~1"=="logs" goto do_logs
if /i "%~1"=="status" goto do_status
if /i "%~1"=="ps" goto do_status
if /i "%~1"=="health" goto do_health
if /i "%~1"=="env" goto do_copy_env
if /i "%~1"=="copy-env" goto do_copy_env
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

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker command not found!
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop engine is not running!
    pause
    exit /b 1
)

if not exist .env (
    echo [INFO] Creating .env from .env.example...
    if not exist .env.example (
        echo [ERROR] .env.example not found.
        pause
        exit /b 1
    )
    copy /y .env.example .env >nul
    echo [OK] Successfully copied .env.example -^> .env
)

if not exist .deployed (
    echo [INFO] First-time deployment detected. Running initial build and migrations...
    echo.
    echo [1/3] Building Docker images...
    docker compose -f compose.yaml -f compose.dev.yaml build app worker migrate converter
    if errorlevel 1 (
        echo [ERROR] Docker build failed.
        pause
        exit /b 1
    )
    echo.
    echo [2/3] Initializing database and bootstrapping institutional accounts...
    docker compose -f compose.yaml -f compose.dev.yaml up -d db redis
    docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate
    docker compose -f compose.yaml -f compose.dev.yaml up -d --remove-orphans
    echo deployed > .deployed
) else (
    echo [INFO] Bringing up recruitment portal stack...
    docker compose -f compose.yaml -f compose.dev.yaml up -d
)

echo.
echo [3/3] Waiting for portal health...
set /a attempts=0

:health_loop
set /a attempts+=1
curl.exe -s -f http://127.0.0.1:6969/healthz/ready >nul 2>&1
if not errorlevel 1 goto stack_healthy
if !attempts! geq 30 goto stack_timeout
timeout /t 2 /nobreak >nul
goto health_loop

:stack_timeout
echo [NOTE] Healthcheck timed out. Containers may still be starting.
goto show_summary

:stack_healthy
echo [OK] Recruitment Portal is healthy!

:show_summary
cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL — READY
echo ================================================================================
echo.
echo    [WEB PORTAL]      http://localhost:6969
echo    [SIGN IN PAGE]    http://localhost:6969/login
echo    [DATABASE HOST]   localhost:6543  (PostgreSQL 17, internal 5432)
echo    [DATABASE VIEWER] http://localhost:6981  (Adminer: db / srportal / srp_owner)
echo    [EMAIL INBOX]     http://localhost:8025  (Mailpit web UI, SMTP on 2525)
echo.
echo    AUTHENTICATION:
echo    100%% Passwordless Email OTP (6-digit codes delivered via Mailpit / SMTP)
echo.
echo    APPROVED INITIAL PRIVILEGED ACCOUNTS:
echo    • Super Admin (Tino):             brittytino08@gmail.com  (Full System Admin)
echo    • Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)
echo    • Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)
echo    • HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles & Screening)
echo    • HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review & Summary Sheet)
echo.
echo    * Production starts cleanly with NO dummy applicants or fake recruitment data.
echo ================================================================================
echo.

start "" "http://localhost:6969"

if /i "%~1"=="up" exit /b 0
if /i "%~1"=="start" exit /b 0

:interactive_loop
echo.
echo Select an option:
echo   [B] Open Portal in Browser
echo   [D] Open Database Viewer
echo   [M] Open Mailbox Inbox
echo   [A] Seed / Reset Demo Accounts
echo   [S] Launch Prisma Studio GUI
echo   [L] View Container Logs
echo   [R] Clean Rebuild (--no-cache)
echo   [X] Stop Stack and Exit
echo   [Q] Quit (keep stack running)
echo.

set "choice="
set /p choice="Enter choice [B/D/M/A/S/L/R/X/Q]: "

if /i "%choice%"=="B" goto do_open_portal
if /i "%choice%"=="D" goto do_open_db
if /i "%choice%"=="M" goto do_open_mail
if /i "%choice%"=="A" goto do_seed
if /i "%choice%"=="S" goto do_studio
if /i "%choice%"=="L" goto do_logs
if /i "%choice%"=="R" goto do_clean_rebuild
if /i "%choice%"=="X" goto do_down
if /i "%choice%"=="Q" goto do_quit

echo Invalid choice. Please try again.
goto interactive_loop

:do_open_portal
start "" "http://localhost:6969"
goto interactive_loop

:do_open_mail
start "" "http://localhost:8025"
goto interactive_loop

:do_clean_rebuild
cls
echo ================================================================================
echo    CLEAN REBUILD IN DOCKER
echo ================================================================================
echo Stopping containers...
docker compose -f compose.yaml -f compose.dev.yaml down
if errorlevel 1 (
    echo [ERROR] Failed to stop the stack.
    pause
    goto interactive_loop
)

echo Rebuilding images without cache...
docker compose -f compose.yaml -f compose.dev.yaml build --no-cache app worker migrate converter
if errorlevel 1 (
    echo [ERROR] Rebuild failed.
    pause
    goto interactive_loop
)

echo Starting stack...
docker compose -f compose.yaml -f compose.dev.yaml up -d --force-recreate
if errorlevel 1 (
    echo [ERROR] Failed to start the stack.
    pause
    goto interactive_loop
)
goto show_summary

:do_seed
echo.
echo ================================================================================
echo    REGISTERING FORM TEMPLATES AND STAFF ACCOUNTS
echo ================================================================================
echo Seeding form templates and the approved institutional accounts...
echo.

setlocal DisableDelayedExpansion
set "DATABASE_URL=postgresql://srp_owner:PsgTech_DbOwner_2026%%21@localhost:6543/srportal?schema=public"
cmd /c "npx tsx prisma/seed.ts"
set "SEED_EXIT_CODE=%errorlevel%"
endlocal & set "SEED_EXIT_CODE=%SEED_EXIT_CODE%"

echo.
if "%SEED_EXIT_CODE%"=="0" (
    echo [OK] Seed command completed successfully.
) else (
    echo [INFO] Host seed failed, trying via Docker container runner...
    docker compose -f compose.yaml -f compose.dev.yaml run --rm migrate node build-worker/seed.js
    set "SEED_EXIT_CODE=%errorlevel%"
    if "!SEED_EXIT_CODE!"=="0" (
        echo [OK] Seed completed successfully via Docker!
    ) else (
        echo [ERROR] Seeding failed with exit code !SEED_EXIT_CODE!.
    )
)

REM If called as run.bat seed, return the exit code to the terminal.
if /i "%~1"=="seed" exit /b %SEED_EXIT_CODE%

pause
goto interactive_loop

:do_studio
echo Starting Prisma Studio on host...
start "Prisma Studio" cmd /k "set \"DATABASE_URL=postgresql://srp_owner:PsgTech_DbOwner_2026%%21@localhost:6543/srportal?schema=public\" && npx prisma studio --port 5555"
goto interactive_loop

:do_logs
docker compose -f compose.yaml -f compose.dev.yaml logs -f app worker db adminer
goto interactive_loop

:do_status
docker compose -f compose.yaml -f compose.dev.yaml ps
exit /b %errorlevel%

:do_open_db
start "" "http://localhost:6981/?pgsql=db&username=srp_owner&db=srportal&ns=public"
if /i "%~1"=="db" exit /b 0
if /i "%~1"=="adminer" exit /b 0
goto interactive_loop

:do_health
echo Checking portal readiness (http://127.0.0.1:6969/healthz/ready)...
curl.exe -i http://127.0.0.1:6969/healthz/ready
exit /b %errorlevel%

:do_copy_env
if not exist .env.example (
    echo [ERROR] .env.example not found.
    exit /b 1
)
echo [INFO] Copying .env.example to .env...
copy /y .env.example .env >nul
echo [OK] Successfully copied .env.example -^> .env
exit /b 0

:do_help
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - DOCKER RUNNER
echo ================================================================================
echo.
echo Usage: run.bat [COMMAND]
echo.
echo Commands:
echo   (none)            Start portal, wait for health, and launch interactive menu
echo   up, start         Start portal stack in background (non-interactive)
echo   stop              Gracefully stop containers (preserves data volumes)
echo   down              Stop and remove containers (preserves data volumes)
echo   restart           Restart portal containers
echo   logs              Stream container logs (app worker db adminer)
echo   status, ps        Show container status and published ports
echo   health            Query the /healthz/ready status endpoint
echo   seed              Seed form templates and approved institutional accounts
echo   env, copy-env     Copy .env.example to .env directly
echo   rebuild, --clean  Rebuild Docker images without cache (--no-cache) and start
echo   studio            Launch Prisma Studio GUI on port 5555
echo   db, adminer       Open Database Adminer viewer in browser
echo   help, -h, --help  Display this help reference
echo.
exit /b 0

:do_up_headless
goto main_menu

:do_stop
docker compose -f compose.yaml -f compose.dev.yaml stop
exit /b %errorlevel%

:do_down
echo Stopping and removing containers...
docker compose -f compose.yaml -f compose.dev.yaml down
exit /b %errorlevel%

:do_restart
docker compose -f compose.yaml -f compose.dev.yaml restart
exit /b %errorlevel%

:do_quit
echo Stack is running in the background. Goodbye!
exit /b 0
