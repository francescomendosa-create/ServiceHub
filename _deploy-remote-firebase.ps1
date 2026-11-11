# Deploy Service Remote su servicehub-18309.web.app
# Esegui: powershell -ExecutionPolicy Bypass -File .\_deploy-remote-firebase.ps1

$env:NODE_OPTIONS = "--use-system-ca"
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Service Remote -> servicehub-18309.web.app ===" -ForegroundColor Cyan

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI non trovato. Installa con: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

& (Join-Path $root "_sync-remote-host.ps1")

Write-Host "Deploy hosting Firebase ..." -ForegroundColor Yellow
Push-Location $root
try {
    firebase deploy --only hosting --project servicehub-18309
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Fatto. Service Remote: https://servicehub-18309.web.app/install.html" -ForegroundColor Green
