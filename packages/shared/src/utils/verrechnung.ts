/**
 * Verrechnung nach der Feuerwehr-Tarifordnung 2026 (Oö. LFV, Richtlinie 6.3.006).
 *
 * Reine Funktionen ohne I/O — dieselbe Logik rechnet im Backoffice (Vorschau),
 * im PDF-Verrechnungsblatt und im Markdown-Export. Die Regeln stammen aus
 * Abschnitt 2 "Berechnungsgrundsaetze" der Tarifordnung:
 *
 *  (3)  Wegzeiten (Standort → Einsatzort → zurueck) zaehlen zur Zeit — wir
 *       rechnen mit der Fahrzeugzeit von/bis aus dem Fahrzeugbericht.
 *  (4)  Stundensatz: die ERSTE Stunde ist immer voll zu verrechnen
 *       (Mindestverrechnung 1 Std.). Jede weitere angefangene Stunde: bis
 *       30 Min. der halbe, darueber der volle Stundensatz. Gibt es einen
 *       Pauschaltarif, gilt bis 4 Std. der Stundensatz, ab der angefangenen
 *       5. Stunde der Pauschaltarif.
 *  (5)  Pauschaltarif deckt 12 Std. (Pos. 2 u. 4) bzw. 24 Std. (uebrige);
 *       darueber hinaus wird wie ab Beginn der Inanspruchnahme gerechnet.
 *  (6)  Geraete/Ausruestung, die auf einem zu verrechnenden Einsatzfahrzeug
 *       verlastet sind (Beladeplan), werden NICHT gesondert verrechnet —
 *       ausgenommen Pos. 2.15 und Verbrauchsmaterial (Tarif D). Zusaetzlich
 *       mitgefuehrte Geraete sind nach Tarif A zu verrechnen.
 *  (7)  Nur bereitgestellte (nicht eingesetzte) Fahrzeuge/Anhaenger: 60 %.
 *  (9)  Bedienungsmannschaft nach Pos. 1.01.
 *  (10) Nur Fahrzeuge/Geraete/Mannschaft, die tatsaechlich erforderlich waren.
 *
 * Beträge in EURO, kaufmaennisch auf Cent gerundet. USt: nicht umsatzsteuerpflichtig
 * (§ 2 Abs. 3 UStG).
 */

import {
  TARIF_GRUPPEN,
  findeTarifPosition,
  type TarifPosition,
} from "../constants/tarifordnung.js";

export type VerrechnungsArt = "hoheitlich" | "nicht-hoheitlich";

/** Vom Funktionaer ueberschriebene Preise (z. B. bei neuer Tarifordnung). */
export interface PreisUeberschreibung {
  satzStunde?: number;
  satzPauschal?: number;
  festbetrag?: number;
  mindestbetrag?: number;
}

/** Konfiguration (Backoffice "Tarifordnung") — config:tarifordnung. */
export interface TarifEinstellungen {
  /** Fahrzeug-Id → Tarifposition (Anlage I, Tarif A, Pkt. 2), z. B. "lfa-b": "2.04". */
  fahrzeugTarif: Record<string, string>;
  /** Anhaenger ("HR-Anhaenger" | "PKW-Anhaenger") → Tarifposition (2.21–2.23). */
  anhaengerTarif: Record<string, string>;
  /** Tarifposition des Gabelstaplers (Vergleichsleistung nach Pkt. 4 Abs. 1). */
  staplerTarif: string;
  /** Preis-Ueberschreibungen je Tarifposition. */
  preise: Record<string, PreisUeberschreibung>;
  /** Tagespreise fuer Verbrauchsmaterial (Tarif D), die wir kennen. */
  verbrauchspreise: { oelbindemittelSack?: number };
}

export const TARIF_STANDARD_EINSTELLUNGEN: TarifEinstellungen = {
  // Vorbelegung — bitte im Backoffice gegen die Zulassung/Gesamtgewichte pruefen.
  fahrzeugTarif: {
    kdo: "2.01",
    "tlf-a-4000": "2.04",
    "lfa-b": "2.04",
    mtf: "2.02",
  },
  anhaengerTarif: {
    "PKW-Anhaenger": "2.21",
    "HR-Anhaenger": "2.22",
  },
  staplerTarif: "2.20",
  preise: {},
  verbrauchspreise: {},
};

/** Einstellungen aus einem (evtl. unvollstaendigen) config-Doc auffuellen. */
export function normalisiereTarifEinstellungen(roh: unknown): TarifEinstellungen {
  const r = (roh && typeof roh === "object" ? roh : {}) as Partial<TarifEinstellungen>;
  const s = TARIF_STANDARD_EINSTELLUNGEN;
  return {
    fahrzeugTarif: { ...s.fahrzeugTarif, ...(r.fahrzeugTarif ?? {}) },
    anhaengerTarif: { ...s.anhaengerTarif, ...(r.anhaengerTarif ?? {}) },
    staplerTarif: typeof r.staplerTarif === "string" && r.staplerTarif ? r.staplerTarif : s.staplerTarif,
    preise: { ...(r.preise ?? {}) },
    verbrauchspreise: { ...(r.verbrauchspreise ?? {}) },
  };
}

// ─── Eingaben je Einsatz (am Einsatz-Doc gespeichert: `verrechnung`) ───────────

export interface VerrechnungFzgEingabe {
  /** Dauer manuell festlegen (Minuten) statt Fahrzeugzeit von/bis. */
  minuten?: number;
  /** Nur bereitgestellt, nicht eingesetzt → 60 % (§ 2 Abs. 7). */
  nurBereitgestellt?: boolean;
  /** War nicht erforderlich → nicht verrechnen (§ 2 Abs. 10). */
  nichtErforderlich?: boolean;
  bemerkung?: string;
}

/** Zusaetzliche Position aus der Tarifordnung (z. B. 12.01 Wohnungsoeffnung, Zusatzgeraet). */
export interface VerrechnungZusatz {
  id: string;
  pos: string;
  /** Anzahl (Stk./Personen/Fahrten …), Standard 1. */
  menge?: number;
  /** Dauer in Minuten (bei Positionen mit Stunden-/Pauschaltarif). */
  minuten?: number;
  /** Betrag bei "nach Aufwand" (Pos. mit Mindestbetrag: nie darunter). */
  betrag?: number;
  bemerkung?: string;
}

/** Verbrauchsmaterial (Tarif D) — Betrag nach Tagespreis, immer getrennt. */
export interface VerrechnungVerbrauch {
  id: string;
  /** 14.01 Kraftstoffe/Oele, 14.02 Poelzmaterial, 14.03 Atemschutz, 14.04 Sonstiges. */
  pos: "14.01" | "14.02" | "14.03" | "14.04";
  text: string;
  menge?: number;
  /** Gesamtbetrag in EURO (nach Tagespreis). */
  betrag?: number;
}

export interface VerrechnungEingaben {
  art?: VerrechnungsArt;
  fahrzeuge?: Record<string, VerrechnungFzgEingabe>;
  zusatz?: VerrechnungZusatz[];
  verbrauch?: VerrechnungVerbrauch[];
  bemerkung?: string;
  geaendertAm?: string;
  geaendertVon?: string;
}

// ─── Eingangsdaten (aus BerichtDaten) ─────────────────────────────────────────

export interface VerrechnungFahrzeug {
  fahrzeugId: string;
  /** Funkrufname bzw. Bezeichnung fuer die Anzeige. */
  bezeichnung: string;
  zeitVon?: string;
  zeitBis?: string;
  /** Eingesetzte Personen (Fahrer, Kdt., Mannschaft) — key = syBOS-Id bzw. Name. */
  personen: Array<{ key: string; name: string }>;
  /** Mitgefuehrte Anhaenger ("HR-Anhaenger" | "PKW-Anhaenger"). */
  anhaenger: string[];
}

export interface VerrechnungInput {
  einsatzTyp?: string;
  alarmierungZeit?: string;
  einsatzende?: string;
  fahrzeuge: VerrechnungFahrzeug[];
  staplerEingesetzt?: boolean;
  oelbindemittelSaecke?: number;
  eingaben?: VerrechnungEingaben;
  einstellungen?: TarifEinstellungen;
}

// ─── Ausgabe ──────────────────────────────────────────────────────────────────

export type VerrechnungsGruppe = "fahrzeuge" | "mannschaft" | "zusatz" | "verbrauch";

export interface VerrechnungsZeile {
  gruppe: VerrechnungsGruppe;
  pos: string;
  text: string;
  /** Dauer/Menge in Klartext, z. B. "1 Std. 25 Min. → 2 Std. verrechnet". */
  mengeText: string;
  /** Tarifsatz in Klartext, z. B. "129,80 / Std." */
  tarifText: string;
  /** Betrag in EURO; null = noch offen (nach Aufwand/Tagespreis, nicht erfasst). */
  betrag: number | null;
  hinweis?: string | undefined;
}

export interface VerrechnungErgebnis {
  tarifJahr: number;
  art: VerrechnungsArt | null;
  /** Ueberschrift fuer das Verrechnungsblatt. */
  artText: string;
  zeilen: VerrechnungsZeile[];
  /** Summe aller erfassten Betraege (offene Positionen zaehlen 0). */
  summe: number;
  /** Mindestens eine Position ohne Betrag (nach Aufwand/Tagespreis). */
  hatOffenePositionen: boolean;
  warnungen: string[];
  /** Feste Hinweise aus der Tarifordnung (immer im Blatt). */
  hinweise: string[];
}

// ─── Rechenkern ───────────────────────────────────────────────────────────────

const runde = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Abrechnungsstunden nach § 2 Abs. 4: 1. Stunde voll; jede weitere angefangene
 * Stunde bis 30 Min. halb, darueber voll. 0 Min. = 0.
 */
export function abrechnungsStunden(minuten: number): number {
  const m = Math.round(minuten);
  if (!(m > 0)) return 0;
  if (m <= 60) return 1;
  const rest = m - 60;
  const voll = Math.floor(rest / 60);
  const teil = rest - voll * 60;
  return 1 + voll + (teil === 0 ? 0 : teil <= 30 ? 0.5 : 1);
}

/** "1 Std. 25 Min." / "45 Min." / "2 Std." */
export function dauerText(minuten: number): string {
  const m = Math.max(0, Math.round(minuten));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} Min.`;
  return r === 0 ? `${h} Std.` : `${h} Std. ${r} Min.`;
}

const dezimal = (n: number): string => String(n).replace(".", ",");

/** Euro-Betrag in oesterreichischer Schreibweise: 1.234,50 */
export function euroText(n: number): string {
  const [ganz, cent] = runde(n).toFixed(2).split(".") as [string, string];
  return `${ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cent}`;
}

/** Tarifposition mit Preis-Ueberschreibungen. */
export function wirksamePosition(
  pos: string,
  preise: Record<string, PreisUeberschreibung> = {},
): TarifPosition | undefined {
  const basis = findeTarifPosition(pos);
  if (!basis) return undefined;
  const o = preise[pos];
  return o ? { ...basis, ...stripUndef(o) } : basis;
}

function stripUndef<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export interface PositionsBetrag {
  betrag: number | null;
  mengeText: string;
  tarifText: string;
  hinweis?: string | undefined;
}

/**
 * Betrag einer Tarifposition fuer `minuten` Dauer und `menge` Einheiten (z. B. Personen).
 * `betrag` nur fuer "nach Aufwand"-Positionen (Mindestbetrag gilt immer).
 */
export function berechnePosition(
  p: TarifPosition,
  opt: { minuten?: number | undefined; menge?: number | undefined; betrag?: number | undefined } = {},
): PositionsBetrag {
  const menge = opt.menge && opt.menge > 0 ? opt.menge : 1;
  const minuten = Math.round(opt.minuten ?? 0);
  const mx = menge > 1 ? `${menge} × ` : "";

  switch (p.einheit) {
    case "stunde": {
      const satz = p.satzStunde ?? 0;
      if (minuten <= 0) return { betrag: null, mengeText: "Dauer fehlt", tarifText: `${euroText(satz)} / Std.` };
      const std = abrechnungsStunden(minuten);
      return {
        betrag: runde(std * satz * menge),
        mengeText: `${mx}${dauerText(minuten)} → ${dezimal(std)} Std. verrechnet`,
        tarifText: `${euroText(satz)} / Std.`,
        hinweis: std === 1 && minuten < 60 ? "Mindestverrechnung: 1. Stunde voll" : undefined,
      };
    }
    case "viertelstunde": {
      const satz = p.satzStunde ?? 0;
      if (minuten <= 0) return { betrag: null, mengeText: "Dauer fehlt", tarifText: `${euroText(satz)} / Viertelstd.` };
      const q = Math.ceil(minuten / 15);
      return {
        betrag: runde(q * satz * menge),
        mengeText: `${mx}${q} angef. Viertelstd.`,
        tarifText: `${euroText(satz)} / Viertelstd.`,
      };
    }
    case "zeit": {
      const satz = p.satzStunde ?? 0;
      const pausch = p.satzPauschal;
      const tarifText = pausch !== undefined ? `${euroText(satz)} / Std. · Pauschale ${euroText(pausch)}` : `${euroText(satz)} / Std.`;
      if (minuten <= 0) return { betrag: null, mengeText: "Dauer fehlt", tarifText };
      if (pausch === undefined) {
        const std = abrechnungsStunden(minuten);
        return { betrag: runde(std * satz * menge), mengeText: `${mx}${dauerText(minuten)} → ${dezimal(std)} Std. verrechnet`, tarifText };
      }
      const periode = (p.pauschalZeitraumStd ?? 24) * 60;
      const n = Math.floor(minuten / periode);
      const rest = minuten - n * periode;
      let gesamt = n * pausch;
      const teile: string[] = [];
      if (n > 0) teile.push(`${n} × Pauschale (${p.pauschalZeitraumStd ?? 24} Std.)`);
      if (rest > 0) {
        if (rest > 240) {
          gesamt += pausch;
          teile.push("Pauschale (ab 5. angef. Std.)");
        } else {
          const std = abrechnungsStunden(rest);
          gesamt += std * satz;
          teile.push(`${dezimal(std)} Std. verrechnet`);
        }
      }
      return { betrag: runde(gesamt * menge), mengeText: `${mx}${dauerText(minuten)} → ${teile.join(" + ")}`, tarifText };
    }
    case "tagessatz": {
      const fb = p.festbetrag ?? 0;
      const tage = Math.max(1, Math.ceil(minuten / 1440));
      return {
        betrag: runde(fb * tage * menge),
        mengeText: `${mx}${tage} Tagessatz`,
        tarifText: `${euroText(fb)} / Tagessatz`,
      };
    }
    case "stueck":
    case "pauschal":
    case "je_fahrt":
    case "je_monat":
    case "je_fall": {
      const fb = p.festbetrag ?? 0;
      const einh =
        p.einheit === "stueck" ? "Stk." : p.einheit === "je_fahrt" ? "Fahrt" : p.einheit === "je_monat" ? "Monat" : p.einheit === "je_fall" ? "Fall" : "pauschal";
      return {
        betrag: runde(fb * menge),
        mengeText: p.einheit === "pauschal" ? `${mx}pauschal` : `${menge} ${einh}`,
        tarifText: `${euroText(fb)}${p.einheit === "pauschal" ? "" : ` / ${einh}`}`,
        hinweis: p.hinweis,
      };
    }
    case "nach_aufwand": {
      const mind = p.mindestbetrag;
      const eingabe = opt.betrag;
      const tarifText = mind !== undefined ? `nach Aufwand, mind. ${euroText(mind)}` : "nach Aufwand / Tagespreis";
      if (eingabe === undefined && mind === undefined) {
        return { betrag: null, mengeText: "Betrag noch nicht erfasst", tarifText, hinweis: p.hinweis };
      }
      const wert = Math.max(eingabe ?? 0, mind ?? 0);
      return {
        betrag: runde(wert),
        mengeText: eingabe === undefined ? "Mindestbetrag" : "nach Aufwand",
        tarifText,
        hinweis: p.hinweis,
      };
    }
  }
}

// ─── Verrechnungsblatt ────────────────────────────────────────────────────────

/** Lange Zusaetze der Anlage I fuer die Zeilenanzeige kuerzen ("(ausgenommen Sonderfahrzeuge)"). */
function kurzBezeichnung(b: string): string {
  return b.replace(/\s*\(ausgenommen Sonderfahrzeuge\)/, "");
}

function minutenZwischen(von?: string, bis?: string): number | undefined {
  if (!von || !bis) return undefined;
  const a = Date.parse(von);
  const b = Date.parse(bis);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return undefined;
  return Math.round((b - a) / 60000);
}

export const VERRECHNUNG_HINWEISE: ReadonlyArray<string> = [
  "Auf den Einsatzfahrzeugen verlastete Geräte und Ausrüstungsgegenstände (Beladeplan) sind im Fahrzeugtarif enthalten und werden nicht gesondert verrechnet (Tarifordnung Pkt. 2 Abs. 6); ausgenommen Pos. 2.15 und Verbrauchsmaterial (Tarif D).",
  "Die erste Stunde wird immer voll verrechnet; jede weitere angefangene Stunde bis 30 Min. zum halben, darüber zum vollen Stundensatz. Ab der angefangenen 5. Stunde gilt – sofern vorgesehen – der Pauschaltarif (Pkt. 2 Abs. 4 und 5). Wegzeiten sind in der Zeit enthalten (Pkt. 2 Abs. 3).",
  "Die Tarife unterliegen gemäß § 2 Abs. 3 UStG nicht der Umsatzsteuer. Verbrauchsmaterial (Tarif D) wird getrennt nach Tagespreisen vorgeschrieben.",
];

/** Dauer eines Fahrzeugs: manuelle Eingabe > Fahrzeugzeit > Einsatzzeit (Fallback). */
function fahrzeugMinuten(
  f: VerrechnungFahrzeug,
  ein: VerrechnungFzgEingabe | undefined,
  input: VerrechnungInput,
): { minuten: number | undefined; quelle: "eingabe" | "fahrzeug" | "einsatz" | "fehlt" } {
  if (ein?.minuten !== undefined && ein.minuten > 0) return { minuten: Math.round(ein.minuten), quelle: "eingabe" };
  const fz = minutenZwischen(f.zeitVon, f.zeitBis);
  if (fz !== undefined && fz > 0) return { minuten: fz, quelle: "fahrzeug" };
  const es = minutenZwischen(input.alarmierungZeit, input.einsatzende);
  if (es !== undefined && es > 0) return { minuten: es, quelle: "einsatz" };
  return { minuten: undefined, quelle: "fehlt" };
}

export function baueVerrechnung(input: VerrechnungInput): VerrechnungErgebnis {
  const cfg = input.einstellungen ?? TARIF_STANDARD_EINSTELLUNGEN;
  const eing = input.eingaben ?? {};
  const zeilen: VerrechnungsZeile[] = [];
  const warnungen: string[] = [];
  const art = eing.art ?? null;

  const pos = (nr: string): TarifPosition | undefined => wirksamePosition(nr, cfg.preise);

  // Personen: je Person EINE Verrechnung ueber die Spanne aller ihrer Fahrzeuge
  // (wer erst KDO faehrt und dann auf dem TANK sitzt, darf nicht doppelt zaehlen).
  const personSpanne = new Map<string, { name: string; von: number; bis: number; fzg: string }>();

  for (const f of input.fahrzeuge) {
    const fe = eing.fahrzeuge?.[f.fahrzeugId];
    const { minuten, quelle } = fahrzeugMinuten(f, fe, input);
    const tarifNr = cfg.fahrzeugTarif[f.fahrzeugId];
    const tarif = tarifNr ? pos(tarifNr) : undefined;

    if (fe?.nichtErforderlich) {
      warnungen.push(`${f.bezeichnung}: als „nicht erforderlich“ markiert – nicht verrechnet (Pkt. 2 Abs. 10).`);
      continue;
    }

    // Fahrzeug
    if (!tarif) {
      warnungen.push(`${f.bezeichnung}: keine Tarifposition zugeordnet (Backoffice → Tarifordnung).`);
    } else {
      if (minuten === undefined) warnungen.push(`${f.bezeichnung}: Fahrzeugzeit (von/bis) fehlt – Dauer bitte erfassen.`);
      if (quelle === "einsatz") warnungen.push(`${f.bezeichnung}: keine Fahrzeugzeit erfasst – Einsatzdauer (Alarm bis Einsatzende) verwendet.`);
      const b = berechnePosition(tarif, { minuten });
      const bereit = fe?.nurBereitgestellt === true;
      const betrag = b.betrag === null ? null : runde(b.betrag * (bereit ? 0.6 : 1));
      zeilen.push({
        gruppe: "fahrzeuge",
        pos: tarif.pos,
        text: `${f.bezeichnung} – ${kurzBezeichnung(tarif.bezeichnung)}`,
        mengeText: bereit ? `${b.mengeText} · nur bereitgestellt (60 %)` : b.mengeText,
        tarifText: b.tarifText,
        betrag,
        ...(fe?.bemerkung ? { hinweis: fe.bemerkung } : b.hinweis ? { hinweis: b.hinweis } : {}),
      });
    }

    // Anhaenger (Zeit des ziehenden Fahrzeugs)
    for (const a of f.anhaenger) {
      const nr = cfg.anhaengerTarif[a];
      const t = nr ? pos(nr) : undefined;
      const label = a === "HR-Anhaenger" ? "HR-Anhänger" : a === "PKW-Anhaenger" ? "PKW-Anhänger" : a;
      if (!t) {
        warnungen.push(`${label}: keine Tarifposition zugeordnet (Backoffice → Tarifordnung).`);
        continue;
      }
      const b = berechnePosition(t, { minuten });
      const bereit = fe?.nurBereitgestellt === true;
      zeilen.push({
        gruppe: "fahrzeuge",
        pos: t.pos,
        text: `${label} (gezogen von ${f.bezeichnung}) – ${kurzBezeichnung(t.bezeichnung)}`,
        mengeText: bereit ? `${b.mengeText} · nur bereitgestellt (60 %)` : b.mengeText,
        tarifText: b.tarifText,
        betrag: b.betrag === null ? null : runde(b.betrag * (bereit ? 0.6 : 1)),
      });
    }

    // Personen-Spanne: Start = Fahrzeug-von (sonst 0), Ende = Start + Fahrzeugdauer.
    if (minuten !== undefined) {
      const von = f.zeitVon ? Date.parse(f.zeitVon) : NaN;
      const startMs = Number.isNaN(von) ? 0 : von;
      const endeMs = startMs + minuten * 60000;
      for (const pr of f.personen) {
        const alt = personSpanne.get(pr.key);
        if (!alt) personSpanne.set(pr.key, { name: pr.name, von: startMs, bis: endeMs, fzg: f.bezeichnung });
        else personSpanne.set(pr.key, { ...alt, von: Math.min(alt.von, startMs), bis: Math.max(alt.bis, endeMs) });
      }
    }
  }

  // Gabelstapler (Vergleichsleistung)
  if (input.staplerEingesetzt) {
    const fe = eing.fahrzeuge?.["stapler"];
    if (!fe?.nichtErforderlich) {
      const t = pos(cfg.staplerTarif);
      const min =
        fe?.minuten && fe.minuten > 0 ? Math.round(fe.minuten) : minutenZwischen(input.alarmierungZeit, input.einsatzende);
      if (!t) warnungen.push("Gabelstapler: keine Tarifposition zugeordnet (Backoffice → Tarifordnung).");
      else {
        if (min === undefined) warnungen.push("Gabelstapler: Einsatzdauer unbekannt – Dauer bitte erfassen.");
        const b = berechnePosition(t, { minuten: min });
        zeilen.push({
          gruppe: "fahrzeuge",
          pos: t.pos,
          text: `Gabelstapler (vergleichbare Leistung nach Pkt. 4 Abs. 1: ${t.bezeichnung})`,
          mengeText: b.mengeText,
          tarifText: b.tarifText,
          betrag: b.betrag,
          hinweis: "Dauer = Einsatzdauer, sofern nicht anders erfasst",
        });
      }
    }
  }

  // Mannschaft Pos. 1.01
  const p101 = pos("1.01");
  if (p101 && personSpanne.size > 0) {
    // gleiche Dauer zusammenfassen
    const gruppen = new Map<number, string[]>();
    for (const [, v] of personSpanne) {
      const min = Math.round((v.bis - v.von) / 60000);
      const list = gruppen.get(min) ?? [];
      list.push(v.name);
      gruppen.set(min, list);
    }
    const keys = [...gruppen.keys()].sort((a, b) => b - a);
    for (const min of keys) {
      const namen = gruppen.get(min) ?? [];
      const b = berechnePosition(p101, { minuten: min, menge: namen.length });
      zeilen.push({
        gruppe: "mannschaft",
        pos: "1.01",
        text: `Personalaufwand – ${namen.length} ${namen.length === 1 ? "Person" : "Personen"}`,
        mengeText: b.mengeText,
        tarifText: b.tarifText,
        betrag: b.betrag,
        hinweis: namen.join(", "),
      });
    }
  }

  // Zusatzpositionen (Tarif A/B/C)
  for (const z of eing.zusatz ?? []) {
    const t = pos(z.pos);
    if (!t) {
      warnungen.push(`Zusatzposition ${z.pos}: unbekannte Tarifposition.`);
      continue;
    }
    if (t.gruppe === 14) {
      warnungen.push(`Position ${z.pos} (Verbrauchsmaterial) bitte unter „Verbrauchsmaterial“ erfassen.`);
      continue;
    }
    const b = berechnePosition(t, {
      ...(z.minuten !== undefined ? { minuten: z.minuten } : {}),
      ...(z.menge !== undefined ? { menge: z.menge } : {}),
      ...(z.betrag !== undefined ? { betrag: z.betrag } : {}),
    });
    const geraet = t.gruppe >= 3 && t.gruppe <= 11;
    zeilen.push({
      gruppe: "zusatz",
      pos: t.pos,
      text: `${t.bezeichnung}${geraet ? " (zusätzlich mitgeführt, nicht Beladeplan)" : ""}`,
      mengeText: b.mengeText,
      tarifText: b.tarifText,
      betrag: b.betrag,
      ...(z.bemerkung ? { hinweis: z.bemerkung } : b.hinweis ? { hinweis: b.hinweis } : {}),
    });
  }

  // Verbrauchsmaterial (Tarif D) — immer getrennt
  const oel = input.oelbindemittelSaecke ?? 0;
  if (oel > 0) {
    const preis = cfg.verbrauchspreise.oelbindemittelSack;
    zeilen.push({
      gruppe: "verbrauch",
      pos: "14.04",
      text: "Ölbindemittel (Sonstiges Verbrauchsmaterial)",
      mengeText: `${oel} ${oel === 1 ? "Sack" : "Säcke"}`,
      tarifText: preis !== undefined ? `${euroText(preis)} / Sack (Tagespreis)` : "nach Tagespreis",
      betrag: preis !== undefined ? runde(preis * oel) : null,
      ...(preis === undefined ? { hinweis: "Tagespreis noch nicht hinterlegt (Backoffice → Tarifordnung)" } : {}),
    });
  }
  for (const v of eing.verbrauch ?? []) {
    const t = pos(v.pos);
    zeilen.push({
      gruppe: "verbrauch",
      pos: v.pos,
      text: `${v.text}${t ? ` (${t.bezeichnung})` : ""}`,
      mengeText: v.menge && v.menge > 0 ? `${dezimal(v.menge)} Stk./Einh.` : "nach Verbrauch",
      tarifText: "nach Tagespreis",
      betrag: v.betrag !== undefined ? runde(v.betrag) : null,
    });
  }

  const summe = runde(zeilen.reduce((s, z) => s + (z.betrag ?? 0), 0));
  const offen = zeilen.some((z) => z.betrag === null);
  if (offen) warnungen.push("Mindestens eine Position hat noch keinen Betrag (nach Aufwand/Tagespreis) – Summe ist vorläufig.");
  if (zeilen.length === 0) warnungen.push("Keine verrechenbaren Leistungen erfasst.");
  if (!art) warnungen.push("Verrechnungsart (hoheitlich / nicht-hoheitlich) ist noch nicht festgelegt.");

  const artText =
    art === "hoheitlich"
      ? "Hoheitlicher Einsatz – Kosten gemäß Tarifordnung (Kostenausweisung)"
      : art === "nicht-hoheitlich"
        ? "Nicht-hoheitlicher Einsatz – zu verrechnende Kosten gemäß Tarifordnung"
        : "Kosten gemäß Feuerwehr-Tarifordnung (Verrechnungsart noch nicht festgelegt)";

  return {
    tarifJahr: 2026,
    art,
    artText,
    zeilen,
    summe,
    hatOffenePositionen: offen,
    warnungen,
    hinweise: [...VERRECHNUNG_HINWEISE],
  };
}

/** Anzeigename der Tarifgruppe ("2 · Fahrzeuge und Anhänger"). */
export function tarifGruppeText(gruppe: number): string {
  return `${gruppe} · ${TARIF_GRUPPEN[gruppe] ?? ""}`.trim();
}

