@echo off
setlocal

echo ============================================
echo   Pubblico aggiornamento KOA (Release + ZENdate)
echo ============================================
cd /d "%~dp0"
set GH_REPO=anima-ale/koa-browser
set NOPUSH=0

where gh >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] GitHub CLI ^(gh^) non trovato.
    echo Installalo da https://cli.github.com poi esegui: gh auth login
    pause
    exit /b 1
)
gh auth status >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] gh non autenticato. Esegui: gh auth login
    pause
    exit /b 1
)

for /f "delims=" %%V in ('powershell -NoProfile -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VER=%%V
echo Versione package.json: %VER%
set EXE=dist\KOA Browser %VER%.exe
if not exist "%EXE%" (
    echo [ERRORE] Non trovo "%EXE%".
    echo Aggiorna la versione in package.json e lancia prima ricrea-exe.bat.
    pause
    exit /b 1
)

set TAG=v%VER%
echo Genero manifest + note da CHANGELOG...
powershell -NoProfile -ExecutionPolicy Bypass -File zendate\make-zendate.ps1 -Tag %TAG%
if errorlevel 1 (
    echo [ERRORE] Generazione manifest fallita.
    pause
    exit /b 1
)

where git >nul 2>nul
if errorlevel 1 goto no_git_init
if not exist ".git" (
    echo Inizializzo repo git locale...
    git init -b main >nul 2>&1
    git remote add origin https://github.com/%GH_REPO%.git 2>nul
)
git remote get-url origin >nul 2>&1
if errorlevel 1 goto no_git_init
git config user.name >nul 2>&1
if errorlevel 1 git config user.name "KOA Publisher" >nul 2>&1
git config user.email >nul 2>&1
if errorlevel 1 git config user.email "zendate@localhost" >nul 2>&1
echo Pusho il codice sul repo ^(serve almeno un commit per creare release^)...
git add -A 2>nul
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
    git commit -m "KOA Browser v%VER%" >nul 2>&1
    if errorlevel 1 (
        echo [ERRORE] Commit fallito. Esegui una volta: git config --global user.name "Tu" e user.email "tu@mail"
        pause
        exit /b 1
    )
)
git push -u origin main >nul 2>&1
if errorlevel 1 (
    echo Il repo remoto non esiste: lo creo su GitHub...
    gh repo create %GH_REPO% --public --confirm >nul 2>&1
    git push -u origin main >nul 2>&1
)
if errorlevel 1 git push >nul 2>&1
git ls-remote origin refs/heads/main > "%TEMP%\koa-ls.txt" 2>&1
for %%A in ("%TEMP%\koa-ls.txt") do if %%~zA==0 goto no_git_init
del "%TEMP%\koa-ls.txt" 2>nul
echo Codice pushato.
goto git_done
:no_git_init
echo [AVVISO] Push codice saltato: crea il repo %GH_REPO% su GitHub e riprova.
echo La release si puo' creare comunque, ma il manifest va pushato a mano dopo.
set NOPUSH=1
:git_done

gh release view %TAG% --repo %GH_REPO% >nul 2>&1
if not errorlevel 1 (
    echo La release %TAG% esiste gia: aggiorno l'allegato...
    gh release upload %TAG% "%EXE%" --clobber --repo %GH_REPO%
    if errorlevel 1 (
        echo [ERRORE] Upload allegato fallito.
        pause
        exit /b 1
    )
) else (
    echo Creo la release %TAG%...
    gh release create %TAG% "%EXE%" --title "%TAG%" --notes-file "zendate\release-notes-%VER%.txt" --repo %GH_REPO%
    if errorlevel 1 (
        echo [ERRORE] Creazione release fallita.
        pause
        exit /b 1
    )
)

if "%NOPUSH%"=="1" (
    echo.
    echo [DA FARE A MANO] Pusha zendate/zendate.json nel repo, cosi' l'URL raw diventa raggiungibile.
)

echo.
echo ============================================
echo   Pubblicato! Gli exe con ZENdate si aggiorneranno da soli.
echo ============================================
pause
