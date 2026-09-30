# Changelog KOA Browser

Scrivi qui la storia delle versioni: per ogni release usa
`Aggiunto / Cambiato / Corretto`. Il testo del singolo update
mostrato nell'app (Impostazioni → note) va nel parametro `-Notes`
di `zendate\make-zendate.ps1`, più il testo della Release GitHub.

## [1.0.22] - 2026-09-30

### Aggiunto
- ZEN Account: login con le credenziali del sito, memoria (preferiti, cronologia, impostazioni, cassaforte cifrata) sempre sul cloud con merge per sezione
- Backend ecosistema in data/zen-backend (functions + src + netlify.toml) con campo koaMemory: da redeployare per attivare la sync

### Cambiato
- ZENdate: a ogni update pulizia resti .bak/.bat vecchi all'avvio; la memoria resta perché userData è per-percorso, e il rilancio parte sempre dal nuovo exe

## [1.0.20] - 2026-09-30

### Corretto
- Schede grigie alla riapertura: blindate le letture guest non pronto (era quello a rompere createTab), reload con backoff fino a 5 volte, badge rosso oltre, rianimazione se il guest risulta crashato
- Niente GPU: fallback software SwiftShader + ripiego cloud per piano e sintesi (niente più errore secco), niente download inutili
- Crash ripetuti: avviso in sidebar che suggerisce di provare Turbo spento
- Agente: attende il testo vero delle pagine idratate (Bing) + rilettura, con conteggio caratteri in caso di blocco

### Aggiunto
- Split veloce: pannelli non a fuoco a 30fps + animazioni congelate (si riaccendono al fuoco)
- Agente instancabile: fino a 300 schede in sequenza secondo bisogno, fino a 5 giri di tocco per pagina, chiude le lette tenendo l'ultima (RAM sotto controllo, tetto 300 schede totali)
- Occhi e mani vere: screenshot, coordinate dal modello vision e clic nativi; voce neurale italiana locale (Piper) che legge la soluzione con tasto Ascolta

### Corretto
- Sottospecie: ID modello normalizzati, niente gruppi da 1, potatura gruppi fantasma, niente IPC a raffica

## [1.0.17] - 2026-09-29

### Aggiunto
- KOA omni-agentic assistant: micromodelli locali (pianificatore, italiano, azioni, occhi) con finestra Modelli che scarica, verifica e installa i pesi sul PC
- Agente autonomo: scompone il comando, apre fino a 40 schede, legge le pagine con alone rosso pulsante sul bordo e risponde con sintesi
- Occhi e tocco vero: modello vision locale che vede lo screenshot, localizza gli elementi e li preme con clic nativi (screenshot + coordinate + sendInputEvent)
- Setup con scelta micromodelli: pagina custom NSIS che scrive la preferenza; al primo comando KOA li scarica da solo, altrimenti chiede con box Scarica/Più tardi
- Sottospecie: tasto Raggruppa con animazione aura, classificazione automatica e chip filtro per topic

### Rimosso
- moon.html e ponte ZEN MOON (sostituiti dal sistema Autonomia)

### Corretto
- Download micromodelli con 3 tentativi automatici su reti instabili (niente più loop 0-100)
- Verifica pesi: cerca tensor-cache.json (formato attuale) oltre al vecchio ndarray

## [Non rilasciato]

### Aggiunto
-
### Cambiato
-
### Corretto
-

## [1.0.16] - 2026-09-28

### Aggiunto
- moon.html mostra solo i modelli davvero installati (config + pesi verificati in cache, registro usi riusciti, pesi visti in ZEN); gli altri via tasto Altri

### Aggiunto
- Nuovo logo K dappertutto: PNG master + set icone 16–256, icon.ico ricostruita, start page, header e Impostazioni
- Ponte ZEN MOON: aprendo ZEN in KOA, la sidebar elenca i modelli locali selezionati; il clic apre moon.html (stile ZEN) con motore locale proprio WebGPU/WASM/cloud
- Bridge MOON autoriparante: modelli rilevati anche dai pesi in cache (download col default) e ricontrollo ogni 15s senza ricaricare
- moon.html incluso in packaging exe, update istantaneo e publish (nessuna modifica al progetto ZEN)
- Tendina download in vetro liquido vero (liquidGL v3 MIT, vendored): rifrazione GPU, aberrazione cromatica e specular; senza content-capture così i bottoni restano vivi; tinta rimossa (anneriva su sfondi scuri), motore WebGL2 stabile

### Corretto
- Doppio clic e niente finestra: secondo avvio, tray e link esterni ora ripristinano, portano in primo piano e ricreano la finestra se manca
- Turbo GPU più prudente: rimosso `enable-zero-copy` (rischio schermo nero); `--safe` usa sempre software; `--disable-turbo-gpu` per un avvio di salvataggio

## [1.0.14] - 2026-09-24

### Aggiunto
- Riavvio chiesto all'utente: dopo il download scegli "Riavvia ora" o "Tra 5 minuti" (mai più chiusure a sorpresa)
- ZEN Turbo nella sidebar: app leggera (niente animazioni/blur/ombre), pagine snelle e GPU piena dal riavvio

### Cambiato
- Download con percorso allungato: fino a 60 minuti e riprova se fermo oltre 10 minuti
- Barra indirizzi senza riflesso animato: tinta unita, resta solo il bordo acceso in caricamento

### Corretto
- Riapertura garantita sul nuovo exe: controllo taglia attesa nello swap + marcatore versione al boot (se riparte il vecchio, lo dice invece di fingere l'update)

## [1.0.13] - 2026-09-24

### Corretto
- Canali beta/alpha mai pubblicati: il 404 ora mostra "Canale vuoto" invece di "Errore ZENdate: canale HTTP 404"
- Cambio canale: pulisce conferma in sospeso, note e versione saltata prima di ricontrollare
- Ultima verifica salvata: lo stato canale-vuoto si rilegge in chiaro

## [1.0.12] - 2026-09-24

### Corretto
- Update loop infinito sul portable: l'updater sostituiva la copia in Temp invece dell'exe vero (ora usa PORTABLE_EXECUTABLE_FILE); stesso fix per la disinstallazione

### Aggiunto
- Tinta adattiva: la barra prende il colore del sito (theme-color) su indicatore, URL e divider
- Dettagli hanko: sigilli quadrati, kanji 木 nel brand, texture washi, timbro sulla scheda attiva
- Update con conferma: chiede prima di scaricare, pronto-subito alla fine, rifiuto senza conseguenze
- Canali stabile/beta/alpha con cartelle manifest separate e selettore nelle Impostazioni
- Disinstallazione completa da Impostazioni (exe, profilo, password, chiavi registry)
- Browser predefinito che funziona: polling di conferma dopo la scelta in Impostazioni Windows

## [1.0.10] - 2026-09-24

### Aggiunto
- Download in tendina di vetro dal soffitto (apre da sola, risale a fine, pallino sul bottone, storico completo con apri-cartella ed elimina-file-vero)
- Divider split con Pointer Capture: trascinamento fluido sopra i siti e rilascio sempre bloccato
- Vie di fuga anti-freeze: flag `--new-instance`, voce Riavvia nel tray
- Preferiti ripristinati: stella + bollicine come prima

### Cambiato
- Riflesso vetro più marcato sulla barra sopra, toolbar sempre cliccabile, UI KOA garantita in primo piano

### Corretto
- Toolbar che trascinava la finestra ovunque: rimossa la frameless, tornata la barra nativa di Windows

## [1.0.9] - 2026-09-23

### Corretto
- Updater corazzato: backup pre-swap, verifica taglia, ripristino automatico, log diagnostico, conferma versione reale (mai più loop né falsi "aggiornato")
- Chiamate webview blindate contro guest non pronti (niente più eccezioni su schede appena create)
- Heartbeat su file ogni 10s per distinguere main vivo da main morto nei freeze

### Aggiunto
- Modalità provvisoria `--safe` (solo finestra, niente extra) + log di boot per diagnosi freeze
- Niente più scritture registry automatiche: solo dal pulsante, meno allarmi antivirus

## [1.0.8] - 2026-09-23

### Aggiunto
- Cronologia navigazione con ricerca e pulizia (sidebar, ultime 200 voci)
- Preferiti: stella nella toolbar, bollicine favicon in barra sottile, rimozione al volo
- Riflesso vetro sulla barra sopra (luce radente sul cromo)
- Browser predefinito VERO: registrazione StartMenuInternet + Capabilities + protocolli + tipi file, apertura link/file in KOA
- Download manager stile Chrome: shelf con progressi, velocità, ETA, apri/mostra cartella, turbo multi-connessione 8x
- KOA Vault: gestore password cifrato (AES-256-GCM) con PIN, cattura automatica dai login, autofill, in attesa solo con PIN

### Corretto
- Menu contestuale: chiusura automatica al clic fuori (catcher sopra i webview)

### Rimosso
- Estensioni Chrome (motore rimosso: fonte di instabilità)

## [1.0.7] - 2026-09-23

### Aggiunto
- ZENdate istantaneo: update solo-interfaccia senza riavvio né cambio percorsi (bundle verificato in userData, reload diretto, fallback automatico, versione UI indipendente)
- Menu tasto destro stile KOA: Indietro, Avanti, Ricarica, apri link e immagini in nuove schede, copia indirizzi, Chiedi a ZEN su testo selezionato, taglia/copia/incolla, stampa, trova nella pagina, ispeziona
- Trova nella pagina (Ctrl+F) con contatore risultati, Invio/Maiusc+Invio, Esc
- Riapertura schede chiuse con Ctrl+Shift+T (ultime 25)
- Finestra senza bordi di Windows: Riduci, Massimizza/Ripristina e Chiudi integrati nella barra schede
- Start page KOA locale e offline (logo, ricerca Google, scorciatoie)
- Scorciatoie stile Chrome: Ctrl+Tab/Maiusc+Tab giro schede, Ctrl+1-9 salto diretto, Ctrl+P stampa, Ctrl+/-/0 zoom, Alt+←/→ avanti/indietro, Ctrl+Alt+←/→ fuoco tra pannelli split, F11 fullscreen, F12 DevTools, Esc chiude menu/trova/impostazioni

### Cambiato
- Avvio velocissimo: finestra mostrata solo a paint pronto, font con display=swap, Supervisor differito di 3s
- Trascinamento finestra dall'header (schede, URL e bottoni restano cliccabili)
- Deploy update istantanei: `pubblica-update.bat` accetta la versione UI, manifest con hash per file

### Corretto
- Blindatura navigazioni webview: solo http(s), mai view-source/file/data; popup in nuove schede
- Controllo versione semver nel .bat prima della build (niente più build buttate dopo minuti d'attesa)

## [1.0.4] - 2026-09-23

### Cambiato
- Pannello ZENdate ridisegnato: stepper Controllo/Download/Verifica/Installazione, progress liquido animato, gerarchia testi premium

## [1.0.3] - 2026-09-23

### Corretto
- ZENdate non resta più appeso su "Controllo aggiornamenti": watchdog 90s nel main, pulsante disabilitato durante il check, messaggio di fallback dopo 45s
- Fix critico: manca import `ipcRenderer` in preload (versione e check muti), più scorciatoia Ctrl+Shift+I per i DevTools

## [1.0.2] - 2026-09-23

### Cambiato
- Impostazioni ZENdate più grande e leggibile, versione gigante mai troncata

## [1.0.1] - 2026-09-23

### Aggiunto
- ZENdate MAX: aggiornamenti automatici del portable + Impostazioni con versione e CONTROLLA ZENDATE
- Icona nel tray, chiusura in background, istanza singola
- ZEN Supervisor: anti-tracker + anti-pubblicità con contatore live
- Pulsante Chat ZEN nell'header, setup con grafica KOA dedicata

## [1.0.0] - 2026-09-23

### Aggiunto
- Schede trascinabili con split rettangolari a 2, 3 e 4 pannelli
- Chat KOA con AI (Pollinations), comandi /calc /cerca /riassumi /aiuto
- ZEN Supervisor: anti-tracker + anti-pubblicità con contatore live
- Barra URL a tubo di fluido, scrollbar liquida nei siti
- ZENdate MAX: aggiornamenti automatici + Impostazioni + tray
- Packaging portable/setup con icona e metadati KOA
