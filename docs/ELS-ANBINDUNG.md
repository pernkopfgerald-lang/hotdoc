# ELS-Anbindung (Landes-Feuerwehrverband): Funkstatus, Fahrzeugposition, Einsatzstart

HotDoc kann die ELS-Schnittstelle des Oö. Landes-Feuerwehrverbands
(`https://einsatz-api.ooelfv.at`, Beschreibung unter `/swagger/`) nutzen:

| Funktion | Quelle | Wirkung in HotDoc |
|---|---|---|
| **Funkstatus** der Fahrzeuge | `GET /API/v1/export/units` (alle 60 s) | Florianstation: „Funk 4 · seit 14:32“ je Fahrzeug; **jede Statusänderung kommt in die Einsatzchronik** (siehe unten) |
| **Fahrzeugposition** | `units` (Latitude/Longitude) | **ELS-Position hat Vorrang vor dem Tablet-GPS** (Karte, Florianstation, Tablets); Tablet nur als Rückfall |
| **Einsatzstart** | `GET /API/v1/export/events` (alle 15 s) | Einsatz wird automatisch angelegt oder mit dem BlaulichtSMS-Einsatz verknüpft |

Ohne die Secrets unten ist die Anbindung **aus**: kein Abruf, keine Anzeige, kein Einfluss auf bestehende Abläufe.

## Einrichten

1. In syBOS unter *Weitere Daten der eigenen Dienststelle* den **Register-Token** abrufen und die **Stations-ID** notieren.
2. Als Secrets auf dem API-Server setzen (Werte nie in Dateien, Chat oder Git):

```bash
fly secrets set -a hotdoc-api ELS_REGISTER_TOKEN="<Register-Token aus syBOS>" ELS_STATION_ID="<Stations-ID>"
```

3. API neu starten (das `fly secrets set` macht das automatisch). Nach etwa einer Minute zeigt das Backoffice unter **Schnittstellen** den Punkt „ELS-Schnittstelle (Landesverband)“.
4. Im Backoffice unter **Schnittstellen → ELS-Einheiten den Fahrzeugen zuordnen** prüfen, welche ELS-Einheit zu welchem Fahrzeug gehört. Die automatische Zuordnung vergleicht den ELS-Rufnamen mit Kürzel, Funkrufname und Bezeichnung (TANK, PUMPE, KDO, MTF …); was nicht passt, wird dort fest zugeordnet.

Optionale Einstellungen (ebenfalls `fly secrets set` / `[env]`):

| Variable | Standard | Bedeutung |
|---|---|---|
| `ELS_UNITS_POLL_SEC` | 65 | Funkstatus/Position (Mindestwert der Schnittstelle: 60; 65 wegen Timer-Drift) |
| `ELS_EVENTS_POLL_SEC` | 15 | offene Einsätze (Mindestwert der Schnittstelle: 5) |
| `ELS_AUTOSTART` | 1 | `0` = Einsätze nie selbst anlegen, nur verknüpfen |
| `ELS_AUTOSTART_GRACE_SEC` | 120 | Wartezeit nach der Alarmierung, bevor ein Einsatz selbst angelegt wird |
| `ELS_SYSTEM_NAME` | HotDoc | Systemname, der beim Registrieren mitgeschickt wird |

## Token: was passiert im Hintergrund

Die Schnittstelle kennt drei Token (Register → Refresh → Access, Access 14 Tage gültig). Wichtig:

* Das **Registrieren entwertet alle bisher ausgestellten Token** der Feuerwehr (auch die anderer Systeme, z. B. ELIS) und sperrt den Register-Token 60 Minuten.
* HotDoc registriert deshalb **nur, wenn es noch gar keine Token hat** oder der Refresh-Token abgelehnt wird. Die Token liegen in der Datenbank (`state:els-token`); ein Neustart/Deploy registriert nicht erneut.
* Der Access-Token wird **einen Tag vor Ablauf** per Refresh-Token erneuert (danach 60 Minuten Sperre des Refresh-Tokens).
* Sperren werden gemerkt und nicht wiederholt angerannt. Der Zustand steht im Backoffice unter *Schnittstellen*.

> Wird derselbe Register-Token auch von einem anderen System genutzt, würde die erste Registrierung durch HotDoc dieses System abschalten. Vorher klären.

## Einsatzstart: so entscheidet HotDoc

Pro offenem ELS-Einsatz (nur alarmierte, nicht beendete; **Übungen der Leitstelle und als „nicht veröffentlichen“ markierte Einsätze werden ignoriert**):

1. Steht seine Nummer schon an einem HotDoc-Einsatz (`els-<Nummer>` in `alarmIds`)? → nichts zu tun.
2. Gibt es einen **aktiven HotDoc-Einsatz**, der dazu passt (Alarmzeit ± 20 min **und** Position < 300 m oder gleicher Einsatzort-Text)? → die ELS-Nummer wird dort vermerkt (Chronik: „ELS-Einsatz … zugeordnet“); **leere** Felder (Einsatzort, Koordinaten) werden ergänzt, Eingaben der Mannschaft bleiben unangetastet. Es entsteht **kein zweiter Einsatz**.
3. Sonst, **nach der Wartezeit** (Standard 2 min, damit BlaulichtSMS vorher kommen kann) → HotDoc legt den Einsatz selbst an (`einsatz:els-<Nummer>`) mit Stichwort, Einsatzort, Koordinaten, Alarmzeit, Wetter, und schickt den Alarm-Push an alle Tablets. Einsätze, die schon länger als 6 Stunden laufen, werden nicht mehr neu angelegt.

**Anruferdaten (Name, Telefonnummer) aus ELS werden nicht übernommen.**

Kommt BlaulichtSMS **nach** dem selbst angelegten ELS-Einsatz, erkennt der BlaulichtSMS-Poller das wie bisher als mögliche Doppel-/Nachalarmierung (Hinweis am Einsatz, ein Push) — die Florianstation entscheidet.

## Statusfunk im Einsatzprotokoll

Jede Änderung des Funkstatus eines unserer Fahrzeuge wird mit dem **Zeitpunkt der Statusmeldung** (nicht der Abfragezeit) als Chronik-Eintrag am Einsatz festgehalten und erscheint in Tablet-Chronik, Florianstation und im Bericht-PDF:

```
12:04  Tank Eberstalzell: Funkstatus 3: Ausgerückt (Einsatz übernommen)
12:13  Tank Eberstalzell: Funkstatus 4: Am Einsatzort eingetroffen
12:31  Tank Eberstalzell: Funkstatus 5: Sprechwunsch
12:52  Tank Eberstalzell: Funkstatus 2: Eingerückt (einsatzbereit auf Wache)
```

* Zuordnung zum Einsatz: über die ELS-Einsatznummer der Einheit (am HotDoc-Einsatz als `els-<Nummer>` vermerkt). Meldungen **ohne** Einsatznummer (Sprechwunsch, „eingerückt“ nach Einsatzende) gehören zum Einsatz, an dem das Fahrzeug zuletzt beteiligt war (max. 12 h, solange der Einsatz aktiv ist). Mit „eingerückt“ (Status 2) endet die Beteiligung.
* Statusmeldungen ohne Einsatz (Wache, Übung der Leitstelle …) werden **nicht** protokolliert; abgeschlossene/gesperrte Einsätze werden nicht verändert.
* Jeder Eintrag hat eine feste ID (Fahrzeug + Status + Meldezeit) – kein Doppeltschreiben bei Neustart oder wiederholter Abfrage. Ist der HotDoc-Einsatz zum Zeitpunkt der Meldung noch nicht verknüpft, wird der Eintrag beim nächsten Abruf nachgeholt.
* **Grenzen:** Die Schnittstelle liefert keine Statushistorie, nur den aktuellen Status, und darf nur alle 60 s abgefragt werden. Wechselt ein Status innerhalb einer Minute mehrfach, fehlen die Zwischenstände. Statuswechsel, die vor dem Anlegen/Verknüpfen des Einsatzes passiert sind, werden nicht rückwirkend ergänzt.
* Die Statustexte stehen in `packages/shared/src/constants/funkstatus.ts` (FMS-Standard: 2 = eingerückt, 3 = ausgerückt, 4 = am Einsatzort, 5 = Sprechwunsch). **Gegen die Leitstelle prüfen**, die Schnittstelle nennt keine Tabelle.

## Fahrzeugposition: ELS statt Tablet-GPS

* `/api/positions` liefert zuerst die ELS-Funkposition (Daten höchstens 3 min alt), nur sonst den Tablet-Ping. Einträge tragen `source: "els"` bzw. `"tablet"`.
* Das Tablet **sendet seinen GPS-Ping nicht mehr**, solange ELS für sein Fahrzeug eine Position liefert (spart Akku und Datenverkehr); fällt ELS aus, sendet es automatisch wieder.
* **Eintreffzeit:** Hat der Statusfunk „Funkstatus 4“ protokolliert, entfällt der GPS-Vorschlag („Eingetroffen … übernehmen?“), weil die Ankunft schon in der Chronik steht. Sonst wird die Entfernung (≤ 100 m) aus der ELS-Position berechnet, ohne ELS aus dem Tablet-GPS.
* Das Tablet-GPS bleibt für alles, was das Gerät selbst betrifft: Taste „GPS“ beim Einsatzort, Navigation/Route zum Einsatzort, Rückfall.
* Die ELS-Position wird nur etwa einmal pro Minute aktualisiert – die Fahrzeugmarker auf der Karte springen daher in diesem Takt statt alle paar Sekunden.

## Funkstatus

In der Florianstation steht der Rohwert aus `status_florianstation` („Funk 4 · seit 14:32“), der Text dazu im Tooltip; in der Chronik steht Rohwert + Text. Die Schnittstellenbeschreibung nennt **keine Bedeutungstabelle**, die Texte sind der FMS-Standard. **Nach der Inbetriebnahme mit der Leitstelle gegenprüfen** und in `funkstatus.ts` anpassen.

## Nutzungsbedingungen (Auszug)

Die Informationen dürfen nur intern zu feuerwehrdienstlichen Zwecken und nur den **Aktiven und Reservisten der eigenen Feuerwehr** zur Verfügung gestellt werden; Weitergabe an Dritte ist unzulässig, bei Missbrauch kann der Token gesperrt werden. HotDoc zeigt die Daten nur angemeldeten Fahrzeug-/Florian-/Backoffice-Sitzungen. Beim Teilen von Bildschirmfotos oder Berichten darauf achten.

## Abschalten

Secrets entfernen (`fly secrets unset -a hotdoc-api ELS_REGISTER_TOKEN ELS_STATION_ID`) oder nur den Einsatzstart ausschalten (`ELS_AUTOSTART=0`).
