@echo off
setlocal

echo ============================================
echo   Ricreo l'exe di "KOA Browser"
echo ============================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] Node.js non risulta installato.
    echo Scaricalo da https://nodejs.org e riprova.
    pause
    exit /b 1
)

for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VER=%%V
powershell -NoProfile -Command "if ('%VER%' -notmatch '^\d+\.\d+\.\d+$') { exit 1 }" >nul 2>&1
if not errorlevel 1 goto ver_ok
echo [ERRORE] Versione "%VER%" non valida per l'exe: usa X.Y.Z, es. 1.0.5.
pause
exit /b 1
:ver_ok
echo Versione: %VER%

if not exist "node_modules" (
    echo Installo le dipendenze, potrebbe volerci qualche minuto...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [ERRORE] Installazione delle dipendenze fallita.
        pause
        exit /b 1
    )
)

if not exist "dist" goto skip_rm
echo Rimuovo la build precedente...
tasklist /FI "IMAGENAME eq KOA Browser.exe" 2>nul | find /I "KOA Browser.exe" >nul
if not errorlevel 1 (
    echo [ERRORE] KOA Browser e' in esecuzione: esci dal tray ^(icona nascosta^) prima di ricompilare,
    echo altrimenti i file restano bloccati e la build viene corrotta.
    pause
    exit /b 1
)
set TRIES=0
:retry_rm
rmdir /s /q "dist" 2>nul
if not exist "dist" goto rm_ok
set /a TRIES+=1
if %TRIES% GEQ 5 goto rm_fail
echo File ancora occupati ^(antivirus o processi in chiusura^), riprovo... (%TRIES%/5)
timeout /t 2 /nobreak >nul
goto retry_rm
:rm_fail
echo [ERRORE] Impossibile rimuovere la cartella dist.
echo Controlla antivirus e icone nascoste del tray, poi riprova.
pause
exit /b 1
:rm_ok
:skip_rm

echo Compilo l'exe, potrebbe volerci qualche minuto...
call npm run dist
if not errorlevel 1 goto build_ok
echo [AVVISO] Build fallita al primo colpo (spesso e' l'antivirus che blocca i file).
echo Attendo 20 secondi e riprovo una volta...
timeout /t 20 /nobreak >nul
call npm run dist
if errorlevel 1 (
    echo [ERRORE] Compilazione fallita due volte.
    echo Se fallisce su "Can't open output file": metti la cartella del progetto
    echo nelle esclusioni dell'antivirus e rilancia.
    pause
    exit /b 1
)
:build_ok

echo Applico icona e metadati KOA all'exe scompattato...
echo (portable e setup prendono l'icona da makensis in build: MAI usare rcedit su di loro, li corrompe)
for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VER=%%V
echo Versione dal package.json: %VER%
if not exist "tools\rcedit-x64.exe" (
    echo Scarico rcedit una tantum...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=(Invoke-RestMethod 'https://api.github.com/repos/electron/rcedit/releases/latest').assets | Where-Object { $_.name -eq 'rcedit-x64.exe' } | Select-Object -First 1; Invoke-WebRequest $r.browser_download_url -OutFile 'tools\rcedit-x64.exe'"
)
if exist "tools\rcedit-x64.exe" (
    if exist "dist\win-unpacked\KOA Browser.exe" (
        tools\rcedit-x64.exe "dist\win-unpacked\KOA Browser.exe" --set-icon "assets\icon.ico" --set-version-string "CompanyName" "KOA" --set-version-string "FileDescription" "KOA Browser" --set-version-string "ProductName" "KOA Browser" --set-version-string "OriginalFilename" "KOA Browser.exe" --set-version-string "InternalName" "KOA Browser" --set-version-string "LegalCopyright" "Copyright (C) 2026 KOA" --set-file-version "%VER%" --set-product-version "%VER%"
    )
) else (
    echo [AVVISO] rcedit non disponibile: exe scompattato con icona standard.
)

echo.
echo ============================================
echo   Fatto! Ecco gli exe nella cartella dist:
dir /b "dist\*.exe"
echo ============================================
pause
