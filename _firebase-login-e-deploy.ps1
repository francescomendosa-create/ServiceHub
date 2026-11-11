# Esegui in PowerShell interattivo:
#   powershell -ExecutionPolicy Bypass -File .\_firebase-login-e-deploy.ps1
$env:NODE_OPTIONS = "--use-system-ca"
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "=== Service Remote: login + deploy ===" -ForegroundColor Cyan
Write-Host ""

$accounts = firebase login:list 2>&1 | Out-String
if ($accounts -match "No authorized accounts") {
    Write-Host "Apertura login Firebase nel browser..." -ForegroundColor Yellow
    Write-Host "Accedi con l'account Google del progetto servicehub-18309." -ForegroundColor Yellow
    firebase login
}

Write-Host ""
& "$root\_deploy-remote-firebase.ps1"
