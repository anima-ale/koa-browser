@echo off
setlocal enabledelayedexpansion
echo ============================================
echo   Pubblico KOA Browser Mobile (APK + Release)
echo ============================================
cd /d "%~dp0mobile"

where gh >nul 2>nul
if errorlevel 1 (
    echo [ERRORE] GitHub CLI ^(gh^) non trovato.
    pause
    exit /b 1
)

for /f "delims=" %%V in ('powershell -NoProfile -Command "([regex]::Match((Get-Content app\build.gradle -Raw), 'versionName\s+.([\d.]+).').Groups[1].Value)"') do set VER=%%V
echo Versione: %VER%
set TAG=v%VER%-mobile
set APK=app\build\outputs\apk\release\app-release.apk

if not exist "keystore.properties" (
    echo [ERRORE] Manca mobile\keystore.properties: APK non firmabile.
    pause
    exit /b 1
)

echo Compilo APK release firmato...
set JAVA_HOME=C:\Users\giova\AppData\Local\Temp\opencode\jdk17\jdk-17.0.11+9
set ANDROID_HOME=C:\Users\giova\AppData\Local\Android\Sdk
set ANDROID_SDK_ROOT=%ANDROID_HOME%
set GRADLE_USER_HOME=C:\Users\giova\AppData\Local\Temp\opencode\gradle-home
call C:\Users\giova\AppData\Local\Temp\opencode\gradle\gradle-8.7\bin\gradle.bat assembleRelease --console=plain
if errorlevel 1 (
    echo [ERRORE] Compilazione fallita.
    pause
    exit /b 1
)
if not exist "%APK%" (
    echo [ERRORE] APK non generato.
    pause
    exit /b 1
)

cd /d "%~dp0"
gh release view %TAG% --repo anima-ale/koa-browser >nul 2>&1
if not errorlevel 1 (
    echo La release %TAG% esiste gia: aggiorno l'allegato...
    gh release upload %TAG% "mobile\%APK:\=/%" --clobber --repo anima-ale/koa-browser
) else (
    echo Creo la release %TAG%...
    gh release create %TAG% "mobile\%APK:\=/%" --title "KOA Browser Mobile %TAG%" --notes "APK Android. L'app lo trova da sola in Impostazioni." --repo anima-ale/koa-browser
)
if errorlevel 1 (
    echo [ERRORE] Release fallita.
    pause
    exit /b 1
)

echo Genero manifest mobile e lo pusho ^(l'app lo legge senza limiti API^)...
powershell -NoProfile -Command "$v='%VER%'; $t='%TAG%'; $apk='mobile/app/build/outputs/apk/release/app-release.apk'; $h=(Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant(); $j='{ \"version\": \"'+$v+'\", \"tag\": \"'+$t+'\", \"url\": \"https://github.com/anima-ale/koa-browser/releases/download/'+$t+'/app-release.apk\", \"sha256\": \"'+$h+'\", \"notes\": \"KOA Browser Mobile '+$t+'\" }'; [IO.File]::WriteAllText('zendate/mobile/zendate.json', $j, (New-Object Text.UTF8Encoding $false)); Write-Output 'manifest ok'"
git add zendate/mobile/zendate.json 2>nul
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
    git commit -m "KOA Mobile %TAG% manifest" >nul 2>&1
    git push origin main >nul 2>&1
    echo Manifest pushato ^(visibile online entro pochi minuti^).
)

echo.
echo ============================================
echo   Pubblicato! I telefoni con KOA lo trovano da soli.
echo ============================================
pause
