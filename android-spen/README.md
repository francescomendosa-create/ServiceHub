# ServiceHub Tablet (S Pen nativo)

App Android per il tablet: stessa ServiceHub del sito, ma i numeri scritti con la S Pen li legge **ML Kit Digital Ink** (motore on-device), non il riconoscitore web.

- **PC / iPhone / Chrome**: restano sul sito. Nessun cambio di comportamento.
- **Tablet**: installa questo APK. I dati restano su Firestore come sempre.

## Installazione

1. Copia `ServiceHub-tablet-debug.apk` sul tablet.
2. Apri il file e consenti l’installazione da origini sconosciute (sostituisci la versione precedente).
3. Alla prima apertura serve internet: scarica il modello di riconoscimento (una volta sola).
4. Entra in ServiceHub e scrivi sui campi numero con la S Pen, come sul web.

L’app apre `https://francescomendosa-create.github.io/ServiceHub/`.

## Rotazione schermo

La rotazione **non** dipende dal sito web: è bloccata o sbloccata nell’APK.

- L’APK attuale deve essere compilato **dopo** il 25/09/2026 (orientamento `unspecified`, non più solo landscape).
- Sul tablet: attiva **Rotazione automatica** nelle impostazioni rapide Android.
- Poi disinstalla la vecchia app ServiceHub Tablet e installa il nuovo `ServiceHub-tablet-debug.apk`.

## Compilare di nuovo

Da questa cartella, con Android SDK e JDK di Android Studio:

```powershell
.\BUILD.ps1
```

oppure:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

L’APK esce in `app\build\outputs\apk\debug\` e viene copiato come `ServiceHub-tablet-debug.apk`.
