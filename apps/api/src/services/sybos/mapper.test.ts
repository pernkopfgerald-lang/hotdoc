import { describe, expect, it } from "vitest";
import { buildAtemschutzSet, mapMaterial, mapPerson } from "./mapper.js";
import type { SyBosMaterialRaw, SyBosPersonRaw, SyBosPersUeberpruefungRaw } from "./client.js";
// Issue 19 (Einsatz-Test 2026-06-02): Tests fuer Autobahn-km-Pattern
import { findAutobahnKm } from "@hotdoc/shared";
import { parseAutobahnPattern } from "../../workers/blaulichtsms-poller.js";

describe("buildAtemschutzSet", () => {
  it("nimmt nur Personen mit gültiger Atemschutz-Prüfung", () => {
    const rows: SyBosPersUeberpruefungRaw[] = [
      { Name: "TestUser One", Pruefungsbezeichnung: "Atemschutz-Tauglichkeit", Status: "o" },
      { Name: "TestUser Two", Pruefungsbezeichnung: "Führerschein C", Status: "o" }, // kein AS
      { Name: "TestUser Three", Pruefungsbezeichnung: "Atemschutz", Status: "e" }, // abgelaufen
      { Name: "TestUser Four", Pruefungsbezeichnung: "atemschutz", Status: "o" }, // case-insensitive
    ];
    const set = buildAtemschutzSet(rows);
    expect(set.has("TestUser One")).toBe(true);
    expect(set.has("TestUser Four")).toBe(true);
    expect(set.has("TestUser Two")).toBe(false);
    expect(set.has("TestUser Three")).toBe(false);
    expect(set.size).toBe(2);
  });

  it("ignoriert Zeilen ohne Name oder Prüfungsbezeichnung", () => {
    const rows: SyBosPersUeberpruefungRaw[] = [
      { Pruefungsbezeichnung: "Atemschutz", Status: "o" },
      { Name: "X", Status: "o" },
    ];
    expect(buildAtemschutzSet(rows).size).toBe(0);
  });
});

describe("mapPerson", () => {
  const raw: SyBosPersonRaw = {
    ID: 107452,
    Nachname: "TestNachname",
    Vorname: "TestVorname",
    Dienstgrad: "OBM",
    Mobil1: "+436641234567",
    Email1: "test@example.at",
    Funktionen: "Maschinist, Atemschutzwart",
  };

  it("baut korrekt das CouchDB-Dokument", () => {
    const asSet = new Set<string>(["TestNachname TestVorname"]);
    const doc = mapPerson(raw, asSet);
    expect(doc).not.toBeNull();
    if (!doc) throw new Error("doc null");
    expect(doc._id).toBe("person:107452");
    expect(doc.type).toBe("person");
    expect(doc.syBosId).toBe(107452);
    expect(doc.nachname).toBe("TestNachname");
    expect(doc.vorname).toBe("TestVorname");
    expect(doc.dienstgrad).toBe("OBM");
    expect(doc.email).toBe("test@example.at");
    expect(doc.mobil1).toBe("+436641234567");
    expect(doc.atemschutzGueltig).toBe(true);
    expect(doc.aktiv).toBe(true);
    expect(doc.funktionen).toEqual(["Maschinist", "Atemschutzwart"]);
  });

  it("akzeptiert ID als String (syBOS sendet so)", () => {
    const doc = mapPerson({ ...raw, ID: "107452" }, new Set());
    expect(doc).not.toBeNull();
    if (!doc) throw new Error("doc null");
    expect(doc._id).toBe("person:107452");
    expect(doc.syBosId).toBe(107452);
  });

  it("liefert null bei fehlender / ungültiger ID", () => {
    expect(mapPerson({ ...raw, ID: undefined as unknown as string }, new Set())).toBeNull();
    expect(mapPerson({ ...raw, ID: "" }, new Set())).toBeNull();
    expect(mapPerson({ ...raw, ID: "abc" }, new Set())).toBeNull();
    expect(mapPerson({ ...raw, ID: 0 }, new Set())).toBeNull();
    expect(mapPerson({ ...raw, ID: -5 }, new Set())).toBeNull();
  });

  it("setzt atemschutzGueltig auf false wenn Name nicht im Set", () => {
    const doc = mapPerson(raw, new Set());
    expect(doc?.atemschutzGueltig).toBe(false);
  });

  it("filtert leere Email", () => {
    const doc = mapPerson({ ...raw, Email1: "" }, new Set());
    expect(doc?.email).toBeUndefined();
  });

  it("filtert Email ohne @", () => {
    const doc = mapPerson({ ...raw, Email1: "noemail" }, new Set());
    expect(doc?.email).toBeUndefined();
  });
});

describe("mapMaterial", () => {
  it("erkennt Atemschutz-Material", () => {
    const raw: SyBosMaterialRaw = {
      ID: 1,
      Klasse1: "Atemschutz",
      Bezeichnung: "PA-Gerät MSA",
    };
    expect(mapMaterial(raw)?.watCode).toBe("atems");
  });

  it("erkennt Fahrzeug", () => {
    const raw: SyBosMaterialRaw = {
      ID: 2,
      Klasse1: "Fahrzeug",
      Bezeichnung: "TLF-A 4000",
    };
    expect(mapMaterial(raw)?.watCode).toBe("fuhrp");
  });

  it("erkennt Ölbindemittel als gerae", () => {
    const raw: SyBosMaterialRaw = {
      ID: 3,
      Bezeichnung: "Ölbindemittel Sack",
    };
    expect(mapMaterial(raw)?.watCode).toBe("gerae");
  });

  it("Fallback ist sachm", () => {
    const raw: SyBosMaterialRaw = {
      ID: 4,
      Bezeichnung: "Irgendwas Komisches",
    };
    expect(mapMaterial(raw)?.watCode).toBe("sachm");
  });

  it("setzt das richtige _id-Format", () => {
    const doc = mapMaterial({ ID: 12345, Bezeichnung: "Test" });
    expect(doc?._id).toBe("material:12345");
    expect(doc?.type).toBe("material");
  });

  it("akzeptiert ID als String", () => {
    const doc = mapMaterial({ ID: "12345", Bezeichnung: "Test" });
    expect(doc?._id).toBe("material:12345");
    expect(doc?.syBosId).toBe(12345);
  });

  it("liefert null bei ungültiger ID", () => {
    expect(mapMaterial({ ID: "abc", Bezeichnung: "Test" })).toBeNull();
  });
});

// Issue 19 (Einsatz-Test 2026-06-02): Autobahn-km-Pattern-Erkennung im
// BlaulichtSMS-Alarmtext. Die Regex muss die gaengigsten Disponenten-
// Schreibweisen erkennen, sonst landet der Geocoder-Fallback auf einer
// zufaelligen Stelle der Autobahn.
describe("parseAutobahnPattern", () => {
  it("erkennt 'A1 FR Salzburg km 201'", () => {
    const r = parseAutobahnPattern("A1 FR Salzburg km 201");
    expect(r).toEqual({ autobahn: "A1", fahrtrichtung: "Salzburg", km: 201 });
  });

  it("erkennt 'A1 Richtung Wien bei Km 195'", () => {
    const r = parseAutobahnPattern("A1 Richtung Wien bei Km 195");
    expect(r).toEqual({ autobahn: "A1", fahrtrichtung: "Wien", km: 195 });
  });

  it("erkennt 'A8 Fahrtr. Suben km 12'", () => {
    const r = parseAutobahnPattern("A8 Fahrtr. Suben km 12");
    expect(r).toEqual({ autobahn: "A8", fahrtrichtung: "Suben", km: 12 });
  });

  it("erkennt 'A 25 km 8 in Richtung Linz' (km vor Fahrtrichtung)", () => {
    const r = parseAutobahnPattern("A 25 km 8 in Richtung Linz");
    expect(r).toEqual({ autobahn: "A25", fahrtrichtung: "Linz", km: 8 });
  });

  it("erkennt Alarmtext mit Zusatztext: 'A1 FR Salzburg bei km 201 — PKW-Brand'", () => {
    const r = parseAutobahnPattern("A1 FR Salzburg bei km 201 — PKW-Brand");
    expect(r).toEqual({ autobahn: "A1", fahrtrichtung: "Salzburg", km: 201 });
  });

  it("liefert null fuer 'Wohnhaus Hauptstraße 12'", () => {
    expect(parseAutobahnPattern("Wohnhaus Hauptstraße 12")).toBeNull();
  });

  it("liefert null fuer leeren String", () => {
    expect(parseAutobahnPattern("")).toBeNull();
  });

  it("liefert null fuer Text ohne Autobahn-Praefix", () => {
    expect(parseAutobahnPattern("PKW-Brand Richtung Wien km 100")).toBeNull();
  });
});

// Issue 19 (Einsatz-Test 2026-06-02): Lookup in der OSM-km-Marker-Tabelle
// inkl. linearer Interpolation zwischen Stuetzpunkten. Direkte Treffer
// muessen mm-genau die Tabellenkoordinaten liefern, interpolierte Werte
// muessen zwischen den Stuetzpunkten liegen.
describe("findAutobahnKm", () => {
  it("findet exakten Treffer 'A1 Salzburg km 201' (FF-Haus)", () => {
    const r = findAutobahnKm("A1", "Salzburg", 201);
    expect(r).not.toBeNull();
    if (!r) throw new Error("r null");
    expect(r.lat).toBeCloseTo(48.0408, 4);
    expect(r.lng).toBeCloseTo(13.9920, 4);
  });

  it("interpoliert zwischen km 195 und km 199 (km 197 muss in der Mitte liegen)", () => {
    const a = findAutobahnKm("A1", "Wien", 195);
    const b = findAutobahnKm("A1", "Wien", 199);
    const mid = findAutobahnKm("A1", "Wien", 197);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(mid).not.toBeNull();
    if (!a || !b || !mid) throw new Error("null");
    // km 197 liegt zwischen 195 und 199, daher zwischen a und b
    expect(mid.lat).toBeGreaterThan(Math.min(a.lat, b.lat));
    expect(mid.lat).toBeLessThan(Math.max(a.lat, b.lat));
    expect(mid.lng).toBeGreaterThan(Math.min(a.lng, b.lng));
    expect(mid.lng).toBeLessThan(Math.max(a.lng, b.lng));
    // bei km 197 = (195 + 199) / 2, also t=0.5, lat/lng exakt mittig
    expect(mid.lat).toBeCloseTo((a.lat + b.lat) / 2, 4);
    expect(mid.lng).toBeCloseTo((a.lng + b.lng) / 2, 4);
  });

  it("interpoliert mit Schreibweise 'FR Salzburg'", () => {
    const r = findAutobahnKm("A1", "FR Salzburg", 201);
    expect(r).not.toBeNull();
    if (!r) throw new Error("r null");
    expect(r.lat).toBeCloseTo(48.0408, 4);
  });

  it("akzeptiert 'A 1' (mit Leerzeichen)", () => {
    const r = findAutobahnKm("A 1", "Salzburg", 201);
    expect(r).not.toBeNull();
  });

  it("liefert null fuer unbekannte Autobahn 'A9'", () => {
    expect(findAutobahnKm("A9", "Wien", 100)).toBeNull();
  });

  it("liefert null fuer unbekannte Fahrtrichtung", () => {
    expect(findAutobahnKm("A1", "Innsbruck", 200)).toBeNull();
  });

  it("liefert null fuer km ausserhalb des abgedeckten Bereichs", () => {
    expect(findAutobahnKm("A1", "Wien", 50)).toBeNull();
    expect(findAutobahnKm("A1", "Wien", 999)).toBeNull();
  });

  it("erkennt A8 km 0 (Abzweig Sattledt)", () => {
    const r = findAutobahnKm("A8", "Suben", 0);
    expect(r).not.toBeNull();
    if (!r) throw new Error("r null");
    // A8 km 0 muss in der Naehe der A1 km 199 liegen (gleicher Knoten)
    expect(r.lat).toBeCloseTo(48.0445, 3);
  });
});
