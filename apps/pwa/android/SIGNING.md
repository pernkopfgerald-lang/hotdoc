# HotDoc · APK-Signing & Auto-Update — Setup-Anleitung

> ⚠️ **Einmalige Aktion** für den Wechsel von Debug- auf Release-APKs.
> Danach: alle Updates via UpdateBanner auf den Tablets (1 Klick).

## Warum Release-APKs?

Debug-APKs werden mit einem **zufällig generierten Debug-Signing-Key**
gebaut — jeder Build hat eine andere Signatur. Android weigert sich, eine
App über eine andere Signatur zu „updaten", weil das eine Man-in-the-Middle-
Attacke wäre. → User muss bei jedem Update die alte App **deinstallieren**.

Release-APKs werden mit deinem **dauerhaften Keystore** signiert. Solange
alle Releases denselben Keystore nutzen, sieht Android: gleiche Signatur,
gleiche App → Update zulässig, Daten + Permissions bleiben erhalten.

---

## Einmal-Setup (du, ~3 Minuten)

### 1. Signing-Key erzeugen

Im **PowerShell**, im **Repo-Root**:

```powershell
# JAVA_HOME muss gesetzt sein — Android Studio JBR oder Microsoft OpenJDK 17
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

& "$env:JAVA_HOME\bin\keytool.exe" -genkey -v `
  -keystore hotdoc.keystore `
  -alias hotdoc `
  -keyalg RSA -keysize 4096 -validity 9125 `
  -storetype PKCS12
```

Du wirst gefragt:

| Feld | Antwort |
|---|---|
| **Keystore-Passwort** | denk dir was Sicheres aus — z. B. 16 Zeichen Random, **schreib's auf** |
| Wiederholung | gleich nochmal |
| Vor-/Nachname | `Freiwillige Feuerwehr Eberstalzell` |
| Organisationseinheit | `Kommando` |
| Organisation | `FF Eberstalzell` |
| Stadt | `Eberstalzell` |
| Bundesland | `Oberösterreich` |
| Ländercode | `AT` |
| Bestätigen | `yes` oder `j` |
| Key-Passwort | **ENTER drücken → gleich wie Keystore** |

Ergebnis: `hotdoc.keystore` im Repo-Root (~3 KB).

### 2. Sicheres Versteck

**Lege folgende Sachen sicher ab** (1Password / BitWarden / verschlüsselter
USB-Stick — NIE in Git, NIE in Cloud-Sync ohne E2E):

- `hotdoc.keystore`
- Keystore-Passwort
- Alias-Name (`hotdoc`)

**Wenn du den Keystore verlierst** → niemand kann mehr Updates ausliefern,
alle Tablets müssen die App komplett deinstallieren + neue Version installieren.

### 3. `keystore.properties` anlegen

Datei `apps/pwa/android/keystore.properties` (ist `.gitignore`d):

```properties
storeFile=../../../hotdoc.keystore
storePassword=DEIN_PASSWORT
keyAlias=hotdoc
keyPassword=DEIN_PASSWORT
```

`storeFile` ist relativ zu `apps/pwa/android/app/` — drei `..` führen zum
Repo-Root, wo `hotdoc.keystore` liegt.

---

## Pro Release (du, ~2 Minuten)

### 1. Versionen bumpen

In **4 Dateien** anheben — sonst sieht Android das Update nicht als „neuer":

```
apps/pwa/src/version.ts             → APP_VERSION = "v0.1.6"
apps/pwa/android/app/build.gradle   → versionCode 7, versionName "0.1.6"
packages/shared/src/constants/releaseNotes.ts → neuer RELEASE_NOTES-Eintrag oben
apps/api/src/routes/config.ts       → app-version.currentVersion + releaseNotes
```

### 2. Build + Deploy in einem Rutsch

```powershell
.\scripts\release-apk.ps1 -Version 0.1.6
```

Das Script:

1. PWA + Shared bauen
2. Capacitor sync
3. `gradlew assembleRelease` (signiert mit deinem Keystore)
4. APK kopieren nach `deploy/apk/apks/hotdoc-v0.1.6-release.apk`
5. `apk-info.json` updaten
6. `flyctl deploy fly.apk.toml`

Plus parallel selber starten:

```powershell
flyctl deploy --config fly.api.toml --remote-only --strategy immediate
flyctl deploy --config fly.pwa.toml --remote-only --strategy immediate
```

### 3. Fertig

Innerhalb von 6 h (oder beim nächsten App-Start) pollt jedes Tablet
`/api/devices/app-version`, sieht die neue Version, der **UpdateBanner**
poppt auf, der User tippt 1× auf „Update".

> Beim **ersten** Release-APK-Switch von `v0.1.5-debug` auf `v0.1.6-release`
> müssen die Tablets EINMAL manuell die alte deinstallieren + neue
> installieren — wegen Signing-Key-Wechsel von Debug auf Release.
> Ab v0.1.6 → v0.1.7 + alle folgenden: 1-Klick-Update via Banner.

---

## Update-Flow auf dem Tablet

1. Tablet hat v0.1.6-release installiert
2. Backend hat v0.1.7-release published
3. UpdateBanner erscheint oben rechts: **„HotDoc v0.1.7 verfügbar"**
4. User tippt **„Update"**
5. ApkInstaller-Plugin:
   - Prüft `canRequestPackageInstalls()` → falls erstmalig „Apps aus
     unbekannten Quellen installieren erlauben" für HotDoc nötig:
     System-Settings öffnen, User aktiviert das, zurück, erneut „Update"
   - Lädt APK in `cacheDir/update.apk` (Progress-Bar im Banner)
   - Generiert `content://`-URI via FileProvider
   - Triggert `Intent.ACTION_VIEW` mit MIME `application/vnd.android.package-archive`
6. Android-System-Dialog: **„HotDoc aktualisieren?"**
7. User tippt **„Aktualisieren"**
8. App schließt sich, neue Version startet, Login bleibt erhalten

---

## Anti-Cheatsheet — Fehler die nie passieren dürfen

| Fehler | Folge |
|---|---|
| Keystore-Datei verlieren | Updates für IMMER tot — Neuinstallation auf allen Tablets |
| Keystore-Passwort vergessen | Wie oben |
| `keystore.properties` commiten | Passwort in git-history, Keystore quasi nutzlos — neues Setup nötig |
| `versionCode` NICHT bumpen | Android sieht „same version" → kein Update angeboten |
| Anderes Keystore-File benutzen | Android sieht Signing-Mismatch → User muss deinstall+install |
| `google-services.json` fehlt im Build | App crashed beim Start (Default FirebaseApp not initialized) |

---

## Architektur — wie der Update-Flow läuft

```
┌──────────────────────────────────────────────────────────────┐
│  Build-Time (du, einmal pro Release)                         │
│                                                              │
│  release-apk.ps1                                             │
│   → pnpm build (PWA-JS + HTML)                               │
│   → cap sync (kopiert dist/ in android/app/src/main/assets/) │
│   → gradlew assembleRelease (signiert mit hotdoc.keystore)   │
│   → kopiert APK in deploy/apk/apks/                          │
│   → flyctl deploy fly.apk.toml                               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│  Run-Time (Tablet, alle 6 h + bei Boot)                      │
│                                                              │
│  UpdateBanner.tsx                                            │
│   → checkForUpdate() → GET /api/devices/app-version          │
│   → semverCompare(installed, latest)                         │
│                                                              │
│  Wenn Update verfügbar:                                      │
│   → User tippt "Update"                                      │
│   → installApkUpdate({ url })                                │
│   → ApkInstaller-Plugin (Java)                               │
│      → canRequestPackageInstalls()? falls nein → Settings    │
│      → HttpURLConnection.download → cacheDir/update.apk      │
│      → FileProvider.getUriForFile → content:// URI           │
│      → Intent.ACTION_VIEW → PackageInstaller                 │
│   → Android-System-UI "App aktualisieren?"                   │
│   → User tippt "Aktualisieren"                               │
│   → App restartet mit neuer Version                          │
└──────────────────────────────────────────────────────────────┘
```

Code-Pointer:
- Plugin Java: `apps/pwa/android/app/src/main/java/at/ffeberstalzell/hotdoc/ApkInstallerPlugin.java`
- Plugin TS-Wrapper: `apps/pwa/src/lib/apk-installer.ts`
- UpdateBanner: `apps/pwa/src/components/UpdateBanner.tsx`
- Version-Poll-Endpoint: `apps/api/src/routes/devices.ts → /api/devices/app-version`
- Build-Script: `scripts/release-apk.ps1`
