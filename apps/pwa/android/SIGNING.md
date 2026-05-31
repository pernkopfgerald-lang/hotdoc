# HotDoc · APK-Signing-Anleitung

## Einmal-Setup (du, ~3 Minuten)

### 1. Signing-Key erzeugen

Im PowerShell, im **Repo-Root** (NICHT im apps/pwa/android/-Ordner —
keystore.properties verweist relativ auf den Repo-Root):

```powershell
# JAVA_HOME muss gesetzt sein (Android Studio JBR oder Microsoft JDK 17)
$env:JAVA_HOME = "C:\Users\HP Z2 G4\AppData\Local\Programs\jdk-17"
& "$env:JAVA_HOME\bin\keytool.exe" -genkey -v `
  -keystore hotdoc.keystore `
  -alias hotdoc `
  -keyalg RSA -keysize 4096 -validity 9125 `
  -storetype PKCS12
```

Du wirst gefragt:
- **Keystore-Passwort:** denk dir was Sicheres aus, schreib's auf
- **Vor-/Nachname:** `Freiwillige Feuerwehr Eberstalzell`
- **Organisationseinheit:** `Kommando`
- **Organisation:** `FF Eberstalzell`
- **Stadt:** `Eberstalzell`
- **Bundesland:** `Oberösterreich`
- **Ländercode:** `AT`
- **Bestätigen:** `yes` (oder `j`)
- **Key-Passwort:** ENTER drücken → gleiches wie Keystore

Ergebnis: `hotdoc.keystore` im Repo-Root.

### 2. Sicheres Versteck

**Lege folgende Sachen sicher ab** (1Password, BitWarden, verschlüsselter
USB-Stick — NICHT in Git, NICHT in Cloud-Sync ohne E2E):

- `hotdoc.keystore` (~3 KB)
- Das Keystore-Passwort

⚠️ **Verlierst du beides, kannst du KEINE Updates mehr veröffentlichen.**
Bestehende Installationen funktionieren weiter, aber ein neues Release
wird vom Android als „anderer Publisher" abgelehnt → User müsste alte
App deinstallieren + neue installieren + alle lokalen Daten weg.

### 3. keystore.properties anlegen

Im `apps/pwa/android/`-Ordner (gitignored):

```properties
storeFile=../../../hotdoc.keystore
storePassword=DEIN-PASSWORT-HIER
keyAlias=hotdoc
keyPassword=DEIN-PASSWORT-HIER
```

## Release-APK bauen

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:TEMP = "C:\Temp"
cd "C:\Users\HP Z2 G4\Claude\2026-05 Sybos Konnektor\apps\pwa\android"
./gradlew assembleRelease
```

Output: `app/build/outputs/apk/release/app-release.apk` (signiert).

## Auf hotdoc-apk.fly.dev veröffentlichen

```powershell
# Versionsnummer im Dateinamen UND in app/build.gradle anpassen (versionCode + versionName)
cd "C:\Users\HP Z2 G4\Claude\2026-05 Sybos Konnektor"
copy "apps\pwa\android\app\build\outputs\apk\release\app-release.apk" "deploy\apk\apks\hotdoc-v0.1.1-release.apk"

# Im CouchDB die config:app-version aktualisieren (Backoffice oder direkt):
# {
#   "currentVersion": "0.1.1",
#   "apkUrl": "https://hotdoc-apk.fly.dev/hotdoc-v0.1.1-release.apk",
#   "releaseNotes": "Bugfixes + Performance",
#   "minSupported": "0.1.0"
# }

flyctl deploy --config fly.apk.toml --remote-only
```

Die Tablets pollen `/api/devices/app-version` und bieten beim nächsten
Start das Update an.
