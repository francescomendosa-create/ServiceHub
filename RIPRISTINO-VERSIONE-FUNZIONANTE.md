# Ripristino versione quando la sync funzionava

La chat può perdersi, ma il codice **resta in Git per sempre**.

## Versione che avevi quando “tutto funzionava”

| | |
|---|---|
| **Commit** | `30e6136` |
| **BUILD** | `2026.06.03-fix-realtime-sync` |
| **Miglioramento subito dopo** | `0d8932c` — BUILD `2026.06.03-fix-realtime-sync-v2` (revisione locale/cloud separata) |

## Comando per ripristinare ESATTAMENTE quella cartella

Da PowerShell, nella cartella del repo:

```powershell
cd "C:\Users\franc\Documents\GitHub\ServiceHub\ServiceHub"
git checkout 30e6136 -- index.html sw.js
git commit -m "Ripristino manuale da 30e6136 (sync funzionante)."
git push origin main
```

Poi su ogni tablet: **Ctrl+F5** o reinstalla PWA.

## Versione attuale consigliata (dopo i fix)

- **BUILD:** `2026.06.04-sync-baseline-v1`
- Salva in locale tutto il DOM (non sparisce al reload).
- Salva sul cloud **server + solo campi cambiati** rispetto all’ultimo stato ricevuto (sync tra tablet senza sovrascriversi a vicenda).

Verifica: `window.SERVICEHUB_BUILD` nella console del browser.

## Firebase (obbligatorio su tutti i dispositivi)

- Progetto: `servicehub-18309`
- **Anonymous Auth** attivo
- Regole `firestore.rules` pubblicate
- LED cloud **verde**
