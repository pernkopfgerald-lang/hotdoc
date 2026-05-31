# release-apk.ps1 — HotDoc Release-APK Build & Deploy
#
# Voraussetzungen (einmalig pro Maschine):
#   - JAVA_HOME zeigt auf JDK 17/21 (Android Studio JBR)
#   - apps/pwa/android/keystore.properties ist erstellt mit:
#       storeFile=../../hotdoc.keystore
#       storePassword=...
#       keyAlias=hotdoc
#       keyPassword=...
#   - hotdoc.keystore liegt im Repo-Root (gitignored)
#
# Pro Release:
#   1. Version in apps/pwa/src/version.ts + android/app/build.gradle bumpen
#   2. RELEASE_NOTES in packages/shared/src/constants/releaseNotes.ts ergänzen
#   3. Dieses Skript laufen lassen
#   4. APK landet in deploy/apk/apks/hotdoc-vX.Y.Z-release.apk
#   5. apk-info.json + api/config.ts werden automatisch gebumped
#   6. flyctl deploy --config fly.apk.toml startet den Distribution-Update

param(
  [Parameter(Mandatory=$true)][string]$Version,
  [switch]$SkipDeploy,
  [switch]$KeepDebug
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $RepoRoot

Write-Host "=== HotDoc Release-APK $Version ===" -ForegroundColor Cyan

# 1. keystore.properties Check
$keystorePropsPath = Join-Path $RepoRoot "apps\pwa\android\keystore.properties"
if (-not (Test-Path $keystorePropsPath)) {
  Write-Host "FEHLER: keystore.properties fehlt." -ForegroundColor Red
  Write-Host "Siehe apps/pwa/android/SIGNING.md fuer Einmal-Setup." -ForegroundColor Yellow
  exit 1
}

# 2. Build PWA
Write-Host "[1/6] PWA bauen..." -ForegroundColor Cyan
pnpm --filter @hotdoc/shared build
if ($LASTEXITCODE -ne 0) { throw "Shared-Build fehlgeschlagen" }
pnpm --filter @hotdoc/pwa build
if ($LASTEXITCODE -ne 0) { throw "PWA-Build fehlgeschlagen" }

# 3. Capacitor Sync
Write-Host "[2/6] Capacitor sync..." -ForegroundColor Cyan
Set-Location (Join-Path $RepoRoot "apps\pwa")
pnpm cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor-Sync fehlgeschlagen" }

# 4. Gradle Release Build
Write-Host "[3/6] gradle assembleRelease..." -ForegroundColor Cyan
Set-Location (Join-Path $RepoRoot "apps\pwa\android")
$env:GRADLE_OPTS = "-Djava.nio.channels.spi.SelectorProvider=sun.nio.ch.WindowsSelectorProvider"
./gradlew assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle-Release-Build fehlgeschlagen" }

$apkSource = Join-Path $RepoRoot "apps\pwa\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSource)) {
  throw "Erwartete APK nicht gefunden: $apkSource"
}

# 5. APK kopieren + apk-info.json updaten
Write-Host "[4/6] APK in deploy/apk/apks/ kopieren..." -ForegroundColor Cyan
Set-Location $RepoRoot
$apkTargetName = "hotdoc-v$Version-release.apk"
$apkTarget = Join-Path $RepoRoot "deploy\apk\apks\$apkTargetName"
Copy-Item $apkSource $apkTarget -Force
Copy-Item $apkSource "$env:USERPROFILE\Desktop\HotDoc-release-v$Version.apk" -Force

# Alte Debug-APKs aufraeumen sofern nicht ausdruecklich behalten
if (-not $KeepDebug) {
  Get-ChildItem -Path (Join-Path $RepoRoot "deploy\apk\apks") -Filter "*-debug.apk" -ErrorAction SilentlyContinue |
    ForEach-Object { Write-Host "  entferne $($_.Name)"; Remove-Item $_.FullName -Force }
}

Write-Host "[5/6] apk-info.json updaten..." -ForegroundColor Cyan
$apkInfoPath = Join-Path $RepoRoot "deploy\apk\apk-info.json"
$apkInfo = Get-Content $apkInfoPath -Raw | ConvertFrom-Json
$apkInfo.currentVersion = $Version
$apkInfo.apkUrl = "/$apkTargetName"
$apkInfo.publishedAt = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
$apkInfo | ConvertTo-Json -Depth 5 | Set-Content $apkInfoPath -Encoding UTF8

# 6. Deploy
if ($SkipDeploy) {
  Write-Host "[6/6] -SkipDeploy gesetzt — Deploy uebersprungen." -ForegroundColor Yellow
  Write-Host "Manuell: flyctl deploy --config fly.apk.toml --remote-only" -ForegroundColor Yellow
} else {
  Write-Host "[6/6] flyctl deploy fly.apk.toml..." -ForegroundColor Cyan
  flyctl deploy --config fly.apk.toml --remote-only --strategy immediate
  if ($LASTEXITCODE -ne 0) { throw "fly.apk deploy fehlgeschlagen" }
}

Write-Host ""
Write-Host "=== Release-APK v$Version live ===" -ForegroundColor Green
Write-Host "URL: https://hotdoc-apk.fly.dev/$apkTargetName" -ForegroundColor Green
Write-Host ""
Write-Host "Naechste Schritte:" -ForegroundColor Cyan
Write-Host "  - apps/api/src/routes/config.ts: app-version eintragen (apkUrl + Notes)" -ForegroundColor Gray
Write-Host "  - packages/shared/src/constants/releaseNotes.ts: Eintrag hinzufuegen" -ForegroundColor Gray
Write-Host "  - apps/pwa/src/version.ts: APP_VERSION bumpen" -ForegroundColor Gray
Write-Host "  - apps/pwa/android/app/build.gradle: versionCode + versionName bumpen" -ForegroundColor Gray
Write-Host "  - flyctl deploy api + pwa + backoffice fuer Health-Status + Banner" -ForegroundColor Gray
