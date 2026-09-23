# Confronta l'icona associata agli exe con assets/icon-32.png
param([string]$Dir = 'dist')
Add-Type -AssemblyName System.Drawing
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $base
$files = @(
  (Join-Path $Dir 'KOA Browser 1.0.0.exe'),
  (Join-Path $Dir 'KOA Browser Setup 1.0.0.exe'),
  (Join-Path $Dir 'win-unpacked\KOA Browser.exe')
)
$ref = (Get-FileHash (Join-Path $root 'assets\icon-32.png') -Algorithm MD5).Hash
foreach ($f in $files) {
  $full = Join-Path $root $f
  if (-not (Test-Path $full)) { Write-Output "$f => FILE MANCANTE"; continue }
  $ico = [Drawing.Icon]::ExtractAssociatedIcon($full)
  $bmp = $ico.ToBitmap()
  $tmp = Join-Path $env:TEMP 'koa_cmp.png'
  $bmp.Save($tmp, [Drawing.Imaging.ImageFormat]::Png)
  $h = (Get-FileHash $tmp -Algorithm MD5).Hash
  if ($h -eq $ref) { Write-Output "$f => ICONA KOA OK" }
  else { Write-Output "$f => icona DIVERSA dal logo" }
}
