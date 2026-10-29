@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title PSG Tech Staff Recruitment Portal

REM Read APP_HOST_PORT from .env (defaults to 6969)
set "PORT=6969"
set "PG_USER=srp_owner"
set "PG_PASS=PsgTech_DbOwner_2026!"
set "PG_DB=srportal"

if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="APP_HOST_PORT" set "PORT=%%B"
        if "%%A"=="POSTGRES_USER" set "PG_USER=%%B"
        if "%%A"=="POSTGRES_PASSWORD" set "PG_PASS=%%B"
        if "%%A"=="POSTGRES_DB" set "PG_DB=%%B"
    )
)
for /f "tokens=1" %%C in ("!PORT!") do set "PORT=%%C"
for /f "tokens=1" %%C in ("!PG_USER!") do set "PG_USER=%%C"
for /f "tokens=1" %%C in ("!PG_DB!") do set "PG_DB=%%C"

REM Fallback search for Docker Desktop binary in standard locations
where docker >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;!PATH!"
    ) else if exist "%ProgramFiles(x86)%\Docker\Docker\resources\bin\docker.exe" (
        set "PATH=%ProgramFiles(x86)%\Docker\Docker\resources\bin;!PATH!"
    )
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

REM CLI Arguments routing
:cli_route
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
if /i "%~1"=="init-env" goto do_copy_env
if /i "%~1"=="studio" goto do_studio
if /i "%~1"=="db" goto do_open_db
if /i "%~1"=="adminer" goto do_open_db
if /i "%~1"=="pgweb" goto do_open_db
if /i "%~1"=="viewer" goto do_open_db
if /i "%~1"=="mail" goto do_open_mail
if /i "%~1"=="mailpit" goto do_open_mail
if /i "%~1"=="seed" goto do_seed
if /i "%~1"=="rebuild" goto do_clean_rebuild
if /i "%~1"=="--clean" goto do_clean_rebuild
if /i "%~1"=="shell" goto do_shell
if /i "%~1"=="bash" goto do_shell
if /i "%~1"=="sh" goto do_shell
if /i "%~1"=="prod" goto do_prod
if /i "%~1"=="production" goto do_prod
if /i "%~1"=="dev" goto do_dev
if /i "%~1"=="development" goto do_dev
if /i "%~1"=="demo" goto do_dev

REM Unknown CLI argument handler
if not "%~1"=="" (
    echo [ERROR] Unknown command: "%~1"
    echo.
    call :do_help
    exit /b 1
)

:main_menu
cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL - DOCKER RUNNER
echo ================================================================================
echo.

where docker >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker command not found^!
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop/
    if "%~1"=="" pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Desktop engine is not running^!
    echo Please start Docker Desktop and ensure the engine has started.
    if "%~1"=="" pause
    exit /b 1
)

if not exist .env (
    if exist .env.development (
        echo [INFO] Creating .env from .env.development [Local / Demo]...
        copy /y .env.development .env >nul
    ) else if exist .env.example (
        echo [INFO] Creating .env from .env.example...
        copy /y .env.example .env >nul
    )
    echo [OK] Initialized .env
)

REM Re-read APP_HOST_PORT from .env (defaults to 6969)
set "PORT=6969"
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
        if "%%A"=="APP_HOST_PORT" set "PORT=%%B"
    )
)
for /f "tokens=1" %%C in ("!PORT!") do set "PORT=%%C"

if not exist .deployed (
    echo [INFO] First-time deployment detected. Initializing stack via start.bat...
    call start.bat %*
    exit /b !errorlevel!
) else (
    echo [INFO] Bringing up recruitment portal stack...
    !COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml up -d --remove-orphans
)

echo.
echo [3/3] Waiting for portal health...
set /a attempts=0

:health_loop
set /a attempts+=1
where curl.exe >nul 2>&1
if not errorlevel 1 (
    curl.exe -s -f http://127.0.0.1:!PORT!/healthz/ready >nul 2>&1
) else (
    powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:!PORT!/healthz/ready' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
)
if not errorlevel 1 goto stack_healthy
if !attempts! geq 35 goto stack_timeout
ping 127.0.0.1 -n 3 >nul 2>&1
goto health_loop

:stack_timeout
echo.
echo [NOTE] Healthcheck timed out or services still initializing (e.g. ClamAV signatures).
echo Containers are running in the background. Use 'run.bat logs' to monitor progress.
goto show_summary

:stack_healthy
echo.
echo [OK] Recruitment Portal is healthy^!

:show_summary
cls
echo ================================================================================
echo    PSG TECH STAFF RECRUITMENT PORTAL  READY
echo ================================================================================
echo.
echo    [WEB PORTAL]      http://localhost:!PORT!
echo    [SIGN IN PAGE]    http://localhost:!PORT!/login
echo    [DATABASE HOST]   localhost:6543  (PostgreSQL 17, internal 5432)
echo    [DATABASE VIEWER] http://localhost:6981  (Modern pgweb web interface)
echo    [EMAIL INBOX]     http://localhost:8025  (Mailpit web UI, SMTP on 2525)
echo.
echo    AUTHENTICATION:
echo    100%% Passwordless Email OTP (6-digit codes delivered via Mailpit / SMTP)
echo.
echo    APPROVED INITIAL PRIVILEGED ACCOUNTS:
echo    " Super Admin (Tino):             brittytino08@gmail.com  (Full System Admin)
echo    " Dean (Dr. S. Saravanan):        dean.admn@psgtech.ac.in (Recruitment Oversight)
echo    " Principal (Dr. G. Thilagavathi): principal@psgtech.ac.in (Recruitment Oversight)
echo    " HR-N4 Section:                  admin.n4@psgtech.ac.in  (Job Profiles ^& Screening)
echo    " HOD (CSE):                      hod.cse@psgtech.ac.in   (CSE Review ^& Summary Sheet)
echo.
echo    * Production starts cleanly with NO dummy applicants or fake recruitment data.
echo ================================================================================
echo.

if /i "%~1"=="up" exit /b 0
if /i "%~1"=="start" exit /b 0
if /i "%~1"=="rebuild" exit /b 0
if /i "%~1"=="--clean" exit /b 0

start "" "http://localhost:!PORT!"

set /a empty_inputs=0

:interactive_loop
echo.
echo Select an option:
echo   [B] Open Portal in Browser
echo   [D] Open Database Viewer (pgweb)
echo   [M] Open Mailbox Inbox (Mailpit)
echo   [A] Seed / Register Form Templates ^& Staff Accounts
echo   [O] Switch to Demo / Development Environment
echo   [P] Switch to Production Environment
echo   [E] Copy / Reset .env from .env.example
echo   [S] Launch Prisma Studio GUI
echo   [L] View Container Logs
echo   [R] Clean Rebuild (--no-cache)
echo   [X] Stop Stack and Exit
echo   [Q] Quit menu (keep stack running)
echo.

set "choice="
set /p choice="Enter choice [B/D/M/A/O/P/E/S/L/R/X/Q]: "

if not defined choice (
    set /a empty_inputs+=1
    if !empty_inputs! geq 3 (
        echo Stack is running in the background. Goodbye^!
        exit /b 0
    )
    goto interactive_loop
)
set "choice=!choice: =!"
set /a empty_inputs=0

if /i "%choice%"=="B" goto do_open_portal
if /i "%choice%"=="D" goto do_open_db
if /i "%choice%"=="M" goto do_open_mail
if /i "%choice%"=="A" goto do_seed
if /i "%choice%"=="O" goto do_dev
if /i "%choice%"=="P" goto do_prod
if /i "%choice%"=="E" goto do_copy_env
if /i "%choice%"=="S" goto do_studio
if /i "%choice%"=="L" goto do_logs
if /i "%choice%"=="R" goto do_clean_rebuild
if /i "%choice%"=="X" goto do_down
if /i "%choice%"=="Q" goto do_quit

echo Invalid choice. Please try again.
goto interactive_loop

:do_open_portal
start "" "http://localhost:!PORT!"
goto interactive_loop

:do_open_mail
start "" "http://localhost:8025"
if /i "%~1"=="mail" exit /b 0
if /i "%~1"=="mailpit" exit /b 0
goto interactive_loop

:do_clean_rebuild
cls
echo ================================================================================
echo    CLEAN REBUILD IN DOCKER
echo ================================================================================
echo Stopping containers...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml down
if errorlevel 1 (
    echo [ERROR] Failed to stop the stack.
    if /i "%~1"=="rebuild" exit /b 1
    if /i "%~1"=="--clean" exit /b 1
    pause
    goto interactive_loop
)

echo Rebuilding images without cache...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml build --no-cache app worker migrate converter
if errorlevel 1 (
    echo [ERROR] Rebuild failed.
    if /i "%~1"=="rebuild" exit /b 1
    if /i "%~1"=="--clean" exit /b 1
    pause
    goto interactive_loop
)

echo Starting stack...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml up -d --force-recreate --remove-orphans
if errorlevel 1 (
    echo [ERROR] Failed to start the stack.
    if /i "%~1"=="rebuild" exit /b 1
    if /i "%~1"=="--clean" exit /b 1
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

echo [INFO] Running seed inside Docker migrate container...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml run --rm migrate node build-worker/seed.js
set "SEED_EXIT_CODE=!errorlevel!"

if "!SEED_EXIT_CODE!"=="0" (
    echo.
    echo [OK] Seed command completed successfully via Docker^!
) else (
    echo.
    echo [WARN] Container seed runner failed. Retrying with host seed if npx is available...
    where npx >nul 2>&1
    if not errorlevel 1 (
        setlocal DisableDelayedExpansion
        set "DATABASE_URL=postgresql://%PG_USER%:%PG_PASS%@localhost:6543/%PG_DB%?schema=public"
        cmd /c "npx tsx prisma/seed.ts"
        set "HOST_SEED_CODE=%errorlevel%"
        endlocal & set "SEED_EXIT_CODE=%HOST_SEED_CODE%"
    )
    if "!SEED_EXIT_CODE!"=="0" (
        echo [OK] Seed completed successfully via host runner^!
    ) else (
        echo [ERROR] Seeding failed with exit code !SEED_EXIT_CODE!.
    )
)

if /i "%~1"=="seed" exit /b !SEED_EXIT_CODE!

pause
goto interactive_loop

:do_studio
where npx >nul 2>&1
if not errorlevel 1 (
    echo Starting Prisma Studio on host (port 5555)...
    setlocal DisableDelayedExpansion
    start "Prisma Studio" cmd /k "set \"DATABASE_URL=postgresql://%PG_USER%:%PG_PASS%@localhost:6543/%PG_DB%?schema=public\" && npx prisma studio --port 5555"
    endlocal
) else (
    echo [INFO] npx not found on host. Executing Prisma Studio via Docker app container...
    start "Prisma Studio" !COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml exec app npx prisma studio --port 5555 --hostname 0.0.0.0
)
if /i "%~1"=="studio" exit /b 0
goto interactive_loop

:do_logs
if not "%~2"=="" (
    !COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml logs -f %2 %3 %4 %5 %6
) else (
    !COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml logs -f app worker db db-viewer
)
if /i "%~1"=="logs" exit /b %errorlevel%
goto interactive_loop

:do_status
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml ps
exit /b %errorlevel%

:do_open_db
start "" "http://localhost:6981"
if /i "%~1"=="db" exit /b 0
if /i "%~1"=="adminer" exit /b 0
if /i "%~1"=="pgweb" exit /b 0
if /i "%~1"=="viewer" exit /b 0
goto interactive_loop

:do_health
echo Checking portal readiness (http://127.0.0.1:!PORT!/healthz/ready)...
where curl.exe >nul 2>&1
if not errorlevel 1 (
    curl.exe -i http://127.0.0.1:!PORT!/healthz/ready
) else (
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'http://127.0.0.1:!PORT!/healthz/ready' -UseBasicParsing | Select-Object -Property StatusCode, StatusDescription, Content"
)
exit /b %errorlevel%

:do_shell
set "TARGET_SVC=%~2"
if "!TARGET_SVC!"=="" set "TARGET_SVC=app"
echo [INFO] Opening shell inside container '!TARGET_SVC!'...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml exec -it !TARGET_SVC! /bin/sh
exit /b !errorlevel!

:do_copy_env
if not exist .env.example (
    echo [ERROR] .env.example not found.
    if not "%~1"=="" exit /b 1
    pause
    goto interactive_loop
)
echo [INFO] Copying .env.example to .env...
copy /y .env.example .env >nul
echo [OK] Successfully copied .env.example to .env
if /i "%~1"=="env" exit /b 0
if /i "%~1"=="copy-env" exit /b 0
if /i "%~1"=="init-env" exit /b 0
pause
goto interactive_loop

:do_prod
if not exist .env.production (
    echo [ERROR] .env.production not found^!
    exit /b 1
)
echo [INFO] Activating Production environment (.env.production to .env)...
copy /y .env.production .env >nul
echo [OK] Active environment set to Production (https://recruitments.psgtech.ac.in)
shift
if not "%~1"=="" goto cli_route
goto main_menu

:do_dev
if not exist .env.development (
    if exist .env.example (
        copy /y .env.example .env.development >nul
    )
)
echo [INFO] Activating Development / Demo environment (.env.development to .env)...
copy /y .env.development .env >nul
echo [OK] Active environment set to Development / Demo (http://localhost:6969)
shift
if not "%~1"=="" goto cli_route
goto main_menu

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
echo   logs [svc...]     Stream container logs (default: app worker db db-viewer)
echo   status, ps        Show container status and published ports
echo   health            Query the /healthz/ready status endpoint
echo   seed              Seed form templates and approved institutional accounts
echo   env, copy-env     Copy .env.example to .env directly
echo   rebuild, --clean  Rebuild Docker images without cache (--no-cache) and start
echo   studio            Launch Prisma Studio GUI on port 5555
echo   shell [svc]       Open interactive shell inside container (default: app)
echo   prod              Switch active environment to Production and start
echo   dev, demo         Switch active environment to Development/Demo and start
echo   db, viewer, pgweb Open Modern Database Viewer (pgweb) in browser
echo   mail, mailpit     Open Mailpit mailbox in browser
echo   help, -h, --help  Display this help reference
echo.
exit /b 0

:do_up_headless
goto main_menu

:do_stop
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml stop
exit /b %errorlevel%

:do_down
echo Stopping and removing containers...
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml down
exit /b %errorlevel%

:do_restart
!COMPOSE_CMD! -f compose.yaml -f compose.dev.yaml restart
goto health_loop

:do_quit
echo Stack is running in the background. Goodbye^!
exit /b 0
