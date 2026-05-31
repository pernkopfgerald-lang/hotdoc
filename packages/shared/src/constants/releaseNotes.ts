/**
 * HotDoc — Release-Notes der aktuellen App-Version + Historie.
 *
 * Wird im About-Bildschirm der PWA und im Backoffice + Landing-Page
 * angezeigt. Neue Eintraege oben hinzufuegen (DESC nach Datum).
 *
 * Konvention pro Eintrag:
 *  - version: semver-String
 *  - date: ISO-Datum (YYYY-MM-DD)
 *  - title: Kurz-Titel (Codename / Themenklammer)
 *  - bullets: Liste der Aenderungen — kurze Praesens-Saetze, ein Bullet
 *    pro echtem Feature/Fix, keine Internas (Refactorings/Test-Updates).
 */

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  bullets: string[];
}

export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: "0.1.3",
    date: "2026-05-31",
    title: "Solo-Tablet + KM-Automatik + About-Seite",
    bullets: [
      "Solo-Tablet-Workflow: Im Abschluss-Modal die Option 'Einsatzbericht ebenfalls jetzt abschließen' — kein Florianstation-Schritt nötig wenn nur ein Fahrzeug am Einsatz war",
      "KM-Automatik: Strecke FF-Haus ↔ Einsatzort × 2, primär über GraphHopper-Route, sonst Luftlinie × 1,3. Fahrzeugkdt kann manuell überschreiben — der manuelle Wert gewinnt immer",
      "Editor zeigt Auto-Wert und Eingabe-Feld nebeneinander",
      "WAS-Box-Probealarm-Filter: samstägliche Probealarme (11:50-13:15, Pattern 'WAS-Box Probealarm') werden nicht mehr als Einsatz angelegt",
      "About-Seite in PWA + Backoffice + APK-Landing — mit Entwickler-Kontakt, Nutzungsbedingungen und Release-Notes-Historie",
    ],
  },
  {
    version: "0.1.2",
    date: "2026-05-31",
    title: "Bug-Fixes Mannschaft + Uhrzeit",
    bullets: [
      "Person aus Mannschaft/Fahrer/Kdt rauslöschen (rotes ×)",
      "Uhrzeit bis manuell editierbar — beim Abschluss nicht überschrieben",
      "Topbar: 'Einsatzzentrale' statt 'Fahrzeugbericht' auf Florianstation",
      "Eigenständiges Fahrzeugbericht-PDF im Papier-Original-Layout (Vorderseite Stammdaten + Mannschaft + Geräte, Rückseite Tätigkeitsbericht + Einsatzchronik)",
      "Capacitor-Webview: API-URL-Auflösung repariert — Erstes Login geht jetzt durch",
    ],
  },
  {
    version: "0.1.1",
    date: "2026-05-31",
    title: "Capacitor + Native + UpdateBanner",
    bullets: [
      "Echte Android-APK mit Capacitor — kein Service-Worker-Cache mehr",
      "Auto-Register beim Boot — Tablet erscheint im Backoffice unter 'Registrierte Geräte'",
      "Update-Banner pollt alle 6 h, Chevron-Klick zeigt komplette Release-Notes",
      "APK-Download-Landing-Page hotdoc-apk.fly.dev mit Version und Notes",
      "Backoffice: Geräte-Tab + App-Version-Tab + Schnittstellen-Health zeigt FCM-Status",
      "FCM-Push-Service (Skeleton) im BlaulichtSMS-Poller — wartet auf FCM-Server-Key",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-05-31",
    title: "UX-Sweep + Multi-Einsatz + Florianstation",
    bullets: [
      "Florian-Editor mit kollabierbaren Sektionen, Auto-Save, dunkelblau für eingegebene Werte",
      "Karten-Klick auf Fahrzeug → Pulse-Animation + Detail-Panel + Vollbild-Toggle",
      "Backoffice-CRUD für 'Beteiligte Stellen' + 'Sonstige Feuerwehren'",
      "Multi-Einsatz pro Tablet — Tabs für parallele Einsätze",
      "Folge-Auftrag erbt Personal des laufenden Einsatzes",
      "PDF-Redesign mit Werten in dunkelblau, Chronik-Anhang, Fahrzeugberichte als eigene Seiten",
      "Florianstation Live-Positions-Map mit fix-Standort Feuerwehrhaus + Stale-Marker > 10 min",
      "PWA-Manifest fix für Android-Chrome-Install",
      "Inaktivitäts-Watchdog: Tablet-Hang nach Standby behoben",
    ],
  },
];
