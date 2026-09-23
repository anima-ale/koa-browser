# Confronta l'icona associata agli exe con assets/icon-32.png
param([string]$Dir = 'dist')
Add-Type -AssemblyName System.Drawing
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $base
$portable = Get-ChildItem (Join-Path $Dir 'KOA Browser *.exe') -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike '*Setup*' } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$setup = Get-ChildItem (Join-Path $Dir 'KOA Browser Setup *.exe') -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
$files = @()
if ($portable) { $files += $portable.FullName }
if ($setup) { $files += $setup.FullName }
$files += (Join-Path $root (Join-Path $Dir 'win-unpacked\KOA Browser.exe'))
$ref = (Get-FileHash (Join-Path $root 'assets\icon-32.png') -Algorithm MD5).Hash
foreach ($f in $files) {
  if (-not (Test-Path $f)) { Write-Output "$f => FILE MANCANTE"; continue }
  $ico = [Drawing.Icon]::ExtractAssociatedIcon($f)
  $bmp = $ico.ToBitmap()
  $tmp = Join-Path $env:TEMP 'koa_cmp.png'
  $bmp.Save($tmp, [Drawing.Imaging.ImageFormat]::Png)
  $h = (Get-FileHash $tmp -Algorithm MD5).Hash
  if ($h -eq $ref) { Write-Output "$f => ICONA KOA OK" }
  else { Write-Output "$f => icona DIVERSA dal logo" }
}
