# HotDoc — Datenbank-Backup und Wiederherstellung

Stand: 30.10.2026. Betrifft die CouchDB `hotdoc-db` (Fly.io, Volume `hotdoc_db_data`, 5 GB, Region fra).

## Was es gibt

- **Tägliche Snapshots durch Fly** (automatisch, verschlüsselt). Aufbewahrung seit 30.10.2026: **30 Tage**
  (`fly volumes update vol_v8e6njozpnzxw2yv --snapshot-retention 30 -a hotdoc-db`). Davor 5 Tage; Snapshots, die vor der Umstellung
  entstanden sind, behalten ihre 5 Tage.
- Snapshots anzeigen:

  ```bash
  fly volumes snapshots list vol_v8e6njozpnzxw2yv -a hotdoc-db
  ```

## Was es NICHT gibt

- **Kein externes Backup.** Die Snapshots liegen bei Fly. Ein Verlust des Fly-Kontos oder der App würde sie mitnehmen.
  Ein externes Ziel (z. B. verschlüsselter Export in einen Speicher außerhalb von Fly) braucht eine Entscheidung und
  Zugangsdaten und ist deshalb noch nicht eingerichtet.
- Keine Sicherung zwischen zwei Snapshots (bis zu 24 h Datenverlust möglich).

## Wiederherstellung prüfen (am 30.10.2026 getestet, funktioniert)

Test in einer Wegwerf-App, ohne die Produktion anzufassen:

```bash
# 1. Wegwerf-App und Volume aus dem gewünschten Snapshot
fly apps create hotdoc-restoretest --org personal
fly volumes create restoretest --snapshot-id <vs_...> --region fra --size 5 -a hotdoc-restoretest -y

# 2. CouchDB (gleiche Version wie deploy/couchdb/Dockerfile) auf dem Volume starten, ohne öffentlichen Port.
#    COUCHDB_USER/PASSWORD/SECRET wie in fly.couchdb.toml.
fly machine run couchdb:3.4.2 --app hotdoc-restoretest --region fra \
  --volume restoretest:/opt/couchdb/data \
  --env COUCHDB_USER=admin --env COUCHDB_PASSWORD=... --env COUCHDB_SECRET=... \
  --vm-memory 512 --vm-cpus 1 --name restoretest

# 3. Inhalt prüfen (nach ~25 s)
fly ssh console -a hotdoc-restoretest -C "sh -c 'curl -s -u admin:... http://localhost:5984/hotdoc'"

# 4. Aufräumen (löscht Maschine und Volume)
fly apps destroy hotdoc-restoretest -y
```

Ergebnis des Tests: Die Datenbank `hotdoc` war vollständig vorhanden (Snapshot von vor ca. 13 h: 22.351 Änderungen,
live damals 27.355), der Berichtsnummern-Zähler und die Einsätze waren lesbar.

## Notfall: Produktion zurücksetzen (NICHT getestet)

Nur mit Bedacht und nach Rücksprache, weil alles seit dem Snapshot verloren geht:

1. API anhalten (`fly scale count 0 -a hotdoc-api`), damit nichts mehr schreibt.
2. Neues Volume aus dem Snapshot für `hotdoc-db` anlegen
   (`fly volumes create hotdoc_db_data --snapshot-id <vs_...> --region fra -a hotdoc-db`),
   Maschine mit dem neuen Volume neu erstellen, bestehendes Volume erst nach erfolgreicher Prüfung löschen.
3. Daten prüfen (Einsatzzahl, `config:bericht-counter`), API wieder starten.

Einzelne Dokumente lassen sich risikoärmer aus der Wegwerf-Kopie (oben) auslesen und per `PUT` in die Produktion zurückschreiben.
