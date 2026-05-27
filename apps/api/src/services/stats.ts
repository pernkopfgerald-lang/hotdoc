/**
 * Statistik-Aggregation für das Backoffice-Dashboard.
 *
 * Liest alle einsatz:* + fzgber:* Docs im Zeitraum und aggregiert:
 *   - Counts pro einsatzTyp (alarm / manuell / lotsendienst / uebung)
 *   - Monatliche Verteilung (Stacked-Bar-Visualisierung im Frontend)
 *   - Mannschaftsstunden gesamt
 *   - AS-Trupp-Anzahl + AS-Stunden
 *   - KM-Summe pro Typ (für Lotsendienst-Verrechnung)
 *   - Übungstyp-Verteilung
 *
 * Nicht optimiert für riesige Datenmengen — bei der FF Eberstalzell
 * sprechen wir von ~80 Einsätzen + 50 Übungen pro Jahr, das sind wenige
 * hundert Docs. CouchDB-View-Indices wären sauberer aber für die Größe
 * unnötig.
 */

import { db } from "../couch/client.js";

export type EinsatzTyp = "alarm" | "manuell" | "lotsendienst" | "uebung";

export interface StatsRequest {
  /** ISO-Datum (YYYY-MM-DD), inklusiv. Default: 1.1. des aktuellen Jahres. */
  from?: string;
  /** ISO-Datum, exklusiv. Default: morgen. */
  to?: string;
}

export interface StatsResponse {
  range: { from: string; to: string };
  totals: {
    einsaetze: number;
    pro_typ: Record<EinsatzTyp, number>;
    mannschaftStunden: number;
    asTrupps: number;
    asStunden: number;
    kmGesamt: number;
    kmLotsendienst: number;
    fahrzeugberichte: number;
  };
  /** Pro Monat (YYYY-MM): counts pro Typ. */
  monate: Array<{
    monat: string; // "2026-05"
    alarm: number;
    manuell: number;
    lotsendienst: number;
    uebung: number;
  }>;
  /** Übungstypen mit Häufigkeit. */
  uebungsTypen: Array<{ typ: string; anzahl: number; stunden: number }>;
  /** Top-Einsatzarten (nur Brand/THL/Alarm). */
  topEinsatzarten: Array<{ art: string; anzahl: number }>;
  /** Generierungs-Zeitpunkt. */
  generatedAt: string;
}

function thisYearStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function monthKey(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function calcDauerMin(vonIso: string, bisIso: string): number {
  try {
    const von = new Date(vonIso).getTime();
    const bis = new Date(bisIso).getTime();
    if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
    return Math.max(0, Math.floor((bis - von) / 60_000));
  } catch {
    return 0;
  }
}

interface EinsatzMin {
  _id: string;
  einsatzTyp?: EinsatzTyp;
  einsatzart?: string;
  einsatzartFreitext?: string;
  uebungsTyp?: string;
  alarmierungZeit: string;
  einsatzende?: string;
}

interface FahrzeugBerichtMin {
  _id: string;
  einsatzId: string;
  mannschaft?: Array<{ atemschutzAktiv?: boolean; atemschutzDauerMin?: number }>;
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  km?: { gefahrenKm?: number };
  zeit?: { von?: string; bis?: string };
}

export async function computeStats(req: StatsRequest): Promise<StatsResponse> {
  const from = req.from ?? thisYearStart();
  const to = req.to ?? tomorrow();
  const fromMs = new Date(from + (from.length === 10 ? "T00:00:00" : "")).getTime();
  const toMs = new Date(to + (to.length === 10 ? "T00:00:00" : "")).getTime();

  // Alle Einsätze laden
  const einsaetze = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￰",
    include_docs: true,
  });
  const einsatzDocs = einsaetze.rows
    .map((r) => r.doc as EinsatzMin | undefined)
    .filter((d): d is EinsatzMin => !!d && !!d.alarmierungZeit)
    .filter((d) => {
      const t = new Date(d.alarmierungZeit).getTime();
      return !Number.isNaN(t) && t >= fromMs && t < toMs;
    });

  // Fahrzeugberichte laden — alle, dann nach einsatzId zuordnen
  const fzg = await db.list({
    startkey: "fzgber:",
    endkey: "fzgber:￰",
    include_docs: true,
  });
  const einsatzIdSet = new Set(einsatzDocs.map((e) => e._id));
  const fzgDocs = fzg.rows
    .map((r) => r.doc as FahrzeugBerichtMin | undefined)
    .filter((d): d is FahrzeugBerichtMin => !!d && !!d.einsatzId)
    .filter((d) => einsatzIdSet.has(d.einsatzId));

  // ─── Aggregation ───
  const totals: StatsResponse["totals"] = {
    einsaetze: einsatzDocs.length,
    pro_typ: { alarm: 0, manuell: 0, lotsendienst: 0, uebung: 0 },
    mannschaftStunden: 0,
    asTrupps: 0,
    asStunden: 0,
    kmGesamt: 0,
    kmLotsendienst: 0,
    fahrzeugberichte: fzgDocs.length,
  };

  const monateMap = new Map<string, { alarm: number; manuell: number; lotsendienst: number; uebung: number }>();
  const uebungsTypenMap = new Map<string, { anzahl: number; stunden: number }>();
  const einsatzartenMap = new Map<string, number>();
  const einsatzById = new Map(einsatzDocs.map((e) => [e._id, e]));

  for (const e of einsatzDocs) {
    const typ = (e.einsatzTyp ?? "alarm") as EinsatzTyp;
    totals.pro_typ[typ]++;
    const mk = monthKey(e.alarmierungZeit);
    if (mk) {
      const m = monateMap.get(mk) ?? { alarm: 0, manuell: 0, lotsendienst: 0, uebung: 0 };
      m[typ]++;
      monateMap.set(mk, m);
    }
    if (typ === "alarm" || typ === "manuell") {
      const art = e.einsatzart ?? e.einsatzartFreitext;
      if (art) einsatzartenMap.set(art, (einsatzartenMap.get(art) ?? 0) + 1);
    }
    if (typ === "uebung") {
      const ut = e.uebungsTyp ?? "Sonstige";
      const cur = uebungsTypenMap.get(ut) ?? { anzahl: 0, stunden: 0 };
      cur.anzahl++;
      uebungsTypenMap.set(ut, cur);
    }
  }

  // Aus Fahrzeugberichten: Mannschaftsstunden, AS, KM
  let asPersonenGesamt = 0;
  for (const f of fzgDocs) {
    const km = f.km?.gefahrenKm ?? 0;
    totals.kmGesamt += km;
    const einsatz = einsatzById.get(f.einsatzId);
    if (einsatz?.einsatzTyp === "lotsendienst") {
      totals.kmLotsendienst += km;
    }
    const m = f.mannschaft ?? [];
    const slotsBesetzt = m.filter((s) => typeof s === "object").length;
    const headcount =
      slotsBesetzt + (f.fahrerPersonId ? 1 : 0) + (f.fahrzeugKdtPersonId ? 1 : 0);
    const dauerMin = f.zeit?.von && f.zeit?.bis ? calcDauerMin(f.zeit.von, f.zeit.bis) : 0;
    if (dauerMin > 0) {
      totals.mannschaftStunden += (headcount * dauerMin) / 60;
      // Übungsstunden pro Übungstyp
      if (einsatz?.einsatzTyp === "uebung") {
        const ut = einsatz.uebungsTyp ?? "Sonstige";
        const cur = uebungsTypenMap.get(ut) ?? { anzahl: 0, stunden: 0 };
        cur.stunden += (headcount * dauerMin) / 60;
        uebungsTypenMap.set(ut, cur);
      }
    }
    // Atemschutz
    for (const slot of m) {
      if (slot?.atemschutzAktiv === true) {
        asPersonenGesamt++;
        if (typeof slot.atemschutzDauerMin === "number") {
          totals.asStunden += slot.atemschutzDauerMin / 60;
        }
      }
    }
  }
  totals.asTrupps = Math.ceil(asPersonenGesamt / 2);
  totals.mannschaftStunden = Math.round(totals.mannschaftStunden * 100) / 100;
  totals.asStunden = Math.round(totals.asStunden * 100) / 100;
  totals.kmGesamt = Math.round(totals.kmGesamt * 100) / 100;
  totals.kmLotsendienst = Math.round(totals.kmLotsendienst * 100) / 100;

  // Monate sortiert
  const monate = Array.from(monateMap.entries())
    .map(([monat, counts]) => ({ monat, ...counts }))
    .sort((a, b) => a.monat.localeCompare(b.monat));

  const uebungsTypen = Array.from(uebungsTypenMap.entries())
    .map(([typ, v]) => ({ typ, anzahl: v.anzahl, stunden: Math.round(v.stunden * 100) / 100 }))
    .sort((a, b) => b.anzahl - a.anzahl);

  const topEinsatzarten = Array.from(einsatzartenMap.entries())
    .map(([art, anzahl]) => ({ art, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, 10);

  return {
    range: { from, to },
    totals,
    monate,
    uebungsTypen,
    topEinsatzarten,
    generatedAt: new Date().toISOString(),
  };
}
