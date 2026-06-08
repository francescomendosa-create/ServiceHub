# Hook pre-push: pubblica Service Remote su Firebase prima di ogni push su main.
# Se il deploy locale fallisce (offline / non loggato), il push continua e la CI su GitHub riprova.

$ErrorActionPreference = "Continue"
$root = $PSScriptRoot

function Test-RemoteFilesChanged {
    param([string[]]$Files)
    $patterns = @(
        '^remote/',
        '^digital-remote\.css$',
        '^sh-remote-',
        '^splash-remote-',
        '^remote-host/',
        '^index\.html$',
        '^firestore\.rules$',
        '^_sync-remote-host\.ps1$',
        '^_deploy-remote-firebase\.ps1$',
        '^firebase\.json$'
    )
    foreach ($f in $Files) {
        $norm = ($f -replace '\\', '/')
        foreach ($p in $patterns) {
            if ($norm -match $p) { return $true }
        }
    }
    return $false
}

$branch = ""
try { $branch = git -C $root rev-parse --abbrev-ref HEAD 2>$null } catch {}
if ($branch -ne "main") {
    Write-Host "[remote-auto] push su '$branch' — deploy automatico solo su main." -ForegroundColor DarkGray
    exit 0
}

$remote = $env:GIT_PUSH_REMOTE_NAME
if (-not $remote) { $remote = "origin" }

$changed = @()
try {
    $null = git -C $root rev-parse --verify "$remote/main" 2>$null
    $changed = git -C $root diff --name-only "$remote/main...HEAD" 2>$null
} catch {
    $changed = git -C $root diff --name-only HEAD~1..HEAD 2>$null
}

if (-not (Test-RemoteFilesChanged -Files $changed)) {
    Write-Host "[remote-auto] Nessun file remoto nel push — skip deploy." -ForegroundColor DarkGray
    exit 0
}

Write-Host "[remote-auto] Modifiche remote rilevate — deploy Firebase in corso..." -ForegroundColor Cyan

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    Write-Host "[remote-auto] Firebase CLI assente — il push continua; la CI GitHub fara il deploy." -ForegroundColor Yellow
    exit 0
}

try {
    & (Join-Path $root "_deploy-remote-firebase.ps1")
    if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
    Write-Host "[remote-auto] Deploy locale OK." -ForegroundColor Green
} catch {
    Write-Host "[remote-auto] Deploy locale fallito: $_" -ForegroundColor Yellow
    Write-Host "[remote-auto] Il push continua — GitHub Actions pubblichera Service Remote." -ForegroundColor Yellow
}

exit 0
