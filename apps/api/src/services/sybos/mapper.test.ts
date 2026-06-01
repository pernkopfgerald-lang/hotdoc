import { describe, expect, it } from "vitest";
import { buildAtemschutzSet, mapMaterial, mapPerson } from "./mapper.js";
import type { SyBosMaterialRaw, SyBosPersonRaw, SyBosPersUeberpruefungRaw } from "./client.js";

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
