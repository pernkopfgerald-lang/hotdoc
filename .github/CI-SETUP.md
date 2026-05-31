# HotDoc · GitHub Actions Cloud-Build Setup

> **Einmalig** — danach baut **jeder Git-Tag** in 4 Minuten eine signierte
> Release-APK und published sie automatisch nach `hotdoc-apk.fly.dev`.
> Tablets sehen das Update im UpdateBanner und können es per 1-Klick
> installieren.

---

## Warum Cloud-Build?

Lokaler Windows-Build scheitert seit JDK 21 sporadisch mit
„Unable to establish loopback connection" — eine Mischung aus
Tailscale + Windows-Defender + WEPoll-Selektor-Bug + Hyper-V-Adaptern.
Reproduzierbar nicht behebbar.

Cloud-Build löst das einmal und für immer: Ubuntu-Linux-Runner, kein VPN,
keine Netzwerk-Komplexität, ~3 min pro Release.

---

## Schritt 1 — GitHub-Account + Repository

1. https://github.com/signup falls noch kein Account
2. https://github.com/new → **Private Repository** namens `hotdoc`
3. **NICHT** initialisieren mit README/gitignore/license (wir pushen
   den bestehenden Code rauf)

## Schritt 2 — Remote setzen + push

Im PowerShell, im Repo-Root:

```powershell
git remote add github https://github.com/DEIN_USERNAME/hotdoc.git
git push github main
```

GitHub fragt nach Username + **Personal Access Token** (kein Passwort):
- https://github.com/settings/tokens → **Generate new token (classic)**
- Scope: `repo` (Vollzugriff Repository)
- Token speichern → als „Passwort" beim Push verwenden

## Schritt 3 — GitHub Secrets konfigurieren

Im GitHub-Repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret** für **6 Secrets**:

| Secret-Name | Wert | Wie bekommen |
|---|---|---|
| `ANDROID_KEYSTORE_B64` | Base64 vom `hotdoc.keystore` | siehe unten |
| `KEYSTORE_PASSWORD` | Dein Keystore-Passwort | wie in `apps/pwa/android/keystore.properties` |
| `KEY_ALIAS` | `hotdoc` | (fest) |
| `KEY_PASSWORD` | gleicher Wert wie `KEYSTORE_PASSWORD` | du hast ENTER gedrückt bei der Frage |
| `GOOGLE_SERVICES_JSON_B64` | Base64 vom `apps/pwa/android/app/google-services.json` | siehe unten |
| `FLY_API_TOKEN` | dein fly.io API-Token | siehe unten |

### Wie die Base64-Werte erzeugen (PowerShell, im Repo-Root):

```powershell
# Keystore
[Convert]::ToBase64String([IO.File]::ReadAllBytes("hotdoc.keystore")) | Set-Clipboard
# -> dann im GitHub-Secret-Wert-Feld einfügen mit Strg+V

# google-services.json
[Convert]::ToBase64String([IO.File]::ReadAllBytes("apps\pwa\android\app\google-services.json")) | Set-Clipboard
# -> dann im GitHub-Secret-Wert-Feld einfügen mit Strg+V
```

### FLY_API_TOKEN bekommen:

```powershell
flyctl auth token
```

→ langer String, in das Secret kopieren.

## Schritt 4 — Erster Test-Build

Im GitHub-Repo → **Actions**-Tab → **„Release-APK Build und Deploy"**
links auswählen → **„Run workflow"** rechts oben → Version z.B. `0.1.6`
eintragen → **Run workflow** klicken.

Nach ~3 min:
- ✅ Workflow-Run grün
- ✅ APK live unter `https://hotdoc-apk.fly.dev/hotdoc-v0.1.6-release.apk`
- ✅ APK auch als „Artifact" downloadbar (für Backup)

## Schritt 5 — Versionen bumpen + Tag pushen (zukünftiger Workflow)

Pro Release:

```powershell
# Versionen in 4 Dateien bumpen
# (apps/pwa/src/version.ts, apps/pwa/android/app/build.gradle,
#  packages/shared/src/constants/releaseNotes.ts, apps/api/src/routes/config.ts)

git add .
git commit -m "v0.1.7: <feature>"
git tag v0.1.7
git push github main --tags
```

→ Workflow startet automatisch bei `git push --tags`. Tag-Pattern: `v*.*.*`

---

## Was der Workflow macht

```
1. Ubuntu-Runner hochfahren (~10 s)
2. Code checkout
3. pnpm + Node 20 + JDK 17 + Android SDK installieren (~60 s)
4. pnpm install --frozen-lockfile (~30 s)
5. Shared + PWA bauen (~30 s)
6. cap sync android (~10 s)
7. google-services.json + Keystore aus Secrets decodieren
8. keystore.properties schreiben
9. gradlew assembleRelease (~60 s)
10. APK in deploy/apk/apks/ kopieren
11. apk-info.json updaten
12. APK als Artifact uploaden (90 Tage Retention)
13. flyctl deploy --config fly.apk.toml
```

**Total**: ~3-4 Minuten.

## Sicherheit

- Secrets sind in GitHub verschlüsselt, nie im Build-Log sichtbar
- Workflow-Files sind committed (öffentlich nur wenn Repo public)
- Repository sollte **PRIVATE** bleiben — der Code ist FF-spezifisch
- Bei Verlust eines Secrets: alten löschen, neuen anlegen

## Gitea bleibt das primäre Repo

Der `github`-Remote ist nur für CI. Der primäre Sync läuft weiterhin nach
`gitea` (origin). Du pushst beide getrennt:

```powershell
git push origin main          # gitea (primary, code-history)
git push github main --tags   # github (CI-trigger)
```

Oder mit einem Helper:

```powershell
git remote set-url --add --push origin http://192.168.178.219:3006/gerald/HotDoc.git
git remote set-url --add --push origin https://github.com/DEIN_USERNAME/hotdoc.git
git push origin main
# -> pushed automatisch zu beiden
```

## Troubleshooting

| Symptom | Ursache | Lösung |
|---|---|---|
| Workflow failed bei „Keystore decodieren" | Base64-Wert kaputt | Neu encoden, achten auf saubere Zeilenumbrüche |
| Workflow failed bei „gradlew assembleRelease" | Keystore-Passwort falsch | Secret nochmal prüfen |
| Workflow failed bei „flyctl deploy" | FLY_API_TOKEN abgelaufen | `flyctl auth token` neu, Secret updaten |
| APK installiert sich nicht beim Tablet-Test | Tablet hat noch v0.1.5-debug → Signing-Mismatch | Einmalig deinstall + neu installieren |
