/**
 * Chronik-Adapter — vereinheitlicht alte und neue Chronik-Eintrag-Schemas
 * fuer den PDF-Renderer (Issue #173, v0.1.12).
 *
 * Hintergrund: Im Lauf der App-Entwicklung hat sich das Chronik-Schema
 * zweimal geaendert. Auf Bestands-Tablets in v0.1.7..v0.1.9 wurden Eintraege
 * mit dem ALT-Schema persistiert; ab v0.1.10 dann mit dem NEU-Schema.
 *
 * ALT (pre-v0.1.10):
 *   { id, zeitstempel, fahrzeugId, typ, transkript, transkriptStatus }
 *   - typ: "blaulichtsms" | "diktat" | "manuell" | ...
 *   - transkript: der Eintrag-Text
 *
 * NEU (ab v0.1.10):
 *   { id, zeitstempel, funkrufname, fahrzeugId, source, text, fotoId?,
 *     pending?, editiertAm?, editiertVon? }
 *
 * Damit der PDF-Renderer beide Formen sauber rendert, normalisieren wir
 * im PDF-Pfad zu einem stabilen Output-Schema. Der GET /chronik-Endpoint
 * bleibt 1:1 (das Frontend hat sein eigenes Mapping, ein doppelter Mapping-
 * Pfad waere fehlertraechtig).
 */

export interface NormalizedChronikEntry {
  id: string;
  zeitstempel: string;
  source: string;
  text: string;
  funkrufname?: string;
  fahrzeugId?: string;
  pending?: boolean;
  editiertAm?: string;
  editiertVon?: string;
  fotoId?: string;
}

/**
 * Normalisiert einen Roh-Eintrag aus dem Einsatz-Doc auf das Renderer-Schema.
 * - text:        bevorzugt `text` (neu), faellt auf `transkript` zurueck (alt).
 * - source:      bevorzugt `source` (neu), faellt auf `typ` zurueck (alt),
 *                Default "—".
 * - funkrufname: wenn vorhanden direkt; sonst leitet aus `typ === "blaulichtsms"`
 *                den Wert "BlaulichtSMS" ab; sonst fallback `fahrzeugId`.
 *
 * Unbekannte/fehlerhafte Felder werden defensiv defaulted — der PDF-Pfad
 * darf nie wegen einer einzigen kaputten Zeile abbrechen.
 */
export function normalizeChronikEntry(raw: unknown): NormalizedChronikEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  const zeitstempel = typeof r.zeitstempel === "string" ? r.zeitstempel : "";

  // Text: neu -> alt fallback
  const text =
    typeof r.text === "string" && r.text.trim()
      ? r.text
      : typeof r.transkript === "string"
        ? r.transkript
        : "";

  // Source: neu -> alt-typ fallback
  const source =
    typeof r.source === "string" && r.source
      ? r.source
      : typeof r.typ === "string" && r.typ
        ? r.typ
        : "—";

  // Funkrufname: neu direkt, sonst aus typ ableiten, sonst fahrzeugId
  let funkrufname: string | undefined;
  if (typeof r.funkrufname === "string" && r.funkrufname.trim()) {
    funkrufname = r.funkrufname;
  } else if (r.typ === "blaulichtsms") {
    funkrufname = "BlaulichtSMS";
  } else if (typeof r.fahrzeugId === "string" && r.fahrzeugId) {
    funkrufname = r.fahrzeugId;
  }

  const out: NormalizedChronikEntry = {
    id,
    zeitstempel,
    source,
    text,
  };
  if (funkrufname) out.funkrufname = funkrufname;
  if (typeof r.fahrzeugId === "string") out.fahrzeugId = r.fahrzeugId;
  if (typeof r.pending === "boolean") out.pending = r.pending;
  if (typeof r.editiertAm === "string") out.editiertAm = r.editiertAm;
  if (typeof r.editiertVon === "string") out.editiertVon = r.editiertVon;
  if (typeof r.fotoId === "string") out.fotoId = r.fotoId;
  return out;
}
