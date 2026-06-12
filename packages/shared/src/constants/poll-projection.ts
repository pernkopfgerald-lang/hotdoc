/**
 * ING-10 Stufe 2 (4-Personas-Audit, 2026-06-12): Feld-Inventar fuer die
 * schlanke Poll-Projektion des Fahrzeug-Tablet-Polls.
 *
 * GET /api/einsaetze?...&shape=poll projiziert jedes Einsatz-Item auf GENAU
 * diese Felder. Hintergrund: der 5-s-Poll der Fahrzeug-Tablets (4 Tablets x
 * 12 Polls/min) braucht weder das unbegrenzt wachsende Chronik-Array noch
 * die Brand-/Technisch-Statistik — volle Docs waren reine Transferlast.
 *
 * Inventar per Grep verifiziert (2026-06-12): entspricht 1:1 dem Interface
 * ApiEinsatzListItem im runPoll-Effekt von apps/pwa/src/pages/BerichtPage.tsx.
 * Saemtliche list.items-Konsumenten dort (buildEinsatzFromApi, Stammfeld-
 * Re-Sync, Neuer-Einsatz-Popup, Uebungs-Setup, Phase-2/3-Reconcile) lesen
 * nur diese Felder. `status` wird clientseitig NICHT gelesen (der Server
 * filtert bereits via ?status=aktiv) und ist darum bewusst nicht enthalten.
 *
 * WICHTIG: Jede Erweiterung des Poll-Konsums in BerichtPage MUSS hier
 * nachgezogen werden — sonst fehlt das neue Feld in der Poll-Antwort
 * (stiller Bruch). ZentralePage, FlorianMapPopout und ArchivTabletModal
 * rufen den Endpoint OHNE shape-Param auf und bekommen weiterhin volle
 * Docs — dort aendert sich nichts.
 */
export const EINSATZ_POLL_FELDER = [
  "_id",
  "alarmId",
  "einsatzTyp",
  "einsatzart",
  "einsatzartFreitext",
  "einsatzort",
  "alarmierungZeit",
  "alarmierungText",
  "alarmierungAuthor",
  "koordinaten",
  "stichwort",
] as const;
