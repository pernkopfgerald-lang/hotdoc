# Ausrüstungs-Check beim Abschluss

Beim Abschluss eines Fahrzeugberichts prüft das Tablet, ob zum **Einsatzstichwort** (Einsatzart des
Berichts) die üblichen **Geräte** erfasst wurden.

## Wie eine Regel funktioniert

| Feld | Bedeutung |
|---|---|
| Stichwort | Muster mit Platzhaltern: `*` = beliebig viele Zeichen, `?` = genau ein Zeichen, Groß-/Kleinschreibung egal. Das Muster muss das **ganze** Stichwort treffen (`VU*` trifft „VU Eingekl. Per.“ und „VU“; `VU` nur genau „VU“). |
| Fahrzeug | KDO, TANK, LFA-B, MTF. Die Regel gilt nur, wenn dieses Fahrzeug am Einsatz beteiligt ist. |
| Geräte | Auswahl aus der Geräteliste des Fahrzeugs. Es genügt **eines** der gewählten Geräte. |
| Prüfart | **MUSS**: Abschluss gesperrt, solange kein Gerät erfasst ist. **INFO**: nur Vorschlag, Abschluss möglich. |
| Gültig ab | Datum, ab dem die Regel greift (leer = sofort). |
| aktiv | Haken weg = Regel pausiert. |

Ohne passende Regel gibt es **keinen** Check. Nach der Installation sind keine Regeln angelegt.

## Regel anlegen / ändern

1. Backoffice → **Listen & Stichworte → Ausrüstungs-Check**
2. **+ Neue Regel**, Stichwort/Fahrzeug/Prüfart wählen, Geräte antippen
3. **Speichern** — die Tablets laden die Regeln innerhalb von 5 Minuten (und beim App-Start); offline gilt der
   zuletzt geladene Stand.

## Testen

Im selben Tab unter **Regeln testen**: Stichwort eintippen, beteiligte Fahrzeuge und erfasste Geräte wählen →
Anzeige der passenden Regeln und des Ergebnisses (auch mit noch nicht gespeicherten Änderungen).

## Protokoll

Jede Prüfung mit passender Regel wird im Audit-Trail festgehalten (beim Öffnen des Abschluss-Dialogs und beim
Abschluss). Die letzten 50 stehen im selben Tab unter **Protokoll der Prüfungen**.

## Technik

- Regeln: `config:ausruestungs-regeln` → `{ regeln: [{ id, stichwort, fahrzeug, geraete[], pruefart, gueltigAb?, notiz?, aktiv? }] }`
- Logik: `packages/shared/src/utils/ausruestung.ts` (`validiereAusruestung`), Tests in
  `apps/api/src/services/ausruestung.test.ts`
- Tablet: `apps/pwa/src/lib/ausruestungs-regeln.ts` + `BerichtPage.tsx` (Abschluss-Dialog)
- Log: `POST /api/validierung/ausruestung` → Audit-Event `ausruestung-validierung`
