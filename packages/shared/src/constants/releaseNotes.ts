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
    version: "0.1.13",
    date: "2026-06-03",
    title: "Übung-Feinschliff, Karte stabil & GPS-Adresse",
    bullets: [
      "Übung wird jetzt AUCH in der Fahrzeug-Ansicht klar als ÜBUNG (grün) dargestellt — nicht mehr als roter Einsatz.",
      "Karte: Kacheln bauen jetzt sauber auf — die Aktualisierung wartet, bis die Einblend-Animation fertig ist (kein zerstückeltes Kartenbild mehr).",
      "Einsatzort am Fahrzeug-Tablet: neuer GPS-Knopf — am Einsatzort antippen, die echte Adresse wird automatisch übernommen (Workflow: leer anlegen, vor Ort GPS).",
      "Übung anlegen: ein eingetragener Übungsleiter wird automatisch Fahrzeug-Kommandant.",
      "Übung anlegen: der gewählte Übungstyp wird automatisch als erster Auftrag übernommen.",
      "Neuen Einsatz/Übung anlegen: öffnet sofort (kein Warten mehr auf den nächsten Abgleich).",
    ],
  },
  {
    version: "0.1.12",
    date: "2026-06-03",
    title: "Test-Sprint-Fixes: PDF, Karte, Übung, Florian-Editor",
    bullets: [
      "PDF: Beteiligte Stellen (Polizei, ÖAMTC …) und sonstige Feuerwehren werden jetzt korrekt im Einsatzbericht angezeigt — Mapper-Bug bei alten Daten behoben.",
      "PDF: Einsatzart steht jetzt als Wert in einer Zeile statt 28 Vordruck-Checkboxen.",
      "PDF: Die Box 'Meldung von der Einsatzleitung' zeigt jetzt die Einsatzchronik (Zeit · Quelle · Eintrag).",
      "Karte: Lagekarte und Anfahrt-Karte bauen sauber auf (ResizeObserver), Standard-Ansicht ist jetzt HYBRID (Foto + Beschriftung).",
      "Florian-Zentrale: Einsatzort lässt sich jetzt direkt im Editor korrigieren (vorher nur am Fahrzeug-Tablet).",
      "Florian-Zentrale: syBOS-Statistik und Sachbearbeiter-Block sind standardmäßig aufgeklappt — werden seltener übersehen.",
      "Florian-Zentrale: Haupttätigkeit wird aus dem Einsatzstichwort/der Einsatzart abgeleitet (Ölspur → 'Ölspur / Ölbindung', VU → 'Verkehrsunfall …', …).",
      "Florian-Zentrale: Übungs-Einsätze sind klar gekennzeichnet (ÜBUNG-Banner + grüne Theme statt blau).",
      "Lotsendienst-Einsätze tauchen nicht mehr als Hauptbericht in der Florian-Ansicht auf — leben nur als Fahrzeugbericht.",
      "Abschluss: bei Übungen entfällt die Verrechenbar-Frage.",
      "Übung anlegen: Thema, Auftraggeber und Adresse sind nicht mehr Pflicht — die Übung lässt sich sofort anlegen und Personal erfassen.",
      "BerichtPage: Einsatzchronik direkt unter dem Mannschafts-Block (vor Geräte/Auftrag/Karte).",
      "Backoffice: Sonstige Feuerwehren in der Florian-Variante kommen jetzt aus der CRUD-Liste (TMB Sattledt, FF Lambach …) statt aus hardcodierten Kürzeln.",
      "syBOS-Listen ergänzt: Arbeitsauftrag (Technisch), Täuschungsalarm (Brand).",
      "Robust: alte Berichte mit altem Chronik-Schema werden im PDF und in der App sauber dargestellt.",
      "Aufräumen: Diagnose-Hilfsskript entfernt, schlankere Helfer-Funktionen.",
    ],
  },
  {
    version: "0.1.11",
    date: "2026-06-03",
    title: "Hotfix: Florian-Login-Absturz + Reaktivieren im Fahrzeug-Archiv",
    bullets: [
      "Behebt einen Absturz beim Öffnen der Florian-Zentrale (Recovery-Screen) — Chronik-Einträge ohne Text (z. B. reine Foto-Einträge) führten zum Fehler.",
      "Jedes Fahrzeug kann einen vorzeitig abgeschlossenen Bericht jetzt direkt im eigenen Archiv reaktivieren (vorher nur über die Florianstation).",
    ],
  },
  {
    version: "0.1.10",
    date: "2026-06-03",
    title: "Einsatz-Test-Härtung, Foto-Chronik & Nacht-Tauglichkeit",
    bullets: [
      "syBOS-Statistik im Florian-Editor: technische Statistik (Ursache, Tätigkeiten, Personen-/Tierrettung) und Brand-Statistik mit Objekt-Datenbank + geführtem Brand-Abschluss-Wizard — Werte landen direkt im Einsatzbericht",
      "Foto in der Einsatzchronik: direkt am Tablet fotografieren, funktioniert auch offline (wird gesendet sobald Netz). Im Bericht klein (4×3 cm) plus großer Foto-Anhang hinten (9×12 cm, 4 Fotos pro Seite)",
      "Autobahn-Alarme: A1/A8/A25-Kilometermarker werden korrekt verortet statt am falschen Ort (z. B. Salzburg-Stadt) zu landen",
      "Einsatzadresse am Fahrzeug-Tablet korrigierbar — wenn der BlaulichtSMS-Geocoder daneben liegt, ändert der Kdt direkt und es spiegelt zur Florianstation",
      "Abschluss: 'Verrechenbar?'-Markierung (kaskadiert auf alle Fahrzeugberichte) + Einsatzleiter-Kennzeichnung beim Fahrzeug-Kdt",
      "Nacht-Tauglichkeit: getippte/gewählte Werte sind im Dunkel-Modus jetzt klar lesbar (vorher dunkelblau auf fast-schwarz)",
      "Akku-Schonung: alle Live-Abfragen und das GPS pausieren, sobald das Tablet im Standby ist — und laufen beim Aufwecken sofort weiter",
      "Tablet-Bedienung: Schnellaktionen als große 2×2-Kacheln, ein einziges Kilometer-Feld (Auto-Wert vorausgefüllt) statt zwei, Atemschutz-Stepper mit größeren Tasten",
      "Robustheit: Offline-Ausgangskorb (kein verlorener Bericht im Funkloch), automatischer Entwurf bei Tablet-Neustart, klarere Fehlermeldungen statt weißem Bildschirm",
      "Neues Hilfe-Sheet im Florian-Header mit Suche und 8 Themen-Kategorien",
      "Schnellere, schlankere App durch Aufräumen unter der Haube",
    ],
  },
  {
    version: "0.1.7",
    date: "2026-05-31",
    title: "Florianstation-Upgrade + Fahrzeugbericht-Vordruck",
    bullets: [
      "Florianstation Lagekarte: Klick auf Status-Card lässt Marker pulsieren + Mannschafts-Details (Fahrer/Kdt/Besatzung) klappen unter der Card auf",
      "Drei Zoom-Tasten an beiden Karten: Lagebild (200m um Einsatzort), Gesamt (alle Fahrzeuge im Frame), Zentrieren",
      "Pop-Out-Fenster für 2. Bildschirm via /florian-map — eigene Live-Karte mit Polling, perfekt für Lageeinweisung am Beamer",
      "Lagekarte vergrößert (500px statt 320px)",
      "Florian-Position korrigiert: war 5 km zu weit nördlich (Heischbach), jetzt echte Solarstraße 1 — wirkt sich auch auf KM-Berechnung aller Fahrzeuge aus",
      "Fahrzeugbericht-PDF (Anhang + standalone) komplett überarbeitet auf das Original-Vordruck-Layout mit FF-Wappen, 4 Tabellen, Footer-Balken",
      "Neuer Bericht öffnet sich automatisch (war Bug: kam als Tab aber blieb auf altem Einsatz)",
      "Florian-Editor: 'Meldung Einsatzleitung'-Feld entfernt — Text kommt jetzt direkt in 'Einsatzbericht / Chronologie'",
      "GPS → Adresse: Reverse-Geocoding via Photon. Nur wenn keine Adresse (Autobahn, Feld) → 'GPS lat,lng'",
      "Pflichtbereich + Einsatzzone werden automatisch gesetzt wenn der Einsatzort im Gemeindegebiet Eberstalzell liegt — beim BlaulichtSMS-Alarm UND beim manuellen Anlegen",
    ],
  },
  {
    version: "0.1.6",
    date: "2026-05-31",
    title: "Auto-Update via Release-Builds",
    bullets: [
      "Erste signierte Release-APK mit dauerhaftem Keystore — ab jetzt kein Deinstallieren mehr bei Updates nötig",
      "UpdateBanner pollt alle 6 h und bietet 1-Klick-Update direkt aus der App: APK wird lokal gedownloadet (mit Progress-Bar), Android-System-Dialog 'Aktualisieren?' erscheint, fertig",
      "Custom ApkInstaller-Capacitor-Plugin (Java) — ersetzt den Browser-Umweg",
      "Beim ersten Install (von v0.1.5-debug auf v0.1.6-release) noch einmalig manuell deinstallieren wegen Signing-Key-Wechsel. Ab v0.1.7+ läuft alles via Banner",
    ],
  },
  {
    version: "0.1.5",
    date: "2026-05-31",
    title: "FCM Push aktiv (HTTP v1)",
    bullets: [
      "Firebase Cloud Messaging in der APK aktiv — google-services.json eingebunden, firebase-messaging-Dependency gezogen, Tablets registrieren sich auto beim Start",
      "Backend auf FCM HTTP v1 API umgestellt (OAuth2 + Service-Account). Legacy-API war seit Juni 2024 von Google abgeschaltet — Neuumstellung war zwingend",
      "Schnittstellen-Health zeigt FCM v1-Status (statt Legacy-Server-Key)",
      "Trouble-Shooting-Doku in apps/pwa/android/FCM-SETUP.md aktualisiert",
    ],
  },
  {
    version: "0.1.4",
    date: "2026-05-31",
    title: "Schnellerer Disposition + Roter Pop-Up Neuer Einsatz",
    bullets: [
      "Polling-Intervall von 30 s auf 5 s reduziert — Disposition von der Florianstation ist binnen weniger Sekunden am Fahrzeug-Tablet sichtbar (vorher bis zu 30 s Lag)",
      "Rotes Pop-Up 'Neuer Einsatz' mit Backdrop-Blur, wenn während eines laufenden Einsatzes ein weiterer Alarm reinkommt — der Fahrzeugkdt entscheidet bewusst, der bisherige Einsatz bleibt als Tab erhalten",
      "Bug-Fix Stale-Closure: der Pop-Up-Trigger sah vorher nur den initialen leeren Einsatz-Stand — jetzt zuverlässig aktuell",
    ],
  },
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
