# HotDoc · FCM-Push-Notifications Setup

Damit die HotDoc-App im Hintergrund / geschlossen-Zustand BlaulichtSMS-
Alarme empfangen kann, brauchen wir Google Firebase Cloud Messaging.
Einmaliges Setup, dauert ~10 Minuten.

> **Wichtig**: Wir nutzen die **HTTP v1 API** (mit OAuth2 + Service-Account).
> Die alte Legacy-API (`/fcm/send` mit Server-Key) ist seit 20. Juni 2024
> von Google **abgeschaltet** und wird nicht mehr unterstützt.

## Projekt-Status (HotDoc FF Eberstalzell)

Aktuell konfiguriert:

- **Firebase-Projekt**: `hotdoc-ff-eberstalzell`
- **Project-Number**: `315949458556`
- **App-Package**: `at.ffeberstalzell.hotdoc`
- **App-ID**: `1:315949458556:android:4eb856513f01deac7e15f9`
- **google-services.json**: `apps/pwa/android/app/google-services.json` (committed)

## Schritt 1 — Service-Account-Key erstellen

1. Firebase Console → ⚙️ **Einstellungen** → **Projekteinstellungen**
2. Tab **Dienstkonten** (engl.: Service Accounts)
3. Button **„Neuen privaten Schlüssel generieren"**
4. JSON-Datei runterladen (sieht aus wie `hotdoc-ff-eberstalzell-firebase-adminsdk-xxxxx.json`)

⚠️ Die JSON enthält den **Private Key**. Niemals committen, niemals in
Chat-Logs, niemals per E-Mail teilen. Nur als fly secret setzen.

## Schritt 2 — Als fly secret setzen

PowerShell (Windows):

```powershell
$json = Get-Content "$env:USERPROFILE\Downloads\hotdoc-ff-eberstalzell-firebase-adminsdk-xxxxx.json" -Raw
flyctl secrets set FCM_SERVICE_ACCOUNT_JSON="$json" -a hotdoc-api
```

Bash / Linux / macOS:

```bash
flyctl secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat ~/Downloads/hotdoc-ff-eberstalzell-firebase-adminsdk-xxxxx.json)" -a hotdoc-api
```

fly.io macht einen Auto-Redeploy. Nach ~30 s ist der Schnittstellen-
Status im Backoffice → **„Über"-Tab** wieder grün:

> FCM Push · OK — N Tablet(s) registriert · FCM_SERVICE_ACCOUNT_JSON gesetzt (HTTP v1)

## Schritt 3 — Tablets registrieren sich automatisch

Beim ersten App-Start nach Setup ruft der Capacitor-PushNotifications-
Plugin `register()` auf, holt sich einen FCM-Registration-Token, und
schickt ihn an `POST /api/devices/register`. Backend speichert das
als `device:<uuid>` mit `fcmToken` + `fahrzeugId`.

Im Backoffice → **„Registrierte Geräte"** sieht man dann alle Tablets
mit FCM-Status.

## Schritt 4 — Test-Push

Im Backoffice → „Über" → Schnittstellen-Karte FCM zeigt einen
**„Test-Push senden"**-Button. Wählt das Fahrzeug, dann fliegt eine
Test-Notification mit Titel „HotDoc Test" raus. Auf jedem registrierten
Tablet erscheint die Notification — auch im Hintergrund / Standby.

## Trouble-Shooting

| Symptom | Ursache | Lösung |
|---|---|---|
| Status weiterhin „OFF" nach Secret-Set | Secret hat keinen Zeilenumbruch verloren | `flyctl secrets list -a hotdoc-api` checken, Wert ist da; redeploy mit `flyctl apps restart hotdoc-api` |
| Push kommt nicht an, aber Backend sagt versendet=N | Notification-Permission im Tablet aus | Android-Settings → Apps → HotDoc → Benachrichtigungen aktivieren |
| `OAuth2-Token-Exchange fehlgeschlagen: 401` im API-Log | Service-Account inzwischen deaktiviert oder Project-ID mismatch | Neuen Service-Account erstellen, secret tauschen |
| `UNREGISTERED` im API-Log | Tablet hat App deinstalliert | Device-Doc wird auto-stale gesetzt; bei Neuinstallation wieder OK |
| Push kommt 2x | Tablet ist auf 2 Geräten gleichzeitig eingeloggt | normales Verhalten, beide werden gepusht |

## Architektur-Details

```
BlaulichtSMS-Poller     →  pushAlarm(fahrzeugIds, payload)
                            ↓
                         services/fcm.ts
                            ↓
                         OAuth2-JWT (RS256) signed mit
                         service_account.private_key
                            ↓
                         POST oauth2.googleapis.com/token
                            ↓  access_token (1h gültig, gecached ~50 min)
                            ↓
                         POST fcm.googleapis.com/v1/projects/
                              hotdoc-ff-eberstalzell/messages:send
                            ↓
                         Tablet wird aufgeweckt, Capacitor-Plugin
                         feuert PushNotificationActionPerformed
                            ↓
                         App öffnet sich auf der BerichtPage des
                         betroffenen Fahrzeugs
```

Code-Pointer:
- Backend: `apps/api/src/services/fcm.ts`
- Token-Cache: in-process, 50-Minuten-TTL
- Device-Register: `apps/pwa/src/lib/device-register.ts`
- Capacitor-Plugin: `@capacitor/push-notifications`
