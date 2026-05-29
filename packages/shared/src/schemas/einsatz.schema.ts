import { z } from "zod";
import { BETEILIGTE_STELLEN, EINSATZARTEN, SONSTIGE_FF } from "../constants/einsatzarten.js";

/**
 * Einsatz — zentral angelegt aus BlaulichtSMS-Alarm, ergänzt durch Hauptbericht-Felder.
 * Siehe Spec Datenmodell 5.1 und Anhang B.
 */

const KoordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const ZeitmarkeSchema = z.object({
  uhrzeit: z.string().datetime().optional(),
  anforderer: z.string().optional(),
});

const FahrzeugPositionSchema = z.object({
  fahrzeugId: z.string(),
  lat: z.number(),
  lng: z.number(),
  timestamp: z.string().datetime(),
  accuracyM: z.number().optional(),
});

/**
 * Chronik-Eintrag — wird sowohl vom Cross-Sync-Broadcast (`source`/`text`/
 * `funkrufname`) als auch vom klassischen Tablet-Diktat (`typ`/`transkript`)
 * geschrieben. Die beiden Shapes laufen historisch nebeneinander; das Schema
 * akzeptiert beide damit der Round-Trip Read→Write durch `PUT /api/einsaetze/:id`
 * nicht an strikten Field-Constraints scheitert.
 */
export const ChronikEintragSchema = z
  .object({
    id: z.string().min(1),
    zeitstempel: z.string(),
    // Cross-Sync-Broadcast-Shape (Florianstation + Fahrzeug-Tablets):
    funkrufname: z.string().optional(),
    fahrzeugId: z.string().optional(),
    source: z.enum(["blaulichtsms", "fahrzeug", "manuell", "atemschutz"]).optional(),
    text: z.string().optional(),
    pending: z.boolean().optional(),
    // Legacy/Tablet-Diktat-Shape:
    typ: z.enum(["diktat", "manuell", "auto-blaulichtsms"]).optional(),
    audioBlobId: z.string().optional(),
    transkript: z.string().optional(),
    transkriptStatus: z
      .enum(["pending", "verfuegbar", "manuell-korrigiert", "fehlgeschlagen"])
      .optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export const ReaktivierungSchema = z.object({
  vonBenutzerId: z.string(),
  am: z.string().datetime(),
  grund: z.string().min(10, "Reaktivierungs-Grund mind. 10 Zeichen"),
  vonStatus: z.literal("abgeschlossen"),
});

export const ManuellAnlageSchema = z.object({
  vonBenutzerId: z.string(),
  am: z.string().datetime(),
  grund: z.string().optional(),
});

export const EinsatzSchema = z.object({
  _id: z.string().regex(/^einsatz:.+$/, "Erwartet 'einsatz:<id>'"),
  _rev: z.string().optional(),
  type: z.literal("einsatz"),

  /**
   * Typ des Einsatzes:
   *  - "alarm"        : aus BlaulichtSMS gepullt (FR-1)
   *  - "manuell"      : Sonstige Tätigkeit ohne Alarm (FR-12)
   *  - "lotsendienst" : Lotsendienst (Polizei/Rettung/Gemeinde)
   *  - "uebung"       : Übung / Training / Bewerbsvorbereitung
   * Wird im Bericht-Header sichtbar gemacht (Badge) und im Archiv-Filter
   * sowie im PDF unterschiedlich behandelt.
   */
  einsatzTyp: z
    .enum(["alarm", "manuell", "lotsendienst", "uebung"])
    .default("alarm"),
  manuellAngelegt: ManuellAnlageSchema.optional(),

  /** Lotsendienst-spezifisch: wer hat den Auftrag erteilt? */
  lotsendienstAuftraggeber: z.string().optional(),
  /** Lotsendienst-spezifisch: kurze Routen-Beschreibung. */
  lotsendienstRoute: z.string().optional(),
  /** Lotsendienst-spezifisch: Verrechnungs-Adresse (Default aus verrechnung.rechnungsadresse). */

  /** Übungs-spezifisch: Thema / Schwerpunkt. */
  uebungThema: z.string().optional(),
  /** Übungs-spezifisch: Übungsleiter-Name. */
  uebungsleiter: z.string().optional(),
  /** Übungs-spezifisch: Übungstyp (z. B. Atemschutz, Höhenrettung, Bewerb). */
  uebungsTyp: z
    .enum([
      "Atemschutz",
      "Technische Hilfeleistung",
      "Höhenrettung",
      "Sanitätsdienst",
      "Funk",
      "Allgemeine Übung",
      "Bewerb",
      "Sonstige",
    ])
    .optional(),

  /** Audit-Trail aller Reaktivierungen nach Abschluss (FR-14). */
  reaktivierungen: z.array(ReaktivierungSchema).default([]),
  /** Wird automatisch true bei status=abgeschlossen, false bei Reaktivierung. */
  schreibschutz: z.boolean().default(false),

  // — Aus BlaulichtSMS (vorgefüllt, editierbar) — nur bei einsatzTyp="alarm" —
  alarmId: z.string().optional(),
  einsatzort: z.string(),
  einsatzortPostleitzahl: z.string().optional(),
  einsatzortOrt: z.string().optional(),
  koordinaten: KoordinateSchema.optional(),
  alarmierungZeit: z.string().datetime(),
  alarmierungAudio: z.string().optional(),
  alarmierungAuthor: z.string().optional(),
  alarmierungText: z.string().optional(),

  // — Manuell vom Einsatzleiter erfasst (Hauptbericht, Anhang B) —
  // einsatzart kann aus BlaulichtSMS frei kommen ("Brand KFZ" matched bei uns
  // den Enum, "B2-Verkehrsunfall" aber nicht). Wir akzeptieren beides.
  einsatzart: z.union([z.enum(EINSATZARTEN), z.string()]).optional(),
  einsatzartFreitext: z.string().optional(),
  warnAlarmsystemNr: z.string().optional(),
  pflichtbereich: z.boolean().optional(),
  einsatzzoneEzell: z.boolean().optional(),
  ueberOertlicheHilfe: z.boolean().optional(),
  alarmiertDurch: z.enum(["BWST", "LWZ"]).optional(),
  einsatzauftragVia: z.enum(["WAS", "Funk", "Telefon", "Bote", "Behoerde"]).optional(),
  anrufer: z.string().optional(),
  anruferTel: z.string().optional(),

  zeitmarken: z
    .object({
      lageUnterKontrolle: z.string().datetime().optional(),
      brandAus: z.string().datetime().optional(),
      alst2: ZeitmarkeSchema.optional(),
      alst3: ZeitmarkeSchema.optional(),
    })
    .default({}),

  beteiligteStellen: z.array(z.enum(BETEILIGTE_STELLEN)).default([]),
  sonstigeAnwesendeFF: z
    .object({
      aktive: z.array(z.enum(SONSTIGE_FF)).default([]),
      sonstigeFreitext: z.string().optional(),
    })
    .default({}),

  mannschaft: z
    .object({
      bereitschaft: z.number().int().min(0).default(0),
      sonstige: z.number().int().min(0).default(0),
      // eingesetzt wird via CouchDB-View aus Fahrzeugberichten aggregiert
    })
    .default({}),

  /**
   * Reserve-Mannschaft — Personen die im Haus blieben aber zum Einsatz
   * "zur Verfügung standen" (z. B. Bereitschaftsdienst, Reserve-Atemschutz-
   * Trupp am Florianhaus, Mitglieder die für Auf-/Nachschub angerückt sind
   * aber nicht ausgerückt). Wird vom Sachbearbeiter in der Florianstation
   * gepflegt, NICHT von den Fahrzeug-Tablets.
   *
   * Personen-Referenzen via syBOS-ID — die Anzeige (Vorname/Nachname) erfolgt
   * über das `person:*`-Doc-Cache in der PWA/Backoffice.
   */
  reservePersonIds: z.array(z.number().int().positive()).default([]),

  verrechnung: z
    .object({
      verrechenbar: z.boolean().default(false),
      rechnungsadresse: z.string().optional(),
    })
    .default({}),

  /** Aggregiert aus Fahrzeugberichten (oelbindemittelSaecke). */
  oelbindemittel: z
    .object({
      verwendet: z.boolean().default(false),
      gesamtSaecke: z.number().int().min(0).default(0),
    })
    .default({}),

  meldungEinsatzleitung: z.string().default(""),

  einsatzleiterPersonId: z.number().int().optional(),
  bearbeiterPersonId: z.number().int().optional(),

  status: z.enum(["aktiv", "abgeschlossen"]).default("aktiv"),
  /**
   * Optionale Disposition: welche Fahrzeuge sind diesem Einsatz zugewiesen?
   * Leer/undefined → alle Tablets sehen den Einsatz (BlaulichtSMS-Default).
   * Liste vorhanden → nur die zugewiesenen Fahrzeug-Tablets pollen ihn,
   * andere bleiben in IdleView. Florianstation sieht IMMER alles.
   * "zentrale" ist absichtlich nicht erlaubt — Florianstation ist
   * Disposition, kein Einsatzfahrzeug.
   */
  zugewieseneFahrzeuge: z
    .array(z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf"]))
    .optional(),
  einsatzende: z.string().datetime().optional(),

  /** Live-Stream im Einsatz, Audit-Trail nach Abschluss. */
  fahrzeugPositionen: z.array(FahrzeugPositionSchema).default([]),
  chronik: z.array(ChronikEintragSchema).default([]),

  // — Audit-Felder —
  erstelltAm: z.string().datetime(),
  geaendertAm: z.string().datetime(),
});

export type Einsatz = z.infer<typeof EinsatzSchema>;
export type ChronikEintrag = z.infer<typeof ChronikEintragSchema>;
export type FahrzeugPosition = z.infer<typeof FahrzeugPositionSchema>;
export type Reaktivierung = z.infer<typeof ReaktivierungSchema>;
export type ManuellAnlage = z.infer<typeof ManuellAnlageSchema>;
