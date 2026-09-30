# Backend ecosistema ZEN (copia di riferimento)

Copia fedele del backend account/sync di ZEN al 2026-09-30, più una patch KOA.

## Contenuto

- `functions/` — Netlify Functions deployate su `zenaix.netlify.app`
  (`/.netlify/functions/*`, con redirect pubblico `/api/*`)
- `src/` — libreria condivisa (`_db`, `_session`, `_sync-data`, `_zchat`, …)
- `netlify.toml`, `package.json` — configurazione e dipendenze deploy

## Patch KOA (già applicata in questa copia)

Campo `koaMemory` aggiunto all'allowlist di sync in:
- `functions/sync-data.js` (quello deployato)
- `src/_sync-data.js` (mirror)

Senza questa riga il server ignora la memoria di KOA Browser.

## Attivare la sync KOA

1. Copia questa cartella nel repo deployato su Netlify (sostituendo i file).
2. Redeploy. Nessuna migrazione: i campi esistenti restano intatti.
3. KOA rileva il supporto da solo (prova `koaMemory`, se ignorato resta in locale).

## Sicurezza

- Password mai in chiaro (bcrypt) e mai restituite (omesse dalle GET).
- Token HMAC-SHA256 con scadenza 30 giorni.
- La cassaforte password di KOA viaggia solo cifrata (AES-GCM); il PIN non esce mai dal PC.
