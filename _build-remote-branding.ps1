# Rigenera icone e splash "Service Remote" dal branding ServiceHub originale.

Add-Type -AssemblyName System.Drawing

$Label = 'Service Remote'
$root = $PSScriptRoot

function Get-Lum($c) { return [int](($c.R + $c.G + $c.B) / 3) }

function Get-AverageColor($colors) {
    if (-not $colors -or $colors.Count -eq 0) {
        return [System.Drawing.Color]::FromArgb(37, 99, 235)
    }
    $r = 0; $g = 0; $b = 0
    foreach ($c in $colors) { $r += $c.R; $g += $c.G; $b += $c.B }
    $n = $colors.Count
    return [System.Drawing.Color]::FromArgb([int]($r / $n), [int]($g / $n), [int]($b / $n))
}

function Paint-BottomLabelBand($bmp, [string]$text, [double]$yStartRatio) {
    $W = $bmp.Width
    $H = $bmp.Height
    $y0 = [Math]::Max(0, [int]($H * $yStartRatio))
    $y1 = $H - 1
    $cTop = $bmp.GetPixel([int]($W / 2), [Math]::Max(0, $y0 - 2))
    $cBot = $bmp.GetPixel([int]($W / 2), [Math]::Max($y0 + 8, $y1 - 1))
    for ($y = $y0; $y -le $y1; $y++) {
        $t = if ($y1 -eq $y0) { 0 } else { ($y - $y0) / [double]($y1 - $y0) }
        $r = [int]($cTop.R + ($cBot.R - $cTop.R) * $t)
        $g = [int]($cTop.G + ($cBot.G - $cTop.G) * $t)
        $b = [int]($cTop.B + ($cBot.B - $cTop.B) * $t)
        $col = [System.Drawing.Color]::FromArgb($r, $g, $b)
        for ($x = 0; $x -lt $W; $x++) {
            $bmp.SetPixel($x, $y, $col)
        }
    }
    $gdi = [System.Drawing.Graphics]::FromImage($bmp)
    $gdi.TextRenderingHint = 4
    $bandH = $y1 - $y0 + 1
    $fontPx = [Math]::Max(9, [int]($bandH * 0.46))
    if ($text.Length -gt 12) { $fontPx = [Math]::Max(8, [int]($bandH * 0.38)) }
    $font = New-Object System.Drawing.Font('Segoe UI', $fontPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectF = New-Object System.Drawing.RectangleF(0, [single]$y0, [single]$W, [single]$bandH)
    $gdi.DrawString($text, $font, $brush, $rectF, $sf)
    $gdi.Dispose()
    $font.Dispose()
    $brush.Dispose()
}

function Replace-LabelInRegion($bmp, [int]$x0, [int]$y0, [int]$x1, [int]$y1, [string]$text, [int]$whiteMin) {
    $W = $bmp.Width
    $H = $bmp.Height
    $x0 = [Math]::Max(0, $x0)
    $y0 = [Math]::Max(0, $y0)
    $x1 = [Math]::Min($W - 1, $x1)
    $y1 = [Math]::Min($H - 1, $y1)
    if ($x1 -le $x0 -or $y1 -le $y0) { return }

    $bgColors = New-Object System.Collections.Generic.List[System.Drawing.Color]
    for ($y = $y0 - 1; $y -ge [Math]::Max(0, $y0 - 20); $y--) {
        for ($x = $x0; $x -le $x1; $x++) {
            $c = $bmp.GetPixel($x, $y)
            if ((Get-Lum $c) -lt 145) { [void]$bgColors.Add($c) }
        }
    }
    $bg = Get-AverageColor $bgColors

    for ($y = $y0; $y -le $y1; $y++) {
        for ($x = $x0; $x -le $x1; $x++) {
            if ((Get-Lum ($bmp.GetPixel($x, $y))) -gt $whiteMin) {
                $bmp.SetPixel($x, $y, $bg)
            }
        }
    }

    $gdi = [System.Drawing.Graphics]::FromImage($bmp)
    $gdi.TextRenderingHint = 4
    $gdi.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $bandH = $y1 - $y0 + 1
    $fontPx = [Math]::Max(8, [int]($bandH * 0.62))
    if ($text.Length -gt 12) { $fontPx = [Math]::Max(7, [int]($bandH * 0.50)) }
    $font = New-Object System.Drawing.Font('Segoe UI', $fontPx, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rectF = New-Object System.Drawing.RectangleF(
        [single]$x0, [single]$y0,
        [single]($x1 - $x0 + 1), [single]($y1 - $y0 + 1))
    $gdi.DrawString($text, $font, $brush, $rectF, $sf)
    $gdi.Dispose()
    $font.Dispose()
    $brush.Dispose()
}

function Build-RemoteIconMaster($srcPath, $outPath) {
    $bytes = [System.IO.File]::ReadAllBytes($srcPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $img = [System.Drawing.Image]::FromStream($ms)
    $bmp = New-Object System.Drawing.Bitmap $img.Width, $img.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.DrawImage($img, 0, 0, $img.Width, $img.Height)
    $g.Dispose()
    $img.Dispose()
    $ms.Dispose()
    Paint-BottomLabelBand $bmp $Label 0.828
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Salvato $outPath"
}

function Save-ResizedFrom($srcBmpPath, $size, $outPath) {
    $img = [System.Drawing.Image]::FromFile($srcBmpPath)
    $r = New-Object System.Drawing.Bitmap $size, $size
    $gr = [System.Drawing.Graphics]::FromImage($r)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.DrawImage($img, 0, 0, $size, $size)
    $gr.Dispose()
    $img.Dispose()
    $r.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $r.Dispose()
    Write-Host "Salvato $outPath"
}

function Overlay-RemoteIconOnSplash($splashPath, $iconPath, $outPath, [int]$ix, [int]$iy, [int]$isize, [int]$refY, [int]$refH, [single]$refAlpha) {
    $splash = [System.Drawing.Image]::FromFile($splashPath)
    $bmp = New-Object System.Drawing.Bitmap $splash.Width, $splash.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($splash, 0, 0, $splash.Width, $splash.Height)
    $icon = [System.Drawing.Image]::FromFile($iconPath)
    $iconCenter = $icon.GetPixel([int]($icon.Width / 2), [int]($icon.Height / 2))
    $erase = New-Object System.Drawing.SolidBrush $iconCenter
    $g.FillRectangle($erase, $ix - 6, $iy - 6, $isize + 12, $isize + 12)
    $erase.Dispose()
    $g.DrawImage($icon, $ix, $iy, $isize, $isize)

    if ($refH -gt 0) {
        $refBg = $bmp.GetPixel([int]($ix + ($isize / 2)), [Math]::Max(0, $refY - 6))
        $refBrush = New-Object System.Drawing.SolidBrush $refBg
        $g.FillRectangle($refBrush, $ix - 12, $refY - 4, $isize + 24, $refH + 10)
        $refBrush.Dispose()

        $refBmp = New-Object System.Drawing.Bitmap $isize, $refH
        $gr = [System.Drawing.Graphics]::FromImage($refBmp)
        $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $srcH = [Math]::Min($refH, $icon.Height)
        $srcRect = [System.Drawing.Rectangle]::FromLTRB(0, ($icon.Height - $srcH), $icon.Width, $icon.Height)
        $dstRect = [System.Drawing.Rectangle]::FromLTRB(0, 0, $isize, $refH)
        $gr.DrawImage($icon, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        $gr.Dispose()
        $cm = New-Object System.Drawing.Imaging.ColorMatrix
        $cm.Matrix33 = $refAlpha
        $ia = New-Object System.Drawing.Imaging.ImageAttributes
        $ia.SetColorMatrix($cm)
        $g.DrawImage($refBmp, (New-Object System.Drawing.Rectangle($ix, $refY, $isize, $refH)), 0, 0, $isize, $refH, [System.Drawing.GraphicsUnit]::Pixel, $ia)
        $refBmp.Dispose()
        $ia.Dispose()
    }

    $g.Dispose()
    $splash.Dispose()
    $icon.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Salvato $outPath"
}

$iconMaster = Join-Path $root '_remote-icon-master.png'
if (-not (Test-Path $iconMaster)) {
    $iconSrc = Join-Path $root 'sh-icon-512.png'
    Build-RemoteIconMaster $iconSrc $iconMaster
    Save-ResizedFrom $iconMaster 512 (Join-Path $root 'sh-remote-icon-512.png')
    Save-ResizedFrom $iconMaster 192 (Join-Path $root 'sh-remote-icon-192.png')
    Save-ResizedFrom $iconMaster 180 (Join-Path $root 'sh-remote-touch.png')
    Save-ResizedFrom $iconMaster 32  (Join-Path $root 'sh-remote-favicon.png')
}

Overlay-RemoteIconOnSplash `
    (Join-Path $root 'splash-mobile.png') `
    $iconMaster `
    (Join-Path $root 'splash-remote-mobile.png') `
    100 268 372 656 128 0.42

Overlay-RemoteIconOnSplash `
    (Join-Path $root 'splash-pc.png') `
    $iconMaster `
    (Join-Path $root 'splash-remote-pc.png') `
    42 62 448 574 128 0.38

Remove-Item $iconMaster -Force -ErrorAction SilentlyContinue
Write-Host 'Branding Service Remote completato.'
