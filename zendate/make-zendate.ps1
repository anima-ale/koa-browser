# ZENdate — genera il manifest per spedire un aggiornamento.
# Uso:
#   powershell -ExecutionPolicy Bypass -File zendate\make-zendate.ps1 -Tag v1.0.7 -Notes "Cosa cambia"
#   powershell -ExecutionPolicy Bypass -File zendate\make-zendate.ps1 -Tag v1.0.7 -UiVersion 1.0.7.1   (anche update interfaccia istantaneo)
param(
  [string]$Url = "",
  [string]$User = "anima-ale",
  [string]$Repo = "koa-browser",
  [string]$Tag = "",
  [string]$Version = "",
  [string]$Notes = "",
  [string]$UiVersion = "",
  [string]$Channel = "stable",
  [string]$Out = ""
)

$kitDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $kitDir
if ($Channel -notin @('stable', 'beta', 'alpha')) { $Channel = 'stable' }
if ([string]::IsNullOrWhiteSpace($Out)) { $Out = Join-Path (Join-Path $kitDir $Channel) 'zendate.json' }
$chanDir = Split-Path -Parent $Out
if (-not (Test-Path $chanDir)) { New-Item -ItemType Directory -Force $chanDir | Out-Null }

# 1. Versione da package.json (l'exe la legge da lì: bumpala PRIMA della build)
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$pkgVersion = $pkg.version
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = $pkgVersion }

# 2. Trova il portable più recente in dist (niente Setup)
$exe = Get-ChildItem (Join-Path $root 'dist') -Filter 'KOA Browser *.exe' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike '*Setup*' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $exe) {
  Write-Output '[ERRORE] Nessun portable in dist\. Lancia prima ricrea-exe.bat'
  exit 1
}
$m = [regex]::Match($exe.Name, '(\d+(?:\.\d+)+)')
if ($m.Success -and $m.Groups[1].Value -ne $Version) {
  Write-Output ("[AVVISO] L'exe dice v{0} ma usi v{1}: controlla il version bump in package.json" -f $m.Groups[1].Value, $Version)
}

# 2b. Note di release: da CHANGELOG.md se -Notes è vuoto + file per gh release
if ([string]::IsNullOrWhiteSpace($Notes)) {
  $clPath = Join-Path $root 'CHANGELOG.md'
  if (Test-Path $clPath) {
    $buf = @()
    $cap = $false
    foreach ($ln in (Get-Content $clPath -Encoding UTF8)) {
      if ($ln -match '^\s*##\s*\[?([0-9][0-9A-Za-z\.\-]*)\]?\s*(-.*)?$') {
        if ($cap) { break }
        if ($Matches[1] -eq $Version) { $cap = $true }
        continue
      }
      if ($cap) { $buf += $ln }
    }
    $Notes = ($buf -join "`n").Trim("`n", ' ', "`r")
  }
}
$notesFile = Join-Path (Join-Path $kitDir $Channel) ('release-notes-' + $Version + '.txt')
[IO.File]::WriteAllText($notesFile, $Notes, (New-Object Text.UTF8Encoding $false))

# 3. URL pubblico dell'exe
$FinalUrl = $Url
if ([string]::IsNullOrWhiteSpace($FinalUrl)) {
  if ([string]::IsNullOrWhiteSpace($User) -or [string]::IsNullOrWhiteSpace($Repo) -or [string]::IsNullOrWhiteSpace($Tag)) {
    Write-Output '[ERRORE] Servi -Url, oppure -User + -Repo + -Tag (es. -Tag v1.0.1)'
    exit 1
  }
  # GitHub rinomina gli spazi in punti negli allegati: l'URL deve usare i punti.
  $FinalUrl = 'https://github.com/' + $User + '/' + $Repo + '/releases/download/' + $Tag + '/' + ($exe.Name -replace '\s', '.')
}

# 4. SHA256 dell'exe
$hash = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()

# 4b. Blocco UI istantanea: 4 file interfaccia con hash (niente restart per applicarli)
$uiBlock = $null
if (-not [string]::IsNullOrWhiteSpace($UiVersion)) {
  $uiMap = [ordered]@{
    'index.html' = 'index.html'
    'preload.js' = 'preload.js'
    'vault-preload.js' = 'vault-preload.js'
    'logo.svg'   = 'assets/logo.svg'
    'start.html' = 'start.html'
  }
  $uiBase = 'https://github.com/' + $User + '/' + $Repo + '/releases/download/' + $Tag + '/'
  $uiFiles = [ordered]@{}
  foreach ($flat in $uiMap.Keys) {
    $src = Join-Path $root $uiMap[$flat]
    if (-not (Test-Path $src)) {
      Write-Output ("[ERRORE] File UI mancante: {0}" -f $uiMap[$flat])
      exit 1
    }
    $uiFiles[$flat] = (Get-FileHash $src -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  $uiBlock = [ordered]@{
    version = $UiVersion
    minExe  = $Version
    base    = $uiBase
    files   = $uiFiles
  }
}

# 5. Scrivi il manifest (UTF-8 senza BOM via .NET: PS 5.1 non ha utf8NoBOM)
$manifest = [ordered]@{
  version = $Version
  notes   = $Notes
  url     = $FinalUrl
  sha256  = $hash
}
if ($uiBlock) { $manifest['ui'] = $uiBlock }
[IO.File]::WriteAllText($Out, ($manifest | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

Write-Output ''
Write-Output 'zendate.json pronto:'
Write-Output ("  versione : {0}" -f $Version)
Write-Output ("  exe      : {0} ({1} MB)" -f $exe.Name, [math]::Round($exe.Length / 1MB, 1))
Write-Output ("  sha256   : {0}" -f $hash)
Write-Output ("  url      : {0}" -f $FinalUrl)
if ($uiBlock) { Write-Output ("  ui       : v{0} (istantanea, senza riavvio)" -f $UiVersion) }
Write-Output ("  file     : {0}" -f $Out)
Write-Output ''
Write-Output 'Prossimi passi: allega l''exe alla Release GitHub e pubblica questo file dove punta ZENDATE_URL.'
