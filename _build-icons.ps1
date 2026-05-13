Add-Type -AssemblyName System.Drawing

$src = "$PSScriptRoot\icon-source.png"
$srcImg = [System.Drawing.Image]::FromFile($src)

$w = $srcImg.Width
$h = $srcImg.Height
$side = [Math]::Min($w, $h)
$x = [int](($w - $side) / 2)
$y = [int](($h - $side) / 2)

Write-Host "Source: ${w}x${h}, center-cropping to ${side}x${side} at offset ${x},${y}"

$cropRect = [System.Drawing.Rectangle]::new($x, $y, $side, $side)
$cropped = New-Object System.Drawing.Bitmap $side, $side
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.DrawImage($srcImg, [System.Drawing.Rectangle]::new(0,0,$side,$side), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

function Save-Resized($bmp, $size, $out) {
    $r = New-Object System.Drawing.Bitmap $size, $size
    $gr = [System.Drawing.Graphics]::FromImage($r)
    $gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gr.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $gr.DrawImage($bmp, 0, 0, $size, $size)
    $gr.Dispose()
    $r.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $r.Dispose()
    Write-Host "Saved $out (${size}x${size})"
}

Save-Resized $cropped 192 "$PSScriptRoot\icon-192.png"
Save-Resized $cropped 512 "$PSScriptRoot\icon-512.png"
Save-Resized $cropped 180 "$PSScriptRoot\apple-touch-icon.png"
Save-Resized $cropped 32  "$PSScriptRoot\favicon-32.png"

$cropped.Dispose()
$srcImg.Dispose()
Write-Host "Done."
