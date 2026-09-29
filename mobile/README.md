# KOA Browser Mobile (Android, nativo)

Browser Android in Kotlin con WebView, stesso stile legno + vermiglio del KOA desktop.
Package `com.koabrowser.app` (stesso ID del desktop).

## Funzioni

| Desktop | Mobile |
|---|---|
| Schede + split | Schede (max 20, drawer) |
| Chat KOA (/calc /cerca /riassumi) | Chat KOA nativa, stessi comandi |
| ZEN Moon (moon.html) | Bundled in `assets/`, WebView con WebGPU dove disponibile |
| Download manager | DownloadManager di sistema + elenco |
| KOA Vault (PIN + AES) | PIN + Android Keystore, riempimento nella scheda |
| Supervisor anti-tracker | Blocklist host in `assets/blocklist.txt` + contatore |
| Browser predefinito | Intent BROWSABLE + richiesta ruolo (Android 10+) |
| ZENdate (exe) | Controllo release con tag `-mobile` + installazione APK |
| Start page | Bundled in `assets/` |
| Split 2/3/4, Turbo GPU, uninstall totale | Non portati (vedi limiti) |

## Compilare

1. Apri **Android Studio** → Open → cartella `mobile/`.
2. Attendi il sync Gradle (serve internet la prima volta).
3. Run su telefono (debug USB) o Build → APK.

Requisiti: Android Studio recente, `minSdk 26`, `targetSdk 34`.

## Pubblicare un aggiornamento mobile

1. Compila l'APK release e caricalo come allegato di una **release GitHub con tag che finisce in `-mobile`** (es. `v1.0.0-mobile`).
2. L'app lo trova da sola in Impostazioni → Controlla aggiornamenti.

## Limiti onesti

- Scritto senza SDK sottomano: compila in Android Studio, ma **non è stato provato su telefono**.
- Niente split-screen, niente Turbo, niente auto-update exe (non esistono su Android).
- Moon locale dipende dalla WebView del telefono (WebGPU solo su dispositivi recenti).
