$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location $root

$sslDir = Join-Path $root ".ssl"
$store = Join-Path $sslDir "truststore.jks"
if (-not (Test-Path $store)) {
    New-Item -ItemType Directory -Force -Path $sslDir | Out-Null
    $jbr = $env:JAVA_HOME
    Copy-Item (Join-Path $jbr "lib\security\cacerts") $store -Force
    $tcp = New-Object System.Net.Sockets.TcpClient("dl.google.com", 443)
    $ssl = New-Object System.Net.Security.SslStream($tcp.GetStream(), $false, { $true })
    $ssl.AuthenticateAsClient("dl.google.com")
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    [void]$chain.Build($cert)
    $i = 0
    $keytool = Join-Path $jbr "bin\keytool.exe"
    foreach ($el in $chain.ChainElements) {
        $cer = Join-Path $sslDir "chain-$i.cer"
        [IO.File]::WriteAllBytes($cer, $el.Certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
        & $keytool -importcert -noprompt -alias "chain-$i" -file $cer -keystore $store -storepass changeit | Out-Null
        $i++
    }
    $ssl.Close(); $tcp.Close()
}

$gradle = Join-Path $env:TEMP "gradle-8.11.1-home\gradle-8.11.1\bin\gradle.bat"
if (Test-Path (Join-Path $root "gradlew.bat")) {
    $gradle = Join-Path $root "gradlew.bat"
} elseif (-not (Test-Path $gradle)) {
    throw "Gradle 8.11.1 non trovato. Installa Android Studio oppure scarica Gradle."
}

& $gradle assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item (Join-Path $root "app\build\outputs\apk\debug\app-debug.apk") (Join-Path $root "ServiceHub-tablet-debug.apk") -Force
Write-Output "OK: $(Join-Path $root 'ServiceHub-tablet-debug.apk')"
