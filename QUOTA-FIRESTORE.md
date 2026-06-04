# Quota Firestore superata — perché la sync non funziona

Se in console compare:

```
FirebaseError: [code=resource-exhausted]: Quota exceeded.
```

**Firebase ha bloccato letture e scritture** sul progetto `servicehub-18309`. Nessuna modifica al codice può forzare la sync finché la quota non si resetta o non si passa a un piano a pagamento.

## Cosa fare (in ordine)

1. Apri [Firebase Console](https://console.firebase.google.com/) → progetto **servicehub-18309** → **Firestore** → **Usage**.
2. Controlla se il limite giornaliero (piano Spark gratuito) è esaurito.
3. Attendi il **reset giornaliero** (mezzanotte Pacific Time) oppure attiva il piano **Blaze** (pay-as-you-go) se serve subito.
4. Su tutti i tablet: **Ctrl+F5** dopo il reset, BUILD `2026.06.04-quota-fix`.

## Cosa abbiamo corretto nel codice

- `getAlarmConfig()` non invia più scritture Firestore a ogni lettura (causa principale del consumo).
- Listener allarmi: niente log ripetuti, niente scritture se i dati non cambiano.
- Plant: niente `getDocFromServer` extra, niente doppio listener con metadata.

## Nel frattempo

I dati restano nel **backup locale** (`stabileCurrentData`) su ogni dispositivo. La sync tra tablet riparte quando Firebase accetta di nuovo le richieste.
