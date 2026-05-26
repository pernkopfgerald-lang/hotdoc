# syBOS-API Anbindung · Setup-Anleitung

**Status:** Anleitung für FF-Funktionär (syBOS-Admin der Dienststelle)
**Empfänger:** Gerald Pernkopf (gerald.pernkopf@ff-eberstalzell.at)

## Was wir brauchen aus syBOS

HotDoc nutzt die syBOS-Read-API (`https://sybos.ooelfv.at/sybServices`) für:

- **Personalliste** — aktive Mitglieder mit Dienstgrad, Atemschutz-Tauglichkeit, Funktionen
- **Material-Stammdaten** — Inventarliste (Geräte, AS-Geräte, Fahrzeuge)
- **Dienststelle-Stammdaten** — Funkrufnamen-Mapping, Standorte

Die API wird **nur lesend** angesprochen — HotDoc schreibt nichts zurück nach syBOS.

## Schritt-für-Schritt im syBOS-Backend

1. **Anmelden in syBOS** → `https://sybos.ooelfv.at` → mit Funktionär-Account
2. Linke Navigation → **Portal → Zugriffstoken (API)**
3. Neuen Token anlegen mit dem grünen „+"-Button oben links

### Token-Konfiguration (siehe Screenshot)

| Feld | Wert |
|---|---|
| **Art** | `API` |
| **Benutzer** | dein syBOS-Benutzer (z. B. `pernkopf.gerald`) |
| **Dienststelle** | `FF Eberstalzell` |
| **Domain** | leer lassen — wir nutzen `Server-IPs` |
| **Server-IPs (v4)** | siehe unten ⬇️ |
| **Einsätze** | `nur eigene` |
| **Veranstaltungen** | (egal — wir greifen nicht zu) |
| **Material** | `alle` (FF-eigener Bestand) |
| **Dienststelle** | `nur eigene` |
| **Lehrgänge** | (egal — wir greifen nicht zu) |
| **Bemerkung** | `HotDoc-Tablet-Anbindung — Gerald Pernkopf` |

### Server-IPs eintragen

HotDoc-API läuft auf fly.io. Die ausgehende Verbindung kommt von einer
Fly-Edge-IP. Trag diese im Feld **Server-IPs (v4)** ein:

```
185.51.129.74
```

> Stand 2026-05. Wenn syBOS später `Fehler: Falsche IP Adresse` meldet, einfach
> die `fly-client-ip` aus den Logs auslesen und in syBOS aktualisieren.
> Im Notfall lässt sich auch eine zweite IP per Komma anhängen.

### Speichern

Nach **Speichern** wird das Token in syBOS angezeigt — es ist 64 Zeichen lang.
**Sofort kopieren** — syBOS zeigt es nur einmal.

## Token in HotDoc setzen

Auf dem Entwickler-PC (oder von wo aus deployt wird):

```powershell
flyctl secrets set -a hotdoc-api `
  SYBOS_API_URL='https://sybos.ooelfv.at/sybServices' `
  SYBOS_TOKEN='HIER-DAS-64-ZEICHEN-TOKEN-EINFÜGEN'
```

Fly startet die API-Machine automatisch neu. Nach ca. 30 Sekunden ist das
Token aktiv.

## Smoke-Test

Im Backoffice unter **Verwaltung → Personal**:

1. Auf „**Jetzt aus syBOS synchronisieren**" klicken
2. Erwartetes Ergebnis: `✓ ~45 Personen · ~120 Material · ~2.000 ms`
3. Bei Fehler `Falsche IP Adresse` → die IP aus dem Fehler kopieren, in syBOS
   ergänzen, erneut testen

## Cron-Job

Sobald der manuelle Sync klappt, läuft der **tägliche Auto-Sync** automatisch
um 04:00 Uhr (cron in `apps/api/src/workers/sybos-sync.ts`).

## Sicherheits-Hinweis

- Das Token erlaubt **nur Lese-Zugriff** auf FF-eigene Daten (durch
  „nur eigene"-Einstellung in syBOS)
- Bei Personalwechsel (Gerald nicht mehr Funktionär) → Token in syBOS auf
  einen anderen Funktionär umbenennen oder neu vergeben
- Token nach Verdacht auf Kompromittierung sofort in syBOS deaktivieren und
  via `fly secrets unset` auch in fly.io entfernen

## Fallback wenn syBOS nicht erreichbar

HotDoc hat einen lokalen Cache der letzten erfolgreichen Synchronisation. Wenn
syBOS für einen Einsatz mal offline ist, läuft das Tablet mit den
**zuletzt geladenen Personen** weiter. Anzeige im Backoffice unter
**Verwaltung → Schnittstellen** als _„syBOS · TEILWEISE — Fallback aktiv"_.
