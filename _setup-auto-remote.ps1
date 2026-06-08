# Configura una tantum: hook git + istruzioni token CI GitHub.
# Esegui: powershell -ExecutionPolicy Bypass -File .\_setup-auto-remote.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Setup auto-sync Service Remote ===" -ForegroundColor Cyan

Push-Location $root
try {
    git config core.hooksPath .githooks
    Write-Host "[OK] Hook git attivo (.githooks/pre-push)" -ForegroundColor Green
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Cosa succede adesso:" -ForegroundColor Yellow
Write-Host "  1. Ogni git push su main con file remote -> deploy Firebase (locale + CI)"
Write-Host "  2. ServiceHub si aggiorna con git push (GitHub Pages)"
Write-Host "  3. Service Remote si aggiorna in automatico (Firebase Hosting)"
Write-Host ""
Write-Host "Per la CI su GitHub (obbligatorio una volta):" -ForegroundColor Yellow
Write-Host "  a) firebase login:ci"
Write-Host "  b) Copia il token"
Write-Host "  c) GitHub repo ServiceHub -> Settings -> Secrets -> Actions"
Write-Host "  d) Nuovo secret: FIREBASE_TOKEN = token del passo (a)"
Write-Host ""
Write-Host "Verifica CI: .github/workflows/deploy-service-remote.yml" -ForegroundColor DarkGray
