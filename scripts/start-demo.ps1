param([string]$PhoneIP)
$ErrorActionPreference = 'Stop'
$TaskProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $TaskProjectRoot
$TaskPython = Join-Path $TaskProjectRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $TaskPython)) { throw 'Project Python venv is missing. See README setup.' }
if (-not (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue)) {
    $TaskOllama = (Get-Command ollama -ErrorAction Stop).Source
    Start-Process -FilePath $TaskOllama -ArgumentList 'serve' -WindowStyle Hidden
}
$TaskArguments = @('scripts/preflight.py')
if ($PhoneIP) { $TaskArguments += @('--phone-ip', $PhoneIP) }
$TaskReadinessJson = & $TaskPython @TaskArguments
$TaskReadiness = ($TaskReadinessJson -join "`n") | ConvertFrom-Json
$TaskReadinessJson | Write-Output
if ($TaskReadiness.phone_origin) { $env:GUPAI_PAIR_BASE_URL = $TaskReadiness.phone_origin }
if (-not $TaskReadiness.checks.https_key -or -not $TaskReadiness.checks.https_certificate_valid) {
    throw 'HTTPS key/certificate missing or expired. See README mkcert setup.'
}
if (-not $TaskReadiness.checks.phone_ip_in_certificate) {
    Write-Warning 'Certificate does not cover the current phone LAN IP. Regenerate it before pairing a real phone.'
}
if (Get-NetTCPConnection -LocalPort 8443 -State Listen -ErrorAction SilentlyContinue) {
    Write-Output 'GupAi is already running. Open https://localhost:8443. Restart its terminal to load code changes.'
    return
}
Write-Output 'Open https://localhost:8443 on the laptop. Phone joins through the chair QR.'
& $TaskPython -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem
