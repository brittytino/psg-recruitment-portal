# PSG Tech Recruitment Portal - Windows launcher (Docker Desktop).
# Called by dev.bat / prod.bat:  powershell -File scripts\portal.ps1 <dev|prod> [command] [service]
# Commands: up (default), stop, down, restart, logs [svc], status, health, seed, migrate, rebuild, shell [svc], env, help
param(
  [Parameter(Mandatory = $true)][ValidateSet("dev", "prod")][string]$Mode,
  [string]$Command = "up",
  [string]$Service = ""
)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host " ok $m" -ForegroundColor Green }
function Warn($m) { Write-Host "warn $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "error $m" -ForegroundColor Red; exit 1 }

# Docker Desktop is often installed but not on PATH in new shells.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  foreach ($p in @("$env:ProgramFiles\Docker\Docker\resources\bin", "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin")) {
    if (Test-Path "$p\docker.exe") { $env:PATH = "$p;$env:PATH" }
  }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die "Docker Desktop is not installed: https://www.docker.com/products/docker-desktop/" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Die "Docker Desktop is not running. Start it, wait until it says 'Engine running', then try again." }

$files = if ($Mode -eq "dev") { @("-f", "compose.yaml", "-f", "compose.dev.yaml") } else { @("-f", "compose.yaml") }
if ($Mode -eq "prod" -and (Test-Path .env) -and (Select-String -Path .env -Pattern "^DB_VIEWER_ENABLED=true" -Quiet)) { $files += @("--profile", "dbviewer") }
function Dc { & docker compose --env-file .env @files @args; if ($LASTEXITCODE -ne 0) { throw "docker compose $($args -join ' ') failed" } }

function EnvGet($key) {
  if (-not (Test-Path .env)) { return "" }
  $line = Get-Content .env | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
  if (-not $line) { return "" }
  return ($line.Substring($key.Length + 1)).Trim().Trim('"')
}

function Rand($bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([Convert]::ToBase64String($b)).Replace("+", "-").Replace("/", "_").TrimEnd("=")
}

function Write-Lf($path, $text) { [IO.File]::WriteAllText((Join-Path (Get-Location) $path), ($text -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false)) }

function CreateEnv {
  if ($Mode -eq "dev") {
    Write-Lf ".env" ([IO.File]::ReadAllText((Join-Path (Get-Location) ".env.development")))
    Ok "Created .env from .env.development"; return
  }
  $owner = Rand 24; $app = Rand 24
  $t = [IO.File]::ReadAllText((Join-Path (Get-Location) ".env.production"))
  $t = $t.Replace("__POSTGRES_PASSWORD__", $owner).Replace("__APP_DB_PASSWORD__", $app)
  $t = $t -replace "(?m)^POSTGRES_PASSWORD=.*", "POSTGRES_PASSWORD=$owner"
  $t = $t -replace "(?m)^APP_DB_PASSWORD=.*", "APP_DB_PASSWORD=$app"
  $t = $t -replace "(?m)^SESSION_SECRET=.*", "SESSION_SECRET=$(Rand 48)"
  $t = $t -replace "(?m)^CONVERTER_TOKEN=.*", "CONVERTER_TOKEN=$(Rand 24)"
  $t = $t -replace "(?m)^DB_VIEWER_PASSWORD=.*", "DB_VIEWER_PASSWORD=$(Rand 18)"
  $pw = $env:SMTP_PASSWORD
  if (-not $pw -and (Test-Path secretssmtp_password)) { $pw = (Get-Content secretssmtp_password -Raw).Trim() }
  if (-not $pw) {
    $sec = Read-Host -AsSecureString "Gmail app password for recruitments@psgtech.ac.in (one time)"
    $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  }
  $pw = $pw.Replace(" ", "")
  if (-not $pw) { Die "A Gmail app password is required for sign-in e-mails." }
  $t = $t -replace "(?m)^SMTP_PASSWORD=.*", ("SMTP_PASSWORD=" + $pw)
  Write-Lf ".env" $t
  Ok "Created .env with generated secrets"
}

function CheckEnv {
  if (-not (Test-Path .env)) { Info ".env not found - creating it"; CreateEnv }
  # Docker reads .env literally: CRLF line endings would end up inside passwords.
  $raw = [IO.File]::ReadAllText((Join-Path (Get-Location) ".env"))
  if ($raw.Contains("`r")) { Write-Lf ".env" $raw; Warn "Converted .env to LF line endings" }
  foreach ($k in "POSTGRES_PASSWORD", "APP_DB_PASSWORD", "DATABASE_URL", "MIGRATION_DATABASE_URL", "SESSION_SECRET", "CONVERTER_TOKEN", "APP_ORIGIN") {
    if (-not (EnvGet $k)) { Die "Missing $k in .env" }
  }
  if ($Mode -eq "prod") {
    if ((EnvGet "NODE_ENV") -ne "production") { Die "NODE_ENV must be production in .env" }
    if ((EnvGet "EMAIL_PROVIDER") -eq "mailpit") { Die "Set EMAIL_PROVIDER=smtp and SMTP_* values for production" }
    $smtpHost = EnvGet "SMTP_HOST"; $smtpPort = EnvGet "SMTP_PORT"; if (-not $smtpPort) { $smtpPort = "587" }
    $client = New-Object Net.Sockets.TcpClient
    try {
      if ($client.ConnectAsync($smtpHost, [int]$smtpPort).Wait(6000) -and $client.Connected) { Ok "Mail server reachable: ${smtpHost}:$smtpPort" }
      else { throw "unreachable" }
    } catch {
      Warn "Cannot reach the mail server ${smtpHost}:$smtpPort. Sign-in codes will NOT be delivered."
      Warn "Allow outbound TCP $smtpPort in the firewall/antivirus, or use the institution's SMTP relay."
    } finally { $client.Dispose() }
  } elseif ((EnvGet "NODE_ENV") -eq "production") {
    Warn ".env holds production settings. Run 'dev.bat env' for development settings."
  }
}

function Port { $p = EnvGet "APP_HOST_PORT"; if ($p) { $p } else { "6969" } }

function Healthy {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$(Port)/healthz/ready").StatusCode -eq 200 } catch { $false }
}

function WaitHealthy {
  Info "Waiting for the portal (first start can take a few minutes)..."
  for ($i = 0; $i -lt 90; $i++) {
    if (Healthy) {
      Write-Host ""
      Ok "Portal is up: http://localhost:$(Port)"
      if ($Mode -eq "dev") { $mp = EnvGet "MAILPIT_UI_HOST_PORT"; if (-not $mp) { $mp = "8025" }; Ok "Mailpit (e-mails and sign-in codes): http://localhost:$mp" }
      return
    }
    $id = (& docker compose --env-file .env @files ps -aq migrate 2>$null | Select-Object -First 1)
    if ($id) {
      $state = (& docker inspect -f "{{.State.Status}} {{.State.ExitCode}}" $id 2>$null)
      if ($state -match "^exited [1-9]") { & docker compose --env-file .env @files logs --tail 60 migrate; Die "Database migration failed (see above)." }
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 5
  }
  & docker compose --env-file .env @files logs --tail 80 app worker
  Die "The portal did not become healthy in time."
}

function Up {
  CheckEnv
  Info "Building images ($Mode)..."
  Dc build app converter
  Info "Starting services..."
  Dc up -d --remove-orphans
  WaitHealthy
  Start-Process "http://localhost:$(Port)"
}

switch ($Command) {
  { $_ -in "up", "start" } { Up }
  "stop" { Dc stop }
  "down" { Dc down --remove-orphans }
  "restart" { CheckEnv; Dc restart app worker; WaitHealthy }
  "logs" { if ($Service) { Dc logs -f --tail 200 $Service } else { Dc logs -f --tail 200 app worker migrate } }
  { $_ -in "status", "ps" } { Dc ps }
  "health" { if (Healthy) { Ok "healthy" } else { Die "not healthy" } }
  "seed" { CheckEnv; Dc run --rm migrate node build-worker/seed.js }
  "migrate" { CheckEnv; Dc run --rm migrate npx prisma migrate deploy }
  "rebuild" { CheckEnv; Dc build --no-cache app converter; Dc up -d --force-recreate --remove-orphans; WaitHealthy }
  "shell" { $s = if ($Service) { $Service } else { "app" }; Dc exec $s sh }
  "env" { if (Test-Path .env) { Copy-Item .env ".env.backup.$(Get-Date -Format yyyyMMddHHmmss)"; Remove-Item .env; Warn "Old .env backed up" }; CreateEnv }
  default {
    Write-Host "Usage: $Mode.bat [up|stop|down|restart|logs [svc]|status|health|seed|migrate|rebuild|shell [svc]|env]"
  }
}
