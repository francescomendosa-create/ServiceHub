# ServiceHub — stato sync (riferimento fisso)

## Build da usare adesso

- **BUILD in app:** `2026.06.04-restore-0d8932c`
- **Git base ripristinata:** commit `0d8932c` (messaggio: fix realtime sync v2)
- **BUILD originale di quel commit:** `2026.06.03-fix-realtime-sync-v2`

Verifica sul telefono/PC (console del browser):

```js
window.SERVICEHUB_BUILD
```

Deve essere esattamente `2026.06.04-restore-0d8932c`. Se vedi altro, stai usando una versione vecchia in cache.

## Commit storici (quando “funzionava”)

| Commit   | BUILD tag |
|----------|-----------|
| `30e6136` | `2026.06.03-fix-realtime-sync` |
| `0d8932c` | `2026.06.03-fix-realtime-sync-v2` ← **base attuale** |

Differenza importante: in `0d8932c` il backup locale **non** alza `syncRevision` a ogni tasto (`bumpRevision: false`), solo il salvataggio cloud (`bumpRevision: true`). Così PC e telefono non si “scontrano” con revisioni locali falsamente più alte.

## Cosa NON è in questa versione (voluto)

- Nessuna barra diagnostica Tu/Cloud
- Nessun `enableNetwork` (aveva rotto tutti i `setDoc`)
- Nessun layer sync sperimentale aggiunto dopo giugno

## Fix minimo aggiunto sopra `0d8932c`

- `__shouldSkipInputForPlantPayload`: in Notturno non salvare i campi TK duplicati della sezione ACQUA nascosta invece di Stoccaggio interno
- `saveData`: `flushPlantBackupNow()` all’inizio (come `30e6136`)

## Dopo il deploy — obbligatorio

1. Apri https://francescomendosa-create.github.io/ServiceHub/
2. **Ctrl+F5** (o cancella dati sito / reinstalla PWA)
3. Controlla `window.SERVICEHUB_BUILD`
4. Test: PC modifica un campo Generale → entro ~5 s uguale sul telefono; stesso test su Notturno → Stoccaggio (es. TK 10604)

## Firebase

- Progetto: `servicehub-18309`
- Regole: `firestore.rules` nel repo, scrittura con `request.auth != null`
- Anonymous Auth attivo in Console
