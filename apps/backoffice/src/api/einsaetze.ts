import { apiCall } from "./client";

export type EinsatzTyp = "alarm" | "manuell" | "lotsendienst" | "uebung";

export type UebungsTyp =
  | "Atemschutz"
  | "Technische Hilfeleistung"
  | "Höhenrettung"
  | "Sanitätsdienst"
  | "Funk"
  | "Allgemeine Übung"
  | "Bewerb"
  | "Sonstige";

/**
 * Auto-Abschluss-Gruende, die der Server in autoAbgeschlossenGrund schreibt
 * (Worker auto-close-stale, phantom-cleanup, Reaktivierungs-Reclose).
 * Offen als string gehalten — neue Gruende duerfen nicht zum TS-Bruch fuehren.
 */
export type AutoAbschlussGrund =
  | "unbefuellt-1h"
  | "inaktiv-6h"
  | "reaktivierung-wieder-geschlossen"
  | (string & {});

export interface EinsatzListItem {
  _id: string;
  einsatzTyp: EinsatzTyp;
  einsatzort: string;
  alarmierungZeit: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  status: "aktiv" | "abgeschlossen";
  schreibschutz: boolean;
  einsatzende?: string;
  reaktivierungen?: Array<{ am: string; grund: string }>;
  koordinaten?: { lat: number; lng: number };
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: UebungsTyp;
  // D-06 (Audit R3): Lifecycle-Marker aus dem Einsatz-Doc. Die Liste
  // liefert volle Docs (kein shape=poll), daher sind sie hier verfuegbar —
  // alle optional, weil Altberichte sie nicht tragen.
  /** Phantom-Cleanup: Einsatz wurde als leer/verworfen markiert. */
  verworfen?: boolean;
  /** Vom Worker (nicht vom Menschen) abgeschlossen. */
  autoAbgeschlossen?: boolean;
  autoAbgeschlossenGrund?: AutoAbschlussGrund;
  /** Beim manuellen Abschluss waren noch Fahrzeugberichte offen. */
  abschlussOverrideHinweis?: string;
  /** Echte Berichtsnummer — wird beim Abschluss vergeben (AUDIT-11). */
  berichtNummer?: string;
  /** Poller-Heuristik: moeglicherweise Doppel-Alarm zu dieser Einsatz-ID. */
  moeglichesDuplikatVon?: string;
  /** D-01/D-04: Einsatzleiter (syBosId) — im Florian-Editor pflegbar. */
  einsatzleiterPersonId?: number;
}

export async function listEinsaetze(status?: "aktiv" | "abgeschlossen"): Promise<EinsatzListItem[]> {
  const path = status ? `/api/einsaetze?status=${status}` : "/api/einsaetze";
  const r = await apiCall<{ items: EinsatzListItem[] }>(path);
  return r.items;
}

export async function getEinsatz(id: string): Promise<EinsatzListItem & Record<string, unknown>> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}`);
}

/**
 * D-10 (Audit R3): Abschluss-Body. verrechenbar/rechnungsadresse werden
 * vom Server bei Uebungen ignoriert (U-05); clientTs = Zeitpunkt des
 * Abschluss-Dialogs — liegt eine juengere Reaktivierung vor, antwortet
 * der Server 409 stale_abschluss (L-08).
 */
export interface AbschlussInput {
  verrechenbar?: boolean;
  rechnungsadresse?: string;
  clientTs?: string;
}

export async function abschluss(id: string, input: AbschlussInput = {}): Promise<{ ok: boolean }> {
  // Nur gesetzte Keys in den Body — exactOptionalPropertyTypes + Zod
  // (rechnungsadresse: undefined waere im JSON ohnehin weg, aber so ist
  // es explizit).
  const body: Record<string, unknown> = {};
  if (typeof input.verrechenbar === "boolean") body.verrechenbar = input.verrechenbar;
  if (typeof input.rechnungsadresse === "string" && input.rechnungsadresse.trim()) {
    body.rechnungsadresse = input.rechnungsadresse.trim();
  }
  if (input.clientTs) body.clientTs = input.clientTs;
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}/abschluss`, { method: "POST", body });
}

// ─── Fahrzeugberichte (D-04c / D-07) ─────────────────────────

export interface FahrzeugberichtMannschaft {
  slot: number;
  personId: number;
  atemschutzAktiv?: boolean;
  atemschutzDauerMin?: number;
}

/**
 * Fahrzeugbericht-Doc wie GET /api/einsaetze/:id/fahrzeugberichte es
 * liefert (rohe Couch-Docs, keine Anreicherung). Alle Felder ausser _id
 * optional — Altberichte und Phantom-Docs sind oft nur halb befuellt.
 */
export interface FahrzeugberichtItem {
  _id: string;
  einsatzId?: string;
  fahrzeugId?: string;
  /** Nicht vom Server geliefert — bleibt fuer Kompatibilitaet optional. */
  funkrufname?: string;
  status?: "in_arbeit" | "abgeschlossen";
  zeit?: { von?: string; bis?: string };
  km?: { abfahrt?: number; gefahrenKm?: number; rueckkehr?: number };
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  kdtIstEinsatzleiter?: boolean;
  mannschaft?: FahrzeugberichtMannschaft[];
  geraete?: Array<{ materialId: string; anzahl?: number; bemerkung?: string }>;
  oelbindemittelSaecke?: number;
  taetigkeitsbericht?: string;
  reaktiviertAusStatus?: string;
  geaendertAm?: string;
}

export async function listFahrzeugberichte(einsatzId: string): Promise<FahrzeugberichtItem[]> {
  const r = await apiCall<{ items?: FahrzeugberichtItem[] }>(
    `/api/einsaetze/${encodeURIComponent(einsatzId)}/fahrzeugberichte`,
  );
  return Array.isArray(r.items) ? r.items : [];
}

/**
 * Teil-Body fuer PUT /api/einsaetze/:id/fahrzeugbericht/:fzgId (mannschaft+).
 * Der Server merged shallow: Objekt-Felder (zeit, km) und Arrays
 * (mannschaft, geraete) werden KOMPLETT ersetzt — der Aufrufer muss sie
 * daher vollstaendig aus dem Original + Aenderung zusammenbauen.
 * Erlaubte Keys = Server-Allowlist PUT_FZGBER_ALLOWED_FIELDS.
 */
export interface FahrzeugberichtPatch {
  zeit?: { von?: string; bis?: string };
  km?: { abfahrt?: number; gefahrenKm: number; rueckkehr?: number };
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  kdtIstEinsatzleiter?: boolean;
  mannschaft?: FahrzeugberichtMannschaft[];
  geraete?: Array<{ materialId: string; anzahl?: number; bemerkung?: string }>;
  oelbindemittelSaecke?: number;
  taetigkeitsbericht?: string;
  status?: "in_arbeit" | "abgeschlossen";
}

export async function putFahrzeugbericht(
  einsatzId: string,
  fahrzeugId: string,
  patch: FahrzeugberichtPatch,
): Promise<{ ok: boolean; id: string; rev?: string }> {
  return apiCall(
    `/api/einsaetze/${encodeURIComponent(einsatzId)}/fahrzeugbericht/${encodeURIComponent(fahrzeugId)}`,
    { method: "PUT", body: patch },
  );
}

// ─── Chronik (D-04d) ─────────────────────────────────────────

/**
 * Chronik-Eintrag — beide historischen Shapes (Broadcast: source/text,
 * Tablet-Diktat: typ/transkript) koennen nebeneinander vorkommen.
 */
export interface ChronikEintrag {
  id: string;
  zeitstempel: string;
  funkrufname?: string;
  fahrzeugId?: string;
  source?: "blaulichtsms" | "fahrzeug" | "manuell" | "atemschutz";
  text?: string;
  pending?: boolean;
  typ?: "diktat" | "manuell" | "auto-blaulichtsms";
  transkript?: string;
  editiertAm?: string;
  editiertVon?: string;
  fotoId?: string;
  /** D-11: Soft-Delete — bleibt im Array, UI/PDF blenden aus. */
  geloescht?: boolean;
  geloeschtAm?: string;
  geloeschtVon?: string;
}

/** Sichtbarer Text eines Eintrags (Broadcast-Text vor Diktat-Transkript). */
export function chronikText(e: ChronikEintrag): string {
  return (e.text ?? e.transkript ?? "").trim();
}

export async function getChronik(einsatzId: string): Promise<ChronikEintrag[]> {
  const r = await apiCall<{ chronik?: ChronikEintrag[] }>(
    `/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik`,
  );
  return Array.isArray(r.chronik) ? r.chronik : [];
}

/** PUT /api/einsaetze/:id/chronik/:entryId { text } (mannschaft+, 1..2000 Zeichen). */
export async function editChronikEintrag(
  einsatzId: string,
  entryId: string,
  text: string,
): Promise<{ ok: boolean }> {
  return apiCall(
    `/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik/${encodeURIComponent(entryId)}`,
    { method: "PUT", body: { text } },
  );
}

/** DELETE /api/einsaetze/:id/chronik/:entryId — Soft-Delete (einsatzleiter+). */
export async function deleteChronikEintrag(
  einsatzId: string,
  entryId: string,
): Promise<{ ok: boolean }> {
  return apiCall(
    `/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
}

export async function reaktivieren(id: string, grund: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}/reaktivieren`, {
    method: "POST",
    body: { grund },
  });
}

/**
 * Issue 2 (Einsatz-Test 2026-06-02): Einsatz endgueltig loeschen +
 * Fahrzeugberichte cascadiert mit-loeschen. Backend setzt CouchDB-Tombstone
 * (`_deleted: true`) und schreibt ein Audit-Event mit Pflicht-Begruendung.
 */
export async function loeschenEinsatz(
  id: string,
  grund: string,
): Promise<{ ok: boolean; deleted: boolean; cascade_fzgber: number }> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}`, {
    method: "DELETE",
    body: { grund },
  });
}

export interface ManuellAnlageInput {
  einsatzTyp?: "manuell" | "lotsendienst" | "uebung";
  einsatzort: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  grund?: string;
  // Lotsendienst-Felder
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  // Übungs-Felder
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: UebungsTyp;
  // Verrechnung (für Lotsendienst meist true)
  verrechenbar?: boolean;
  rechnungsadresse?: string;
}

export async function manuellAnlegen(input: ManuellAnlageInput): Promise<{ ok: boolean; id: string }> {
  return apiCall("/api/einsaetze/manuell", { method: "POST", body: input });
}
