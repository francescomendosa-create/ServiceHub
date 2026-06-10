# Copia e prepara remote-host/ (senza deploy Firebase).
# Usato da _deploy-remote-firebase.ps1 e dalla CI GitHub Actions.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$rh = Join-Path $root "remote-host"

New-Item -ItemType Directory -Force -Path $rh | Out-Null

Copy-Item (Join-Path $root "digital-remote.css") $rh -Force
Copy-Item (Join-Path $root "tank-3d.png") $rh -Force
Copy-Item (Join-Path $root "tank-3d-drain.png") $rh -Force
Copy-Item (Join-Path $root "tank-3d-acc.png") $rh -Force
Copy-Item (Join-Path $root "tank-3d-acc-dren.png") $rh -Force
Copy-Item (Join-Path $root "sh-remote-*.png") $rh -Force
Copy-Item (Join-Path $root "splash-remote-*.png") $rh -Force
Copy-Item (Join-Path $root "remote\sw-remote.js") (Join-Path $rh "sw.js") -Force
Copy-Item (Join-Path $root "remote\manifest.firebase.json") (Join-Path $rh "manifest.json") -Force
Copy-Item (Join-Path $root "remote\install.html") (Join-Path $rh "install.html") -Force
Copy-Item (Join-Path $root "remote\install-help.js") (Join-Path $rh "install-help.js") -Force

$src = Get-Content (Join-Path $root "remote\index.html") -Raw -Encoding UTF8
$src = $src -replace '\.\./', ''
$src = $src -replace "manifest\.firebase\.json(\?v=[^`"]+)?", "manifest.json?v=fb5"
$src = $src -replace "sw-remote\.js(\?v=[^`"]+)?", "sw.js?v=fb5"
$src = $src -replace "install-help\.js(\?v=[^`"]+)?", "install-help.js?v=v23"
$src = $src -replace "sw\.js(\?v=[^`"]+)?", "sw.js?v=fb19"
$src = $src -replace "digital-remote\.css(\?v=[^`"]+)?", "digital-remote.css?v=dig89"

[System.IO.File]::WriteAllText((Join-Path $rh "index.html"), $src, [System.Text.UTF8Encoding]::new($false))

Write-Host "[sync] remote-host aggiornato." -ForegroundColor Green
