#Requires -Version 5.1
<#
.SYNOPSIS
  Bootstrap local AI Exam Generator stack (Docker Desktop + Supabase + Vite env).
#>
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "==> Checking Docker Desktop..."
$dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
  if (Test-Path $dockerExe) { Start-Process $dockerExe } else { throw "Docker Desktop not found" }
}

$deadline = (Get-Date).AddMinutes(10)
do {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { break }
  Write-Host "    waiting for Docker engine..."
  Start-Sleep -Seconds 8
} while ((Get-Date) -lt $deadline)

docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker engine is not ready. Open Docker Desktop and retry." }

Write-Host "==> Starting Supabase local stack..."
npx supabase start

Write-Host "==> Writing .env from supabase status..."
$statusJson = npx supabase status -o env 2>$null
if (-not $statusJson) { $statusJson = npx supabase status -o env }

# Parse KEY=value lines from supabase status -o env
$envMap = @{}
$statusJson -split "`n" | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)=(.*)\s*$') {
    $envMap[$matches[1]] = $matches[2].Trim('"')
  }
}

$apiUrl = $envMap['API_URL']
if (-not $apiUrl) { $apiUrl = $envMap['SUPABASE_URL'] }
if (-not $apiUrl) { $apiUrl = "http://127.0.0.1:54321" }
$anon = $envMap['ANON_KEY']
if (-not $anon) { $anon = $envMap['SUPABASE_ANON_KEY'] }
$service = $envMap['SERVICE_ROLE_KEY']
if (-not $service) { $service = $envMap['SUPABASE_SERVICE_ROLE_KEY'] }

@"
VITE_SUPABASE_URL=$apiUrl
VITE_SUPABASE_ANON_KEY=$anon
"@ | Set-Content -Path ".env" -Encoding UTF8

Write-Host "    wrote .env"

Write-Host "==> Seeding demo users + sample course..."
if ($service) {
  $headers = @{
    Authorization = "Bearer $service"
    apikey = $service
    "Content-Type" = "application/json"
  }
  try {
    Invoke-RestMethod -Method Post -Uri "$apiUrl/functions/v1/seed-demo-users" -Headers $headers -Body "{}" | ConvertTo-Json -Depth 5
  } catch {
    Write-Host "    seed via edge failed (functions may need serve). Trying supabase functions serve is separate."
    Write-Host "    $($_.Exception.Message)"
  }
}

Write-Host @"

Done.
  Studio:  http://127.0.0.1:54323
  API:     $apiUrl
  App:     npm run dev  -> http://127.0.0.1:5173

Demo logins (password: demo1234):
  instructor@example.com
  reviewer@example.com
  academic@example.com
  admin@example.com

Optional AI:
  npx supabase secrets set OPENAI_API_KEY=sk-...
"@
