# HotDoc — Release-Workflow

> **Standard ab v0.1.7+** — alle Deploys laufen automatisch via GitHub Actions.
> Du committest, pushst, CI macht den Rest.

---

## TL;DR — der Standard-Flow

```powershell
# 1. Versionen bumpen (siehe unten)
# 2. Commit + Push
git add .
git commit -m "v0.1.7: feature-XYZ"
git push origin main          # gitea (primary history)
git push github main          # github (triggert Auto-Deploy)

# 3. Wenn neue APK ausgeliefert werden soll: zusätzlich Tag pushen
git tag v0.1.7
git push github main --tags   # triggert APK-Build + Release
```

**Das war's.** GitHub Actions deployed in 3-5 min:
- API → `hotdoc-api.fly.dev`
- PWA → `hotdoc-eberstalzell.fly.dev`
- Backoffice → `hotdoc-backoffice.fly.dev`
- APK (nur bei Tag) → `hotdoc-apk.fly.dev/hotdoc-vX.Y.Z-release.apk`

---

## Versionen bumpen — **4 Stellen, immer alle gleichzeitig**

Sonst zeigt das Frontend eine andere Version als die installierte APK, oder
der UpdateBanner triggert nicht. Es gibt keinen guten Grund, eine zu vergessen.

| Datei | Was reinkommt |
|---|---|
| `apps/pwa/src/version.ts` | `APP_VERSION = "v0.1.7"` (Footer + About-Modal) |
| `apps/pwa/android/app/build.gradle` | `versionCode 8`, `versionName "0.1.7"` (Android Update-Erkennung) |
| `packages/shared/src/constants/releaseNotes.ts` | Neuer Eintrag oben mit `version: "0.1.7"`, Datum, Bullets |
| `apps/api/src/routes/config.ts` | `app-version.currentVersion`, `apkUrl`, `releaseNotes` (Server-Truth für UpdateBanner) |

**Anti-Pattern**: Nur API bumpen und PWA „kommt später" — dann zeigt der
Footer noch die alte Version, User ist verwirrt.

---

## Wer deployed was?

```
Push auf main (irgendein Code-Change)
    │
    ▼
.github/workflows/deploy.yml
    ├── deploy-api          → flyctl deploy fly.api.toml
    ├── deploy-pwa          → flyctl deploy fly.pwa.toml
    └── deploy-backoffice   → flyctl deploy fly.backoffice.toml

Push eines Tags v*.*.*
    │
    ▼
.github/workflows/release-apk.yml
    ├── pnpm install + build
    ├── Capacitor sync android
    ├── gradlew assembleRelease (signiert mit ANDROID_KEYSTORE_B64)
    ├── APK → deploy/apk/apks/hotdoc-vX.Y.Z-release.apk
    ├── apk-info.json bumpen
    └── flyctl deploy fly.apk.toml
```

**Wenn du nur eine Code-Änderung deployen willst (kein neuer APK)**: nur push, kein Tag.

**Wenn du eine neue APK ausliefern willst**: Versionen bumpen + Tag pushen.

---

## „Path-Ignore" — was triggert kein Deploy?

`deploy.yml` ignoriert diese Pfade:

- `.github/**` — CI-Änderungen redeployen nichts
- `docs/**`, `**/*.md` — Doku-Änderungen redeployen nichts
- `deploy/apk/**` — APK-Pipeline ist separat

Damit musst du keine Sorge haben dass ein README-Tippfehler einen Deploy auslöst.

---

## Manueller Override

Wenn du **nur PWA deployen willst** (z.B. weil API noch gar nicht gebaut):

1. GitHub → Actions → **„Auto-Deploy API + PWA + Backoffice"**
2. **„Run workflow"** → Services: `pwa` → **Run**

Gleiches für `api`, `backoffice`, oder `all`.

---

## Sanity-Check nach Release

5 min warten + folgende URLs öffnen:

| URL | Erwartung |
|---|---|
| https://hotdoc-api.fly.dev/api/admin/health | JSON mit allen 4 Items |
| https://hotdoc-eberstalzell.fly.dev | Tablet-PWA lädt, Footer zeigt neue Version |
| https://hotdoc-backoffice.fly.dev | Backoffice lädt |
| https://hotdoc-apk.fly.dev/apk-info.json | currentVersion = neue Version |

**Browser-Cache leeren** wenn nötig: Strg+Shift+R.

---

## Was war früher mühsam?

| Damals | Heute |
|---|---|
| `pnpm build` für 4 Apps lokal | CI macht das |
| `flyctl deploy` 4× tippen | 1× `git push` |
| Tailscale + Windows-JDK Build-Probleme | Linux-Runner, kein Problem |
| APK manuell sideloaden auf 5 Tablets | UpdateBanner triggert 1-Klick-Auto-Update |
| „Hab ich PWA vergessen?" | „nope, deploy.yml deployed alles auf push" |

---

## Code-Pointer

- Deploy-Workflow: `.github/workflows/deploy.yml`
- APK-Release-Workflow: `.github/workflows/release-apk.yml`
- CI-Secrets-Setup: `.github/CI-SETUP.md`
- Signing-Setup: `apps/pwa/android/SIGNING.md`
- Lokales Release-Helper-Skript (deprecated): `scripts/release-apk.ps1`
