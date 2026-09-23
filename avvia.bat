@echo off
setlocal

echo ============================================
echo   Avvio di "KOA Browser" (Electron)
echo ============================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] Node.js non risulta installato.
    echo Scaricalo da https://nodejs.org e riprova.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Prima esecuzione: installo le dipendenze, potrebbe volerci qualche minuto...
    call npm install
    if errorlevel 1 (
        echo [ERRORE] Installazione delle dipendenze fallita.
        pause
        exit /b 1
    )
)

echo Avvio dell'applicazione...
call npm start

pause
