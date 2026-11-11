# Regole Firestore ServiceHub — cosa pubblicare e perché

## Perché “prima funzionava senza regole”

Firebase, sui progetti nuovi, per un periodo mette Firestore in **modalità test** (`allow read, write: if true` per circa 30 giorni). Quando scade, **senza regole pubblicate** le scritture falliscono: l’app salva solo in locale e **ogni tablet/PC resta da solo**.

L’app usa `signInAnonymously`: serve almeno `allow write: if request.auth != null` sul documento condiviso.

**Percorso dati condivisi (tutti i dispositivi):**

`artifacts/stabile-2026-v4/sharedDial/plant`

---

## Passo 1 — Firebase Console (obbligatorio)

1. Apri [Firebase Console](https://console.firebase.google.com/) → progetto **`servicehub-18309`**.
2. **Authentication** → tab **Sign-in method** → abilita **Anonymous** (Anonimo) → Salva.
3. **Firestore Database** → se non esiste, crea database (modalità produzione va bene).
4. **Firestore** → **Regole** (Rules).
5. **Cancella tutto** e incolla il contenuto del file `firestore.rules` di questo repository (cartella ServiceHub).
6. Clic **Pubblica** (Publish).
7. Attendi 10–30 secondi.

---

## Passo 2 — Verifica dall’app

1. Su PC e tablet: ricarica forzata l’app (Ctrl+F5) o reinstalla la PWA.
2. Build in basso: **`2026.06.03-restore-sync-30e6136`**.
3. LED cloud: **verde** = autenticato.
4. Riga sync: **Tu XXX · Cloud XXX** — dopo un salvataggio i due numeri devono coincidere.
5. Se compare banner giallo / “Salvataggio cloud FALLITO” → regole non pubblicate o Anonymous disabilitato.

---

## Passo 3 — Test rapido due dispositivi

1. PC: cambia un numero → aspetta 2–3 secondi.
2. Tablet: stesso campo deve aggiornarsi (senza ricaricare la pagina, se possibile).
3. Se PC mostra Tu 123 e Cloud 456 diversi dopo il salvataggio → problema cloud/regole, non solo cache.

---

## Regole consigliate (già in `firestore.rules`)

- `plant` e `rapportini`: **lettura aperta** (`read: true`), **scrittura solo utente autenticato** (anonimo incluso).
- Resto `sharedDial`: read/write con auth.
- Sotto-collections `plant/snapshots`: stessa logica.

Non serve inventare altre regole se pubblichi quel file così com’è.

---

## Solo per test urgente (meno sicuro)

Se devi sbloccare subito e accetti rischio (chiunque potrebbe scrivere sul cruscotto), in Rules puoi usare temporaneamente solo per `plant`:

```
match /artifacts/{appId}/sharedDial/plant {
  allow read, write: if true;
}
```

Poi torna alle regole del file `firestore.rules` del repo.

---

## Versione codice che aveva sync realtime

Commit Git: **`30e6136`** (messaggio `s` in log).

Build attuale ripristina quella logica sync + protezione “non cancellare mentre scrivi sul campo aperto”.

---

## Se ancora non synca

Controlla in Console browser (F12) messaggi `[ServiceHub]`:

- `permission-denied` → regole o Anonymous.
- `plant salvato su cloud, rev=` su un device ma l’altro non cambia → stesso progetto Firebase e stesso URL app su tutti i dispositivi.
