# HotDoc → syBOS Autofill — Design

**Datum:** 2026-06-03
**Status:** Design freigegeben (Brainstorming), Spec zur Review
**Variante:** ② Browser-Autofill-Helfer (maximal automatisiert, unter Aufsicht)

---

## 1. Kontext & Problem

Der Schriftführer der FF Eberstalzell überträgt die Einsatzdaten heute **manuell**
von HotDoc in syBOS (offizielles LFV-OÖ-Register). Das ist mühsam und fehleranfällig.

**Entscheidender Befund (recherchiert im syBOS-API-Handbuch v3.02, Feb 2021, +
Wiki-Demos `syBOS_API_CMS_wiki/`):**

> Die syBOS-API ist **ausschließlich lesend**. Handbuch §1.1: *„Dieses Dokument
> beschreibt das **Abfragen** von syBOS-Daten."* Alle Schnittstellen (Einsatz,
> Material, Abteilung, …) arbeiten nur über GET-Parameter + Platzhalter. Es gibt
> **kein** `POST` / `Import` / `Upload` / „anlegen/speichern/übermitteln". Das
> einzige „anlegen" im Handbuch betrifft das Anlegen eines API-**Zugriffstokens**,
> nicht das Schreiben von Einsätzen.

**Konsequenz:** Ein automatischer Schreibweg über die API ist unmöglich. Einsätze
entstehen in syBOS über die Alarmkette und werden dort **manuell** vervollständigt.
„HotDoc → syBOS" ist damit kein API-Thema, sondern: das manuelle Übertragen so weit
wie möglich automatisieren — **unter Aufsicht des Schriftführers**.

Die bestehende, dokumentierte Architektur (`docs/sybos-setup.md`) bleibt gültig:
*„Die API wird nur lesend angesprochen — HotDoc schreibt nichts zurück nach syBOS."*
Dieses Feature schreibt ebenfalls **nicht** über die API, sondern befüllt die
syBOS-Weboberfläche lokal im Browser des Schriftführers.

## 2. Ziel & Erfolgskriterien

- **Ziel:** Der Schriftführer öffnet die syBOS-Einsatz-Erfassungsmaske, klickt
  einmal „aus HotDoc füllen", prüft die vorbefüllten Felder und speichert in syBOS.
  So wenige manuelle Copy-Paste-Schritte wie möglich.
- **Erfolg:** Für einen typischen Einsatz werden ≥ 80 % der syBOS-Felder automatisch
  korrekt vorbefüllt; der Rest ist klar als „nicht gefunden" markiert.
- **Wartbarkeit:** Ein syBOS-Layout-Update erfordert nur das Nachpflegen **einer**
  Zuordnungs-Liste, keinen Code-Umbau und keine Neuinstallation der Erweiterung.

## 3. Nicht-Ziele (bewusst ausgeklammert)

- Kein Schreiben über die syBOS-API (technisch unmöglich).
- **Kein Auto-Speichern** in syBOS — der Mensch prüft und klickt selbst auf Speichern.
  Der offizielle Datensatz bleibt unter menschlicher Kontrolle.
- Keine Übermittlung von Daten an Dritte. Die Erweiterung spricht nur mit dem
  eigenen HotDoc-Backend und liest die syBOS-Maske lokal im Browser.
- Keine BlaulichtSMS-/syBOS-Schreibzugriffe (Tabu-Recap des Projekts bleibt gewahrt).

## 4. Architektur — drei Bausteine

### 4.1 HotDoc-Export-Endpoint (Backend, lesend)

Neuer Endpoint in `apps/api`:

```
GET /api/einsaetze/:id/sybos-export      (Auth: funktionaer/admin)
```

Liefert die HotDoc-Einsatzdaten als JSON, gemappt auf **stabile, interne
Logik-Keys** (NICHT auf syBOS-DOM-Selektoren — die DOM-Zuordnung macht die
Erweiterung):

```json
{
  "einsatzId": "einsatz:…",
  "felder": {
    "einsatzart":        "Brandeinsatz",
    "einsatzort":        "Autobahn A1 - Kilometer 201, 4653 Eberstalzell",
    "alarmierung":       "2026-06-03T13:59:00+02:00",
    "einsatzende":       "2026-06-03T14:49:00+02:00",
    "mannschaftAnzahl":  9,
    "einsatzleiter":     "Mustermann Max",
    "taetigkeiten":      ["…"],
    "technischeStatistik": { … },
    "brandStatistik":      { … }
  }
}
```

Für die Einsatz-Auswahl im Popup wird eine Liste der letzten Einsätze benötigt
(vorhandener Listen-Endpoint wiederverwenden, ggf. um ein schlankes
`?fields=id,einsatzart,alarmierung` ergänzen).

### 4.2 Browser-Erweiterung (Edge/Chrome, Manifest V3)

- **Einstellungen (einmalig):** HotDoc-Basis-URL + persönlicher API-Token
  (in `chrome.storage.local`). Der Token wird vom Nutzer selbst eingetragen.
- **Popup:** holt die letzten HotDoc-Einsätze → Nutzer wählt einen aus.
- **Content-Script** (läuft per `host_permissions` nur auf der syBOS-Domain,
  z. B. `https://sybos.ooelfv.at/*`):
  1. lädt `sybos-export` des gewählten Einsatzes + die Mapping-Konfig,
  2. findet die Formularfelder über die Mapping-Locator (s. 4.3),
  3. setzt die Werte **und dispatcht `input`/`change`-Events**, damit syBOS' JS
     die Eingabe registriert (sonst „leeres" Speichern),
  4. markiert befüllte Felder visuell (grüner Rahmen),
  5. zeigt eine **Diagnose**: „17 von 19 Feldern befüllt — nicht gefunden: A, B".
- **Kein Submit-Knopf.** Der Nutzer prüft und speichert in syBOS selbst.

### 4.3 Mapping-Konfig (`sybos-field-map.json`)

Eine Liste pro syBOS-Feld:

```json
{
  "sybosFeld": "einsatzort",
  "locator": { "byLabel": "Einsatz-Ort", "inputType": "text" },
  "hotdocKey": "einsatzort",
  "transform": null
}
```

- **Locator-Strategie (robust → fragil):**
  1. **Beschriftungstext + nächstes Eingabefeld** (bevorzugt — überlebt ID-Änderungen),
  2. `name`/`id` als Fallback,
  3. CSS-Selektor als letzter Ausweg.
- `transform`: optionale Umrechnung (Datum-Format, Enum-Mapping HotDoc→syBOS-Code,
  z. B. Einsatzart-Schlüssel).
- **Auslieferung über den HotDoc-Server** (`GET /api/sybos-fieldmap`), damit ein
  syBOS-Update **nur** ein Update dieser Datei am Server bedeutet — die Erweiterung
  muss nicht neu installiert werden.

## 5. Datenfluss

```
syBOS-Erfassungsmaske offen
        │
        ▼
[Erweiterung-Popup] ── holt letzte Einsätze ──▶ HotDoc API
        │  Nutzer wählt Einsatz
        ▼
[Content-Script] ── GET /sybos-export + GET /sybos-fieldmap ──▶ HotDoc API
        │  füllt Felder, dispatcht Events, markiert grün, Diagnose
        ▼
[Mensch prüft] ──▶ klickt in syBOS auf „Speichern"
```

## 6. Resilienz gegen syBOS-Updates

- Zuordnung in **serverseitiger** Konfig statt im Code.
- **Label-basierte** Locator als Primärstrategie.
- **Diagnose-Modus** zeigt nach jedem syBOS-Update sofort, welche Felder nicht mehr
  gefunden wurden → gezieltes Nachpflegen statt Rätselraten.
- Ablauf bei neuer syBOS-Version: Maskenexport neu ziehen → `sybos-field-map.json`
  am Server anpassen → fertig.

## 7. Sicherheit & Datenschutz

- API-Token nur in `chrome.storage.local`, nie im Code, nicht an Dritte.
- Kommunikation ausschließlich mit dem eigenen HotDoc-Backend + lokales Lesen/
  Schreiben der syBOS-DOM im Browser des Nutzers.
- **Aufsicht:** fill-only, Mensch bestätigt → rechtlich „der Schriftführer erfasst
  seine eigenen Daten schneller", kein autonomer Bot, kein API-Schreibzugriff.
- Personaldaten verlassen das FF-Ökosystem nicht.

## 8. Felder-Umfang

Alle HotDoc-Werte, die ein syBOS-Pendant haben. HotDoc liefert pro Einsatz u. a.:
Einsatzart/-stichwort, Einsatzort (+ Koordinaten), Alarmierungs-/Endzeit,
Mannschaftsstärke, Einsatzleiter, Fahrzeuge, Tätigkeiten/Chronik, Ölbindemittel,
beteiligte Stellen, sonstige Feuerwehren, technische Statistik, Brand-Statistik.

> **Implementierungs-Input (vom Schriftführer):** Die exakte Feld-Zuordnung kann
> erst gebaut werden, wenn die **HTML-Struktur der aktuellen syBOS-Einsatz-
> Erfassungsmaske** (alle Reiter) vorliegt — über „Untersuchen"/Quelltext oder
> vollständige Screenshots der Maske.

## 9. Fehlerbehandlung

- Token fehlt/ungültig → klare Meldung im Popup („HotDoc-Token in den Einstellungen
  hinterlegen").
- Einsatz nicht ladbar (Netzwerk/401) → Meldung, kein stilles Scheitern.
- Feld nicht gefunden → erscheint in der Diagnose, wird nicht still übersprungen.
- Mehrseitige Maske (Reiter) → „füllen" pro sichtbarem Reiter; Diagnose pro Reiter.
- Dropdown-/Autocomplete-Felder → Wert-Treffer über `transform`; bei Nichttreffer
  in Diagnose listen.

## 10. Test

- **Unit (HotDoc-Backend):** `sybos-export`-Mapping + Transforms (Datum, Enum) gegen
  Beispiel-Einsätze.
- **Manuell:** Erweiterung gegen die echte syBOS-Maske mit einem Test-Einsatz; alle
  Reiter durchgehen; Diagnose-Ausgabe prüfen.

## 11. Verteilung

Für den Einzelnutzer (Schriftführer) am einfachsten: **entpackte Erweiterung**
(Edge → Entwicklermodus → „Entpackte Erweiterung laden"). Der Ordner wird geliefert,
einmal geladen. Spätere Option: Paketierung / Edge-Add-on, falls mehrere Nutzer.

## 12. Offene Punkte / Annahmen

- syBOS-Domain für `host_permissions` exakt bestätigen (vermutlich
  `sybos.ooelfv.at` / `*.sybos.net`).
- Mapping wird gegen die **aktuelle** Maske gebaut (Nutzerentscheidung); bei neuer
  syBOS-Version nur die Konfig nachziehen.
- Annahme: der Einsatz existiert in syBOS bereits (Alarmkette) bzw. wird vom
  Schriftführer angelegt; die Erweiterung füllt die geöffnete Maske, sie navigiert
  syBOS nicht selbst.
