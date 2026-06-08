# Deploy Service Remote sul sito Hosting predefinito (servicehub-18309.web.app)
# Esegui: powershell -ExecutionPolicy Bypass -File .\_deploy-remote-firebase.ps1

$env:NODE_OPTIONS = "--use-system-ca"
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$rh = Join-Path $root "remote-host"

Write-Host "=== Service Remote -> servicehub-18309.web.app ===" -ForegroundColor Cyan

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "Firebase CLI non trovato. Installa con: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $rh | Out-Null
Copy-Item (Join-Path $root "digital-remote.css") $rh -Force
Copy-Item (Join-Path $root "sh-remote-*.png") $rh -Force
Copy-Item (Join-Path $root "splash-remote-*.png") $rh -Force
Copy-Item (Join-Path $root "remote\sw-remote.js") (Join-Path $rh "sw.js") -Force
Copy-Item (Join-Path $root "remote\manifest.firebase.json") (Join-Path $rh "manifest.json") -Force

$src = Get-Content (Join-Path $root "remote\index.html") -Raw -Encoding UTF8
$src = $src -replace '\.\./', ''
$src = $src -replace 'manifest\.firebase\.json\?v=fb2', 'manifest.json?v=fb2'
$src = $src -replace 'sw-remote\.js\?v=fb2', 'sw.js?v=fb2'
$src = $src -replace 'v=web5', 'v=fb2'
$src = $src -replace 'v=rm5', 'v=fb2'
[System.IO.File]::WriteAllText((Join-Path $rh "index.html"), $src, [System.Text.UTF8Encoding]::new($false))

Write-Host "Cartella remote-host aggiornata." -ForegroundColor Green
Write-Host "Deploy sul sito predefinito servicehub-18309.web.app ..." -ForegroundColor Yellow
Push-Location $root
try {
    firebase deploy --only hosting --project servicehub-18309
} finally {
    Pop-Location
}
Write-Host ""
Write-Host "Fatto. Apri il link /r/... da LINK REMOTO oppure installa da Chrome (menu -> Installa)." -ForegroundColor Green
