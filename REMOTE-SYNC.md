# Service Remote — aggiornamento automatico

Service Remote (`servicehub-18309.web.app`) resta allineato al codice sul PC **senza passi manuali**.

## Come funziona

1. **Modifichi** file in `remote/`, `digital-remote.css`, Digital Report in `index.html`, ecc.
2. **`git push` su `main`** → parte in automatico:
   - **Hook locale** (`.githooks/pre-push`) → deploy Firebase dal PC se sei loggato
   - **GitHub Actions** → deploy Firebase dal cloud (backup garantito)
3. **ServiceHub** si aggiorna da solo con lo stesso `git push` (GitHub Pages).

Non serve aprire la console Firebase per il sito Remote.

## Setup una tantum sul PC

```powershell
powershell -ExecutionPolicy Bypass -File .\_setup-auto-remote.ps1
```

Poi su GitHub (una volta sola):

1. Terminale: `firebase login:ci` → copia il token
2. Repo **ServiceHub** → **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**: nome `FIREBASE_TOKEN`, valore = token

## Verifica

- Push su `main` → tab **Actions** su GitHub → workflow **Deploy Service Remote**
- Sito live: https://servicehub-18309.web.app (badge versione in basso a destra)

## Deploy manuale (solo emergenza)

```powershell
powershell -ExecutionPolicy Bypass -File .\_deploy-remote-firebase.ps1
```
