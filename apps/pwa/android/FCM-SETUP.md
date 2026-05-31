# HotDoc · FCM-Push-Notifications Setup

Damit die HotDoc-App im Hintergrund / geschlossen-Zustand BlaulichtSMS-
Alarme empfangen kann, brauchen wir Google Firebase Cloud Messaging.
Einmaliges Setup, dauert ~10 Minuten.

## 1. Firebase-Projekt anlegen

1. Gehe auf https://console.firebase.google.com/
2. Mit Google-Account einloggen
3. **„Projekt hinzufügen"** klicken
4. Projekt-Name: `HotDoc FF Eberstalzell`
5. **Google Analytics**: deaktivieren (brauchen wir nicht)
6. **„Projekt erstellen"** → kurze Wartezeit

## 2. Android-App registrieren

1. Im neuen Projekt: **Übersicht-Icon „+ App hinzufügen"** → **Android-Icon**
2. **Android-Paketname:** `at.ffeberstalzell.hotdoc`
3. **App-Nickname:** `HotDoc` (optional)
4. **Debug-Signing-Zertifikat:** leer lassen für jetzt (wird nur für
   Phone-Auth gebraucht, nicht für FCM)
5. **„App registrieren"**

## 3. google-services.json runterladen

Schritt 2 des Firebase-Wizards bietet die Datei zum Download an.

1. **`google-services.json`** runterladen (~3 KB)
2. Kopiere sie nach **`apps/pwa/android/app/google-services.json`**
   ⚠️ Die Datei ist in `.gitignore` — **niemals committen**.

## 4. Cloud Messaging API aktivieren + Server-Key holen

Cloud Messaging hat zwei Authentifizierungs-Varianten:

**Legacy (was wir nutzen):**
- Firebase Console → **Projekt-Einstellungen (Zahnrad oben)** → **Cloud Messaging-Tab**
- Falls „Cloud Messaging API (Legacy)" auf **disabled** steht: aktivieren
  (geht über einen Link der dich zu console.cloud.google.com weiterleitet)
- **„Server key"** kopieren → das ist der `FCM_SERVER_KEY`

**Modern (Migration in einer späteren Phase):**
- Service-Account-JSON mit `cloud-messaging`-Rolle. Komplexer, brauchen wir
  nicht solange Legacy noch funktioniert (Google hat das Sunsetting auf
  unbekannt verschoben, war 2024 angekündigt).

## 5. Server-Key in fly.io setzen

```powershell
$env:FLY_API_TOKEN = "..."  # Dein fly-Token
flyctl secrets set FCM_SERVER_KEY="DER_KEY_AUS_SCHRITT_4" --config fly.api.toml
```

Das löst automatisch einen API-Restart aus.

## 6. APK neu bauen (jetzt mit Firebase)

```powershell
cd "C:\Users\HP Z2 G4\Claude\2026-05 Sybos Konnektor\apps\pwa\android"
./gradlew clean assembleDebug   # oder assembleRelease
```

Das `google-services.json` wird vom Gradle-Plugin automatisch
verarbeitet. Wenn die Datei da ist, sagt der Build-Output:
`google-services.json found, google-services plugin applied`.

Wenn nicht (z. B. weil noch nicht da):
`google-services.json not found, google-services plugin not applied`.

## 7. Test: Echter Push

1. Installiere die neue APK auf einem Tablet
2. Logge dich ein (QR-Anker)
3. Schaue im Backoffice → Backend-Log:
   ```
   Device registriert  { docId: "device:fcm-kdo-...", model: "...", appVersion: "0.1.0" }
   ```
4. Trigger einen Test-Alarm (oder warte auf den nächsten echten)
5. Backend-Log:
   ```
   FCM-Push abgeschlossen  { ok: 1, fail: 0, total: 1 }
   ```
6. Auf dem Tablet erscheint eine Notification → klicken öffnet die App
   mit dem Alarm vorgefüllt

## Troubleshooting

- **Build crash mit `Plugin com.google.gms.google-services not found`**:
  Die `apps/pwa/android/build.gradle` muss das Plugin als Dependency
  haben. Capacitor sollte das automatisch hinzufügen — falls nicht,
  ergänzen:
  ```gradle
  classpath 'com.google.gms:google-services:4.4.2'
  ```

- **Push kommt nicht an**:
  - `FCM_SERVER_KEY` im fly.io secret? `flyctl secrets list --config fly.api.toml`
  - Tablet registriert? Backoffice → Geräte-Tab (Phase 3) oder
    `couchdb-admin` → device:* Docs
  - FCM-Token noch gültig? Bei App-Reinstall ändert er sich → die App
    ruft `/api/devices/register` neu auf, das ist OK
  - Phone in „Don't disturb / Bitte nicht stören"? FCM data-messages
    sind high-priority und sollten durchkommen, aber bei aktiver Sperre
    bleibt nur die Notification still im Tray
