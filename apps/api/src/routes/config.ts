/**
 * Generische Konfigurations-CRUD-Routes für Stammdaten, die in der
 * Verwaltung editierbar sein sollen:
 *
 *   - geraete         (per Fahrzeug)
 *   - auftragstypen   (global)
 *   - einsatzstichworte (global)
 *   - stammdaten      (global · Funkrufnamen, AS-Konfig, Heim-Koord)
 *
 * CouchDB-Docs:
 *   config:auftragstypen      → { type, items: string[] }
 *   config:einsatzstichworte  → { type, items: [{art, kategorie, standardStufe}] }
 *   config:geraete            → { type, byFahrzeug: { kdo: [{id,bezeichnung}], … } }
 *   config:stammdaten         → { type, ...freie key-value-Werte }
 *
 * GET → liefert das Doc (mit Defaults falls noch nicht angelegt).
 * PUT → upsert, behält _rev korrekt.
 */

import { Router, type RequestHandler } from "express";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const configRouter: Router = Router();

const KEYS = [
  "auftragstypen",
  "einsatzstichworte",
  "geraete",
  "stammdaten",
  "tablet-pins",
  "tablet-inventar",
  "beteiligte-stellen",
  "sonstige-ff",
  "app-version",
] as const;
type ConfigKey = (typeof KEYS)[number];

/**
 * Manche Config-Keys enthalten Secrets (Tablet-PINs) und dürfen nur
 * Funktionäre lesen — eine Mannschafts-Session vom Fahrzeug-Tablet
 * darf NICHT die PINs aller anderen Fahrzeuge enumerieren.
 */
const RESTRICTED_KEYS = new Set<ConfigKey>(["tablet-pins", "tablet-inventar"]);

interface ConfigDoc {
  _id: string;
  _rev?: string;
  type: "config";
  key: ConfigKey;
  /** Eigentliche Daten — Schema abhängig vom key. */
  data: Record<string, unknown>;
  geaendertAm: string;
}

const DEFAULTS: Record<ConfigKey, Record<string, unknown>> = {
  auftragstypen: {
    items: [
      "Brandbekämpfung außen",
      "Brandbekämpfung innen",
      "Atemschutz-Trupp",
      "Verkehrsabsicherung",
      "Wassertransport",
      "Personenrettung",
      "Technische Hilfeleistung",
      "Drehleiter-Einsatz",
      "Nachlöscharbeiten",
      "Beleuchtung sichern",
    ],
  },
  einsatzstichworte: {
    items: [
      { art: "Brand KFZ", kategorie: "brand" },
      { art: "Brand Wohnhaus", kategorie: "brand" },
      { art: "Brand Gewerbe", kategorie: "brand" },
      { art: "BMA", kategorie: "brand" },
      { art: "Brandverdacht", kategorie: "brand" },
      { art: "Brand Kamin", kategorie: "brand" },
      { art: "Flurbrand", kategorie: "brand" },
      { art: "VU Eingekl. Per.", kategorie: "technisch" },
      { art: "Personenrettung", kategorie: "technisch" },
      { art: "Sturm", kategorie: "technisch" },
      { art: "Ölspur", kategorie: "technisch" },
      { art: "Pumparbeiten", kategorie: "technisch" },
      { art: "Lift", kategorie: "technisch" },
      { art: "Wasserschaden", kategorie: "technisch" },
      { art: "Höhenrettungseins.", kategorie: "technisch" },
      { art: "Bienen / Wespen", kategorie: "technisch" },
    ],
  },
  geraete: {
    byFahrzeug: {
      kdo: [
        { id: "funkgeraet-handy", bezeichnung: "Handfunkgeräte" },
        { id: "atemschutz-set", bezeichnung: "Atemschutz-Reserve" },
        { id: "erste-hilfe", bezeichnung: "Erste-Hilfe-Set" },
        { id: "absperrband", bezeichnung: "Absperrband" },
        { id: "warnleuchten", bezeichnung: "Warnleuchten" },
      ],
      "tlf-a-4000": [
        { id: "schlauchmaterial", bezeichnung: "Schlauchmaterial" },
        { id: "loeschwasser-2000", bezeichnung: "Löschwasser 2000l" },
        { id: "loeschwasser-4000", bezeichnung: "Löschwasser 4000l (voll)" },
        { id: "schaumrohr", bezeichnung: "Schaumrohr" },
        { id: "schaummittel", bezeichnung: "Schaummittel" },
        { id: "tank-nachfuellung", bezeichnung: "Tank-Nachfüllung" },
        { id: "monitor", bezeichnung: "Wasserwerfer/Monitor" },
      ],
      "lfa-b": [
        { id: "ts-pumpe", bezeichnung: "TS Pumpe" },
        { id: "generator", bezeichnung: "Generator" },
        { id: "schlauchmaterial", bezeichnung: "Schlauchmaterial" },
        { id: "seilwinde", bezeichnung: "Seilwinde" },
        { id: "steckleiter", bezeichnung: "Steckleiter" },
        { id: "hochdruckluefter", bezeichnung: "Hochdrucklüfter" },
        { id: "schaumrohr", bezeichnung: "Schaumrohr" },
        { id: "oelbindemittel", bezeichnung: "Ölbindemittel", isOelbindemittel: true },
        { id: "hydraulischer-rettungssatz", bezeichnung: "Hydraulischer Rettungssatz" },
        { id: "waermebildkamera", bezeichnung: "Wärmebildkamera" },
        { id: "motorsaege", bezeichnung: "Motorsäge" },
      ],
      mtf: [
        { id: "transportplaetze", bezeichnung: "Personentransport" },
        { id: "atemschutz-reserve", bezeichnung: "Atemschutz-Reserve" },
        { id: "verpflegung", bezeichnung: "Verpflegung" },
        { id: "decke-rettung", bezeichnung: "Rettungsdecken" },
        { id: "hr-anhaenger", bezeichnung: "HR-Anhänger gezogen" },
        { id: "hoehenretter-anhaenger", bezeichnung: "Höhenretter-Anhänger" },
        { id: "absperrmaterial", bezeichnung: "Absperrmaterial" },
      ],
    },
  },
  stammdaten: {
    funkrufnamen: {
      kdo: "Kommando Eberstalzell",
      "tlf-a-4000": "Tank Eberstalzell",
      "lfa-b": "Pumpe Eberstalzell",
      mtf: "MTF Eberstalzell",
      zentrale: "Florian Eberstalzell",
    },
    atemschutz: { maxDauerMin: 30, schritteMin: 5 },
    heimkoord: { lat: 48.0884, lng: 13.9586 },
    bezirk: "Wels-Land",
    feuerwehrhausAdresse: "Solarstraße 1, 4653 Eberstalzell",
  },
  "tablet-pins": {
    // Default-PINs beim Bootstrap. Funktionär ändert sie über die
    // Verwaltung sobald die Tablets ausgegeben werden.
    pins: {
      kdo: "1234",
      "tlf-a-4000": "1234",
      "lfa-b": "1234",
      mtf: "1234",
      zentrale: "1234",
    },
    geaendertVon: "system-default",
  },
  // Hardware-Inventar pro Fahrzeug-Tablet. Wird vom Funktionär gepflegt
  // — die App selbst kann IMEI/SIM-Nr nicht auslesen (Android verbietet
  // das für PWAs). Sinn: Diebstahl-/Verlust-Sperrung über A1/Magenta,
  // Inventur, Versicherungs-Nachweis.
  "tablet-inventar": {
    byFahrzeug: {
      kdo: {
        modell: "",
        imei: "",
        simTelNr: "",
        macWlan: "",
        macBluetooth: "",
        inventarNr: "",
        anschaffungsDatum: "",
        notiz: "",
      },
      "tlf-a-4000": {
        modell: "",
        imei: "",
        simTelNr: "",
        macWlan: "",
        macBluetooth: "",
        inventarNr: "",
        anschaffungsDatum: "",
        notiz: "",
      },
      "lfa-b": {
        modell: "",
        imei: "",
        simTelNr: "",
        macWlan: "",
        macBluetooth: "",
        inventarNr: "",
        anschaffungsDatum: "",
        notiz: "",
      },
      mtf: {
        modell: "",
        imei: "",
        simTelNr: "",
        macWlan: "",
        macBluetooth: "",
        inventarNr: "",
        anschaffungsDatum: "",
        notiz: "",
      },
      zentrale: {
        modell: "",
        imei: "",
        simTelNr: "",
        macWlan: "",
        macBluetooth: "",
        inventarNr: "",
        anschaffungsDatum: "",
        notiz: "",
      },
    },
  },
  // Liste der ueblicherweise mit-anwesenden Stellen. Funktionaer kann sie
  // im Backoffice pflegen — neue Eintraege werden auf der Florianstation
  // im Editor sofort als Chips zur Verfuegung gestellt.
  "beteiligte-stellen": {
    items: [
      "Polizei",
      "Rotes Kreuz",
      "Notarzt",
      "Bundesheer",
      "ÖAMTC",
      "ARBÖ",
      "Bürgermeister",
      "Gemeindearbeiter",
      "Strom-/Gasversorger",
      "Wasserversorger",
    ],
  },
  // Liste der ueblicherweise mit-anwesenden Feuerwehren (Nachbarwehren). Die
  // Liste wird vom Funktionaer im Backoffice gepflegt.
  "sonstige-ff": {
    items: [
      "FF Steinerkirchen",
      "FF Krenglbach",
      "FF Sipbachzell",
      "FF Bad Wimsbach",
      "FF Schleißheim",
      "FF Stadl-Paura",
      "FF Lambach",
      "FF Pichl bei Wels",
    ],
  },
  // Aktuelle empfohlene App-Version + APK-URL. Wird vom Update-Banner
  // der App alle 6h gepollt. Der Funktionaer pflegt das nach jedem Release.
  "app-version": {
    currentVersion: "0.1.6",
    apkUrl: "https://hotdoc-apk.fly.dev/hotdoc-v0.1.6-release.apk",
    releaseNotes:
      "v0.1.6 — Auto-Update via Release-Builds\n\n• Erste signierte Release-APK — ab jetzt kein Deinstallieren mehr bei Updates noetig.\n• UpdateBanner: 1-Klick-Update direkt aus der App mit Progress-Bar. Android-Dialog 'Aktualisieren?' erscheint, fertig.\n• Custom ApkInstaller-Capacitor-Plugin ersetzt den Browser-Umweg.\n• Beim ersten Install (v0.1.5-debug -> v0.1.6-release) noch einmalig manuell deinstallieren wegen Signing-Key-Wechsel.",
    minSupported: "0.1.0",
  },
};

function isValidKey(k: string): k is ConfigKey {
  return (KEYS as readonly string[]).includes(k);
}

async function loadConfig(key: ConfigKey): Promise<ConfigDoc> {
  const id = `config:${key}`;
  try {
    return (await db.get(id)) as ConfigDoc;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      return {
        _id: id,
        type: "config",
        key,
        data: DEFAULTS[key],
        geaendertAm: new Date().toISOString(),
      };
    }
    throw err;
  }
}

/** GET /api/config/:key — liefert das Doc, oder Defaults wenn noch nicht angelegt. */
configRouter.get("/api/config/:key", requireAuth(), (async (req, res) => {
  const key = String(req.params.key);
  if (!isValidKey(key)) {
    res.status(404).json({ error: "unknown_config_key", validKeys: KEYS });
    return;
  }
  // tablet-pins enthält Secrets — nur Funktionäre dürfen sie sehen.
  if (RESTRICTED_KEYS.has(key) && req.session?.rolle !== "funktionaer" && req.session?.rolle !== "admin") {
    res.status(403).json({ error: "insufficient_role", required: "funktionaer" });
    return;
  }
  const doc = await loadConfig(key);
  res.json({ ok: true, key, data: doc.data, geaendertAm: doc.geaendertAm });
}) as RequestHandler);

/** PUT /api/config/:key — überschreibt data. Server setzt geaendertAm und upsertet. */
configRouter.put("/api/config/:key", requireAuth("funktionaer"), (async (req, res) => {
  const key = String(req.params.key);
  if (!isValidKey(key)) {
    res.status(404).json({ error: "unknown_config_key", validKeys: KEYS });
    return;
  }
  // tablet-pins-Änderung verlangt mindestens funktionaer (admin via Rang-OK)
  // — der Auth-Guard oben deckt das ab.
  const data: Record<string, unknown> = req.body?.data ?? {};
  const id = `config:${key}`;
  let _rev: string | undefined;
  try {
    const existing = (await db.get(id)) as ConfigDoc;
    _rev = existing._rev;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
  const doc: ConfigDoc = {
    _id: id,
    ...(_rev ? { _rev } : {}),
    type: "config",
    key,
    data,
    geaendertAm: new Date().toISOString(),
  };
  const result = await db.insert(doc);
  logger.info({ key, rev: result.rev, by: req.session?.username }, "Config aktualisiert");
  res.json({ ok: true, key, data, geaendertAm: doc.geaendertAm, rev: result.rev });
}) as RequestHandler);
