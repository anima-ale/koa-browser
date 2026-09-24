# KOA Browser (Electron)

Un browser in stile giapponese — legno scuro e arancione vermiglio — con:
- schede multiple trascinabili con split a 2, 3 e 4 pannelli rettangolari
- barra degli indirizzi a "tubo di fluido" (con ricerca Google se non inserisci un URL)
- pulsanti avanti / indietro / ricarica
- sidebar con chat KOA (AI via Pollinations), azioni rapide e riassunti pagina
- ZEN Supervisor: vero anti-tracker + anti-pubblicità (EasyList + EasyPrivacy) con contatore live
- KOA Vault: password cifrate con PIN, cattura login, autofill (sidebar)
- scrollbar liquida iniettata in ogni sito
- scorciatoie: `Ctrl/Cmd+T` nuova scheda, `Ctrl/Cmd+W` chiudi scheda, `Ctrl/Cmd+L` focus sulla barra, `Ctrl/Cmd+R` ricarica, `Alt+←/→` fuoco tra pannelli

## Come avviarlo

Serve Node.js installato sul tuo computer.

```bash
npm install
npm start
```

## Creare l'.exe (Windows)

```bash
npm run dist
```

Trovi `KOA Browser 1.0.0.exe` (portable) e il setup in `dist/`.
Oppure lancia `ricrea-exe.bat`: pulisce la build precedente, ricompila
e applica icona + metadati KOA agli exe.

## ZENdate MAX — aggiornamenti automatici

Il portable si auto-aggiorna all'avvio e dal pannello Impostazioni
(versione in grande + tasto CONTROLLA ZENDATE).

1. Crea un repo GitHub, vai su Releases e pubblica `KOA Browser X.Y.Z.exe`.
2. Aggiungi nel repo il file `zendate.json`:
   `{"version":"1.0.1","notes":"...","url":"https://github.com/.../releases/download/...exe","sha256":"..."}`
3. Imposta `ZENDATE_URL` in cima a `main.js` sull'URL raw del file.
4. Ricompila: da lì ogni avvio controlla, scarica, verifica l'hash
   e installa da solo con riavvio.

## Struttura del progetto

- `main.js` — processo principale Electron: crea la finestra dell'app (senza menu File/Edit/View)
- `preload.js` — ponte sicuro tra il processo main e l'interfaccia
- `index.html` — l'interfaccia del browser: header, schede, sidebar e area di navigazione (`<webview>`)
- `assets/logo.svg` — logo KOA (sole vermiglio su legno)
- `package.json` — configurazione del progetto e packaging
