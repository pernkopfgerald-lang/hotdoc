# HotDoc — Android-APK (Capacitor)

Native Android-Hülle für die HotDoc-PWA. Webview lädt das Vite-Build-
Output (`dist/`) lokal aus den App-Assets — keine Internet-Verbindung
nötig zum Start, keine Service-Worker-Cache-Fallen.

API-Calls gehen weiter über `https://hotdoc-api.fly.dev`. Tablet-Auth
identisch zur PWA (Bearer-Token, QR-Anker).

## Toolchain installieren (einmalig)

1. **Android Studio** runterladen + installieren:
   https://developer.android.com/studio
   Bringt mit: JDK 17, Android SDK, Gradle, Emulator.

2. Beim ersten Start:
   - SDK Manager öffnen → mindestens **Android 13 (API 33)** + **Android 14 (API 34)** installieren
   - **Build-Tools** auswählen (neueste Version)
   - **Platform-Tools** (für `adb`)

3. Umgebungsvariablen setzen (Windows-Systemeinstellungen → Umgebungsvariablen):
   ```
   ANDROID_HOME = C:\Users\HP Z2 G4\AppData\Local\Android\Sdk
   JAVA_HOME    = C:\Program Files\Android\Android Studio\jbr
   ```
   PATH ergänzen um: `%ANDROID_HOME%\platform-tools` und `%ANDROID_HOME%\cmdline-tools\latest\bin`

4. Shell neu öffnen und prüfen:
   ```powershell
   java -version    # → openjdk 17.x
   adb --version    # → Android Debug Bridge
   ```

## Web-Assets bauen + sync in Android-Projekt

Vor jedem APK-Build muss das Vite-Bundle frisch im Android-Projekt liegen:

```bash
cd apps/pwa
pnpm run build           # → dist/
npx cap sync android     # kopiert dist/ → android/app/src/main/assets/public/
```

## Debug-APK bauen + installieren

```bash
cd apps/pwa/android
./gradlew assembleDebug
```

APK liegt unter `app/build/outputs/apk/debug/app-debug.apk`.

Auf ein per USB verbundenes Tablet (Entwickleroptionen + USB-Debugging an):

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Oder per Datei-Manager: APK auf das Tablet kopieren → öffnen →
„Installation aus unbekannten Quellen erlauben" → Installieren.

## Release-APK signieren

1. Signing-Key generieren (einmalig — Keystore + Passwort **außerhalb des
   Repos** sicher aufbewahren, Verlust = keine Updates mehr möglich):
   ```bash
   keytool -genkey -v -keystore hotdoc.keystore -alias hotdoc \
     -keyalg RSA -keysize 4096 -validity 9125
   ```

2. `android/keystore.properties` anlegen (im .gitignore!):
   ```
   storeFile=../../../hotdoc.keystore
   storePassword=<dein-passwort>
   keyAlias=hotdoc
   keyPassword=<dein-passwort>
   ```

3. `android/app/build.gradle` um signingConfigs ergänzen — Doku siehe
   https://capacitorjs.com/docs/android/deploying-to-google-play

4. Release-Build:
   ```bash
   ./gradlew assembleRelease
   ```
   → `app/build/outputs/apk/release/app-release.apk`

## Live-Dev (Hot-Reload aufs Tablet)

Mit USB-Tablet kann der Vite-Dev-Server direkt vom Android-Webview
geladen werden — Code-Änderungen sind sofort sichtbar:

1. PC-IP im LAN herausfinden (z. B. `192.168.178.42`).
2. In `apps/pwa/capacitor.config.ts` `server.url` und `server.cleartext` setzen:
   ```ts
   server: { url: "http://192.168.178.42:5173", cleartext: true }
   ```
3. `npx cap sync android` + Debug-APK installieren.
4. `pnpm dev` im `apps/pwa/`.
5. APK öffnen — sie verbindet sich gegen die Dev-URL.

**WICHTIG**: vor jedem Release-Build die `server.url`-Zeile wieder entfernen,
sonst zeigt die Release-APK leerschwarzes Bild beim Kunden.

## Plugin-Übersicht

| Plugin | Zweck |
|---|---|
| `@capacitor/preferences` | sichere Token-Speicherung statt localStorage |
| `@capacitor/network` | zuverlässiges Online/Offline-Event |
| `@capacitor/geolocation` | hochpräzises GPS für Routing + Live-Position |
| `@capacitor/app` | AppState (active/background), Boot-Events |
| `@capacitor/device` | Geräte-Info für /api/devices/register |
| `@capacitor/status-bar` | FF-Rote Statusbar |
| `@capacitor/splash-screen` | Branded Splash beim App-Start |
| `@capacitor-community/keep-awake` | Display wach halten während Einsatz |

Plugins werden zur Laufzeit über `src/lib/platform.ts` abstrahiert — der
gesamte App-Code bleibt PWA-fähig.

## Phase 2 (geplant)

- `@capacitor/push-notifications` + Firebase FCM für BlaulichtSMS-Alarm
- Foreground-Service für Live-Position während aktivem Einsatz
- Boot-Receiver damit die App nach Tablet-Neustart wieder ready ist
- In-App-Update-Check (APK-Auto-Update vom hotdoc-apk-distribution-Server)
