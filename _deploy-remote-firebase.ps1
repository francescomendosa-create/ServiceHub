# Deploy Service Remote sul sito Hosting predefinito (servicehub-18309.web.app)
# Origine diversa da GitHub Pages = seconda PWA installabile su Android/PC.
#
# Prerequisiti: npm install -g firebase-tools  +  firebase login
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

$src = Get-Content (Join-Path $root "remote\index.html") -Raw -Encoding UTF8
$src = $src -replace '\.\./', ''
$src = $src -replace 'sw-remote\.js\?v=rm5', 'sw.js?v=fb1'
$src = $src -replace 'manifest\.json\?v=rm5', 'manifest.json?v=fb1'
$src = $src -replace 'v=rm5', 'v=fb1'
$src = $src -replace 'if \(reg\.scope\.indexOf\("/remote/"\) === -1\) reg\.unregister\(\);', '// origine separata'
[System.IO.File]::WriteAllText((Join-Path $rh "index.html"), $src, [System.Text.UTF8Encoding]::new($false))

# Aggiorna hint installazione nel pacchetto deploy
$hint = Get-Content (Join-Path $rh "index.html") -Raw -Encoding UTF8
$hint = $hint -replace 'Resta su questa pagina \(<code>/remote/</code>\)[^<]+</span>',
    'Dominio dedicato <code>servicehub-18309.web.app</code> &rarr; menu &rarr; <strong>Installa app</strong>. Nome: <strong>SvcRemote</strong>.</span>'
$hint = $hint -replace 'Se vedi .*?</span>',
    'Non usare il vecchio link <code>/remote/</code> su GitHub: Chrome lo considera la stessa app di ServiceHub.</span>'
[System.IO.File]::WriteAllText((Join-Path $rh "index.html"), $hint, [System.Text.UTF8Encoding]::new($false))

Write-Host "Cartella remote-host aggiornata." -ForegroundColor Green
Write-Host "Deploy sul sito predefinito servicehub-18309.web.app ..." -ForegroundColor Yellow
Push-Location $root
try {
    firebase deploy --only hosting --project servicehub-18309
} finally {
    Pop-Location
}
Write-Host ""
Write-Host "Fatto. Installa Service Remote da: https://servicehub-18309.web.app/" -ForegroundColor Green
Write-Host "ServiceHub operatore resta su: .../ServiceHub/op/" -ForegroundColor Green
