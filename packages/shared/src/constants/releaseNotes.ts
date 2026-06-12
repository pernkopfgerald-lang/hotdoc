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
    version: "0.1.23",
    date: "2026-06-12",
    title: "Lagekarte zeigt parallele Einsatzorte",
    bullets: [
      "Bei Mehrfach-Lagen (z. B. Sturm) zeigt die Lagekarte in der Florian-Zentrale jetzt die Einsatzorte ALLER parallelen Einsätze als halbtransparente Pins — der aktive Einsatz bleibt der kräftige rote Pin. 'Gesamt' und das Auto-Lagebild nehmen alle Orte mit ins Bild.",
    ],
  },
  {
    version: "0.1.22",
    date: "2026-06-12",
    title: "Großes Robustheits- & Usability-Update (4-Personas-Audit)",
    bullets: [
      "Kein Datenverlust mehr: Eingaben in Florian-Zentrale und Fahrzeug-Tablet überleben jetzt Tab-Wechsel, Reload, Funkloch und parallele Speichervorgänge (lokale Entwürfe + automatische Wiederholung).",
      "Tab-X schließt nicht mehr ungefragt den ganzen Einsatz — der Abschluss-Dialog mit Prüfungen ist jetzt das einzige Tor, mit klarer roter Warnung.",
      "Abgeschlossene Berichte zeigen am Tablet eine eigene Abschluss-Ansicht mit Reaktivieren-Knopf; blockierte Übertragungen werden sichtbar gemacht und nach Reaktivierung automatisch nachgereicht.",
      "Echte fortlaufende Berichtsnummern (B26-001 / T26-001) werden beim Abschluss serverseitig vergeben und stehen auf dem PDF, in der Abschluss-Quittung und im Archiv.",
      "PDF-Fixes: 'Lage unter Kontrolle'/'Brand aus' erscheinen jetzt wirklich im PDF, Geräte in Klartext, Rechnungsadresse beim Verrechenbar-Block, Foto-Anhang passt sicher auf A4.",
      "Bedienbarkeit: alle Knöpfe der Berichtsmaske mindestens daumengroß (44 px), Einsatz-Tabs zeigen den Einsatzort, Personenliste größer, verständliche Fehlermeldungen mit Handlungsanweisung.",
      "Backoffice: Autosave der Florianstation löscht keine fremden Felder mehr, PDF/Spickzettel direkt im Bericht-Detail, Warnung bei ungespeicherten Änderungen.",
    ],
  },
  {
    version: "0.1.21",
    date: "2026-06-05",
    title: "Lotsendienst-Bericht im vollen Format",
    bullets: [
      "Der Lotsendienst-Bericht hat jetzt — wie Einsatz- und Übungsbericht — den vollen Charakter: pro Fahrzeug Kommandant/Kraftfahrer/Mannschaft mit Funktion, Geräte, Chronik und je-Fahrzeug-Anhangblätter. Auftraggeber, Route und der Verrechnungs-Block bleiben erhalten (Lotsendienst ist verrechenbar).",
    ],
  },
  {
    version: "0.1.20",
    date: "2026-06-03",
    title: "Größere, besser lesbare Schrift",
    bullets: [
      "Alle Schriften in der Tablet-Ansicht um 25 % vergrößert — besser lesbar mit Handschuhen, in der Sonne und unter Stress.",
      "Schriftart auf die System-Schrift umgestellt (auf den Android-Tablets Roboto): maximal lesbar und immer offline verfügbar, kein Google-Fonts-Download im Funkloch mehr nötig.",
      "Stärkere Text-Kontraste (sekundäre/tertiäre Labels deutlich dunkler bzw. heller) für bessere Lesbarkeit.",
    ],
  },
  {
    version: "0.1.19",
    date: "2026-06-03",
    title: "Übungsbericht im Einsatzbericht-Format",
    bullets: [
      "Der Übungsbericht hat jetzt den vollen Einsatzbericht-Charakter: pro Fahrzeug klar aufgelistet wer welche Funktion hatte (Kommandant, Kraftfahrer, Mannschaft) inkl. Atemschutz, dazu Geräte pro Fahrzeug, Übungschronik und je-Fahrzeug-Anhangblätter — grün als ÜBUNG gekennzeichnet, mit Thema und Übungsleiter im Kopf.",
    ],
  },
  {
    version: "0.1.18",
    date: "2026-06-03",
    title: "Geräte-Liste aus dem Backoffice",
    bullets: [
      "Die Geräte-Auswahl im Fahrzeugbericht zeigt jetzt genau die im Backoffice gepflegte Liste 'Geräte & Mittel pro Fahrzeug' — vorher war im Tablet eine fest verdrahtete Standardliste hinterlegt, die nicht zur Backoffice-Pflege passte. Änderungen im Backoffice wirken jetzt automatisch (ohne Netz: letzte bekannte Liste).",
    ],
  },
  {
    version: "0.1.17",
    date: "2026-06-03",
    title: "Reaktivierung & Übungs-Titel",
    bullets: [
      "Reaktivieren funktioniert jetzt vollständig: Wird ein abgeschlossener Einsatz wieder geöffnet, kann auch das Fahrzeug seinen Fahrzeugbericht wieder bearbeiten (z. B. Mannschaft nachtragen) — vorher konnte nur Florian den Bericht öffnen.",
      "Übung/Lotsendienst ohne erfasstes Thema zeigt im Kopf jetzt korrekt 'Übung' bzw. 'Lotsendienst' statt 'Einsatz'.",
    ],
  },
  {
    version: "0.1.16",
    date: "2026-06-03",
    title: "Karte: Kachel-Bug endgültig behoben",
    bullets: [
      "Lagekarte lädt jetzt ALLE Kacheln vollständig. Ursache war ein abgeschalteter basemap.at-Server (die Subdomains maps1–maps4 existieren nicht mehr) — dadurch ging jede zweite bis vierte Kachel ins Leere. Umgestellt auf den aktuellen Endpoint mapsneu.wien.gv.at.",
    ],
  },
  {
    version: "0.1.15",
    date: "2026-06-03",
    title: "Einsatzleiter im PDF & Karte komplett",
    bullets: [
      "Einsatzbericht-PDF: Das Feld 'Einsatzleiter' wird jetzt automatisch ausgefüllt — der als Einsatzleiter markierte Fahrzeug-Kommandant (Haken im Bericht) steht jetzt unten im Vordruck.",
      "Karte: Beim Aufklappen/Vollbild werden jetzt ALLE Kacheln sauber nachgeladen (vorher blieben Teile leer) — die Kartenebenen werden nach dem Größenwechsel neu gezeichnet.",
    ],
  },
  {
    version: "0.1.14",
    date: "2026-06-03",
    title: "Chronik kompakt, Adresse-Karte-Match & Texteingabe",
    bullets: [
      "Einsatzchronik im PDF jetzt platzsparend: ein Eintrag = eine Zeile (HH:MM Fahrzeug: Meldung), Fotos klein direkt dabei.",
      "Die separate Chronik-Anhang-Seite entfällt — die Chronik steht jetzt detailliert auf der Hauptseite (der große Foto-Anhang 9x12 bleibt).",
      "Einsatzort korrigieren bewegt jetzt auch die Lagekarte (Adresse wird geocoded, Karte springt zur neuen Position) — in Florian und am Fahrzeug-Tablet.",
      "Einsatzchronik-Eintrag per Texteingabe mit Autokorrektur (Diktat vorerst pausiert).",
    ],
  },
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
