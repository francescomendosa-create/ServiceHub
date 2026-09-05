# ServiceHub Tablet (S Pen nativo)

App Android per il tablet: stessa ServiceHub del sito, ma i numeri scritti con la S Pen li legge **ML Kit Digital Ink** (motore on-device), non il riconoscitore web.

- **PC / iPhone / Chrome**: restano sul sito. Nessun cambio di comportamento.
- **Tablet**: installa questo APK. I dati restano su Firestore come sempre.

## Installazione

1. Copia `ServiceHub-tablet-debug.apk` sul tablet.
2. Apri il file e consenti l’installazione da origini sconosciute.
3. Alla prima apertura serve internet: scarica il modello di riconoscimento (una volta sola).
4. Entra in ServiceHub e scrivi sui campi numero con la S Pen, come sul web.

L’app apre `https://francescomendosa-create.github.io/ServiceHub/`.

## Compilare di nuovo

Da questa cartella, con Android SDK e JDK di Android Studio:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

L’APK esce in `app\build\outputs\apk\debug\`.
