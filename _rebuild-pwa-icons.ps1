# Rigenera icone PWA: ritaglio, rimozione nero, pulizia bordi dopo resize, output con nuovi nomi file.

Add-Type -AssemblyName System.Drawing

$assetsDir = "C:\Users\franc\.cursor\projects\c-Users-franc-Downloads-NEW-PROGECT-cursor-app\assets"
$srcFile = Get-ChildItem -LiteralPath $assetsDir -File | Where-Object { $_.Name -like "*Gemini_Generated_Image_4n4v2x4n4v2x4n4v__1_*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $srcFile) { Write-Error "Sorgente non trovata"; exit 1 }

$tmp = Join-Path $PSScriptRoot "_icon-src-temp.png"
$bytes = [System.IO.File]::ReadAllBytes("\\?\$($srcFile.FullName)")
[System.IO.File]::WriteAllBytes($tmp, $bytes)
Write-Host "Sorgente: $($srcFile.Name)"

$srcImg = [System.Drawing.Image]::FromFile($tmp)
$W = $srcImg.Width
$H = $srcImg.Height

$threshContent = 40
$minX = $W; $minY = $H; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $H; $y++) {
    for ($x = 0; $x -lt $W; $x++) {
        $c = $srcImg.GetPixel($x, $y)
        $lum = [int](($c.R + $c.G + $c.B) / 3)
        if ($lum -gt $threshContent) {
            if ($x -lt $minX) { $minX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1
$pad = [Math]::Max(4, [int]([Math]::Min($cw, $ch) * 0.02))
$minX = [Math]::Max(0, $minX - $pad)
$minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($W - 1, $maxX + $pad)
$maxY = [Math]::Min($H - 1, $maxY + $pad)
$cw = $maxX - $minX + 1
$ch = $maxY - $minY + 1

$cropRect = [System.Drawing.Rectangle]::new($minX, $minY, $cw, $ch)
$cropped = New-Object System.Drawing.Bitmap $cw, $ch
$g0 = [System.Drawing.Graphics]::FromImage($cropped)
$g0.DrawImage($srcImg, [System.Drawing.Rectangle]::new(0, 0, $cw, $ch), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g0.Dispose()
$srcImg.Dispose()

$sumR=0L; $sumG=0L; $sumB=0L; $cnt=0
for ($y = 0; $y -lt $ch; $y++) {
    for ($x = 0; $x -lt $cw; $x++) {
        $c = $cropped.GetPixel($x, $y)
        $lum = [int](($c.R + $c.G + $c.B) / 3)
        if ($lum -gt 55) {
            $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $cnt++
        }
    }
}
if ($cnt -eq 0) { $bg = [System.Drawing.Color]::FromArgb(37, 99, 235) } else {
    $bg = [System.Drawing.Color]::FromArgb([int]($sumR/$cnt), [int]($sumG/$cnt), [int]($sumB/$cnt))
}
Write-Host "Colore riempimento: R=$($bg.R) G=$($bg.G) B=$($bg.B)"

# Nero e quasi-nero ovunque
$threshBlack = 62
for ($y = 0; $y -lt $ch; $y++) {
    for ($x = 0; $x -lt $cw; $x++) {
        $c = $cropped.GetPixel($x, $y)
        $lum = [int](($c.R + $c.G + $c.B) / 3)
        if ($lum -lt $threshBlack) {
            $cropped.SetPixel($x, $y, $bg)
        }
    }
}

$side = [Math]::Max($cw, $ch)
$square = New-Object System.Drawing.Bitmap $side, $side
$gs = [System.Drawing.Graphics]::FromImage($square)
$gs.Clear($bg)
$ox = [int](($side - $cw) / 2)
$oy = [int](($side - $ch) / 2)
$gs.DrawImage($cropped, $ox, $oy)
$gs.Dispose()
$cropped.Dispose()
Write-Host "Quadrato: ${side}x${side}"

function Lum($c) { return [int](($c.R + $c.G + $c.B) / 3) }
function Sat($c) {
    $mx = [Math]::Max($c.R, [Math]::Max($c.G, $c.B))
    $mn = [Math]::Min($c.R, [Math]::Min($c.G, $c.B))
    return $mx - $mn
}

# Aloni scuri/grigi tra squircle e sfondo: bassa luminanza + bassa saturazione
function Repair-Bitmap($bmp, [System.Drawing.Color]$fill) {
    $W = $bmp.Width
    $H = $bmp.Height
    $bx = [Math]::Max(2, [int]($W * 0.045))
    $by = [Math]::Max(2, [int]($H * 0.045))
    $edgeLum = 72
    for ($y = 0; $y -lt $H; $y++) {
        for ($x = 0; $x -lt $bx; $x++) {
            $c = $bmp.GetPixel($x, $y)
            if ((Lum $c) -lt $edgeLum) { $bmp.SetPixel($x, $y, $fill) }
        }
        for ($x = $W - $bx; $x -lt $W; $x++) {
            $c = $bmp.GetPixel($x, $y)
            if ((Lum $c) -lt $edgeLum) { $bmp.SetPixel($x, $y, $fill) }
        }
    }
    for ($x = $bx; $x -lt ($W - $bx); $x++) {
        for ($y = 0; $y -lt $by; $y++) {
            $c = $bmp.GetPixel($x, $y)
            if ((Lum $c) -lt $edgeLum) { $bmp.SetPixel($x, $y, $fill) }
        }
        for ($y = $H - $by; $y -lt $H; $y++) {
            $c = $bmp.GetPixel($x, $y)
            if ((Lum $c) -lt $edgeLum) { $bmp.SetPixel($x, $y, $fill) }
        }
    }
    for ($y = 0; $y -lt $H; $y++) {
        for ($x = 0; $x -lt $W; $x++) {
            $c = $bmp.GetPixel($x, $y)
            $L = Lum $c
            $S = Sat $c
            if ($L -lt 44) { $bmp.SetPixel($x, $y, $fill) }
            elseif ($L -lt 62 -and $S -lt 48) { $bmp.SetPixel($x, $y, $fill) }
        }
    }
}

function Save-Resized($bmp, $size, $out, $fill) {
    $r = New-Object System.Drawing.Bitmap $size, $size
    $gr = [System.Drawing.Graphics]::FromImage($r)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gr.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $gr.DrawImage($bmp, 0, 0, $size, $size)
    $gr.Dispose()
    Repair-Bitmap $r $fill
    $r.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $r.Dispose()
    Write-Host "Salvato $out"
}

# Nuovi nomi file -> Windows/Chrome non riusano cache dei vecchi path
Save-Resized $square 512 "$PSScriptRoot\sh-icon-512.png" $bg
Save-Resized $square 192 "$PSScriptRoot\sh-icon-192.png" $bg
Save-Resized $square 180 "$PSScriptRoot\sh-touch.png" $bg
Save-Resized $square 32  "$PSScriptRoot\sh-favicon.png" $bg
$square.Save("$PSScriptRoot\icon-source.png", [System.Drawing.Imaging.ImageFormat]::Png)

$square.Dispose()
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Write-Host "Fatto."
