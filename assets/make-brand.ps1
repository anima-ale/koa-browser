# KOA Browser — genera icona app + grafiche installer (legno + sole vermiglio).
# Uso: powershell -ExecutionPolicy Bypass -File assets\make-brand.ps1
# Rilancialo ogni volta che vuoi rigenerare tutto.

Add-Type -AssemblyName System.Drawing

$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$colWood1 = [Drawing.ColorTranslator]::FromHtml('#3E2A1A')
$colWood2 = [Drawing.ColorTranslator]::FromHtml('#241811')
$colGrain = [Drawing.ColorTranslator]::FromHtml('#5A3A22')
$colSun1 = [Drawing.ColorTranslator]::FromHtml('#E86A2C')
$colSun2 = [Drawing.ColorTranslator]::FromHtml('#C63F1B')
$colCream = [Drawing.ColorTranslator]::FromHtml('#F5EDE0')

function New-KoaBitmap([int]$w, [int]$h, [double]$sunScale, [int]$textSize, [int]$grainLines) {
  $bmp = New-Object Drawing.Bitmap -ArgumentList @($w, $h)
  $g = [Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  # fondo legno
  $p0 = New-Object Drawing.Point -ArgumentList @(0, 0)
  $p1 = New-Object Drawing.Point -ArgumentList @(0, $h)
  $bg = New-Object Drawing.Drawing2D.LinearGradientBrush -ArgumentList @($p0, $p1, $colWood1, $colWood2)
  $g.FillRectangle($bg, 0, 0, $w, $h)
  $bg.Dispose()
  # venature del legno
  $penW = [Math]::Max(1, [Math]::Floor($w / 220))
  $pen = New-Object Drawing.Pen -ArgumentList @($colGrain, [float]$penW)
  for ($i = 0; $i -lt $grainLines; $i++) {
    [float]$yy = [float]($h * ($i + 1) / ($grainLines + 1))
    $n = 61
    $pts = New-Object Drawing.PointF[] -ArgumentList @($n)
    for ($k = 0; $k -lt $n; $k++) {
      [float]$xx = [float]($w * $k / ($n - 1))
      [float]$yw = [float]($yy + [Math]::Sin($xx / $w * 6.28 + $i) * $h * 0.012)
      $pts[$k] = New-Object Drawing.PointF -ArgumentList @($xx, $yw)
    }
    $g.DrawLines($pen, $pts)
  }
  $pen.Dispose()
  # sole vermiglio
  [float]$r = [float]($w * $sunScale)
  [float]$cx = [float]($w / 2)
  [float]$cy = [float]($h * 0.38)
  $s0 = New-Object Drawing.PointF -ArgumentList @(([float]($cx - $r)), ([float]($cy - $r)))
  $s1 = New-Object Drawing.PointF -ArgumentList @(([float]($cx + $r)), ([float]($cy + $r)))
  $sun = New-Object Drawing.Drawing2D.LinearGradientBrush -ArgumentList @($s0, $s1, $colSun1, $colSun2)
  $g.FillEllipse($sun, ($cx - $r), ($cy - $r), ($r * 2), ($r * 2))
  $sun.Dispose()
  # scritta KOA centrata
  if ($textSize -gt 0) {
    $font = New-Object Drawing.Font -ArgumentList @('Arial', [float]$textSize, [Drawing.FontStyle]::Bold)
    $brush = New-Object Drawing.SolidBrush -ArgumentList @($colCream)
    $sz = $g.MeasureString('KOA', $font)
    [float]$tx = ($w - $sz.Width) / 2
    [float]$ty = [float]($h * 0.68)
    $g.DrawString('KOA', $font, $brush, $tx, $ty)
    $font.Dispose()
    $brush.Dispose()
  }
  $g.Dispose()
  return $bmp
}

$iconSizes = @(16, 24, 32, 48, 64, 128, 256)
foreach ($s in $iconSizes) {
  $ts = 0
  if ($s -ge 48) { $ts = [Math]::Floor($s * 0.13) }
  $gr = [Math]::Max(2, [Math]::Floor($s / 50))
  $img = New-KoaBitmap $s $s 0.19 $ts $gr
  $img.Save((Join-Path $outDir ('icon-' + $s + '.png')), [Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
}
Write-Output 'OK: icon-*.png pronti (da impacchettare in icon.ico con png-to-ico)'

$header = New-KoaBitmap 150 57 0.16 13 3
$header.Save((Join-Path $outDir 'installer-header.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
$header.Dispose()

$side = New-KoaBitmap 164 314 0.13 17 6
$side.Save((Join-Path $outDir 'installer-sidebar.bmp'), [Drawing.Imaging.ImageFormat]::Bmp)
$side.Dispose()

Write-Output 'OK: installer-header.bmp, installer-sidebar.bmp generati in assets\ (icon.ico: impacchettalo dai PNG con png-to-ico)'
