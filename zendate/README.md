# ZENdate — kit per spedire un aggiornamento

**Via veloce: lancia `pubblica-update.bat`** (controlla `gh`, crea la Release,
genera il manifest dalle note del CHANGELOG e pusha tutto da solo).
Per includere anche un update **istantaneo di interfaccia** (senza riavvio):
`pubblica-update.bat 1.0.7.1` (versione UI numerica a parte).
Sotto i dettagli manuali, se preferisci fare a mano.

## File

Questa cartella contiene tutto ciò che serve per pubblicare un update
che ogni exe KOA con ZENdate installerà da solo.

## File

- `make-zendate.ps1` — genera `zendate.json` (versione + SHA256 dell'exe)
- `zendate.json.example` — esempio del manifest da pubblicare
- `zendate.json` — (lo crei tu con lo script) il manifest vero da mettere online

## Flusso deploy (nell'ordine!)

1. **Version bump**: in `package.json` alza `"version"` (es. `1.0.0` → `1.0.1`).
   L'exe legge la sua versione da lì: se non la alzi, nessuno vedrà l'update.
2. **Ricompila**: lancia `ricrea-exe.bat` (pulisce `dist` e ricrea tutto).
3. **Pubblica l'exe**: crea una Release su GitHub, allega
   `dist\KOA Browser X.Y.Z.exe` (il **portable**, NON il Setup).
   L'URL sarà tipo:
   `https://github.com/anima-ale/koa-browser/releases/download/v1.0.1/KOA.Browser.1.0.1.exe`
   (nota: GitHub converte gli spazi in punti negli allegati)
4. **Genera il manifest**:
   ```powershell
   powershell -ExecutionPolicy Bypass -File zendate\make-zendate.ps1 -User anima-ale -Repo koa-browser -Tag v1.0.1 -Notes "Cosa cambia"
   ```
   oppure con URL diretto:
   ```powershell
   powershell -ExecutionPolicy Bypass -File zendate\make-zendate.ps1 -Url "https://..." -Notes "Cosa cambia"
   ```
5. **Pubblica `zendate/zendate.json`** dove punta `ZENDATE_URL` in `main.js`
   (es. file `zendate.json` nel branch main del repo → URL raw).
   Prima volta soltanto: imposta `ZENDATE_URL` in `main.js` e ricompila.
6. **Test**: apri il vecchio exe su un altro PC con rete → entro ~5 secondi
   deve trovare la v1.0.1, scaricarla e riavviarsi da solo.

## Regole d'oro

- Versione in `package.json` SEMPRE prima della build.
- SHA256 ricalcolato a ogni build (lo fa lo script, non scriverlo a mano).
- L'URL deve restare stabile nel tempo: usa le Release GitHub, non link temporanei.
- Spedisci il **portable** (`KOA Browser X.Y.Z.exe`), mai il Setup né il win-unpacked.
- `zendate.json` deve essere HTTPS raggiungibile senza login.
