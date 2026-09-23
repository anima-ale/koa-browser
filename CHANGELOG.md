# Changelog KOA Browser

Scrivi qui la storia delle versioni: per ogni release usa
`Aggiunto / Cambiato / Corretto`. Il testo del singolo update
mostrato nell'app (Impostazioni → note) va nel parametro `-Notes`
di `zendate\make-zendate.ps1`, più il testo della Release GitHub.

## [Non rilasciato]

### Aggiunto
-
### Cambiato
-
### Corretto
-

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
