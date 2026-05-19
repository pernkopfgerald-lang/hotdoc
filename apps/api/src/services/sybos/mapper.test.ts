import { describe, expect, it } from "vitest";
import { buildAtemschutzSet, mapMaterial, mapPerson } from "./mapper.js";
import type { SyBosMaterialRaw, SyBosPersonRaw, SyBosPersUeberpruefungRaw } from "./client.js";

describe("buildAtemschutzSet", () => {
  it("nimmt nur Personen mit gültiger Atemschutz-Prüfung", () => {
    const rows: SyBosPersUeberpruefungRaw[] = [
      { Name: "Huemer Manfred", Pruefungsbezeichnung: "Atemschutz-Tauglichkeit", Status: "o" },
      { Name: "Almhofer Martin", Pruefungsbezeichnung: "Führerschein C", Status: "o" }, // kein AS
      { Name: "Eder Christoph", Pruefungsbezeichnung: "Atemschutz", Status: "e" }, // abgelaufen
      { Name: "Bruckner Christoph", Pruefungsbezeichnung: "atemschutz", Status: "o" }, // case-insensitive
    ];
    const set = buildAtemschutzSet(rows);
    expect(set.has("Huemer Manfred")).toBe(true);
    expect(set.has("Bruckner Christoph")).toBe(true);
    expect(set.has("Almhofer Martin")).toBe(false);
    expect(set.has("Eder Christoph")).toBe(false);
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
    id: 107452,
    Nachname: "Huemer",
    Vorname: "Manfred",
    Dienstgrad: "OBM",
    Mobil1: "+436641234567",
    Email1: "manfred@example.at",
    Funktionen: "Maschinist, Atemschutzwart",
  };

  it("baut korrekt das CouchDB-Dokument", () => {
    const asSet = new Set<string>(["Huemer Manfred"]);
    const doc = mapPerson(raw, asSet);
    expect(doc._id).toBe("person:107452");
    expect(doc.type).toBe("person");
    expect(doc.syBosId).toBe(107452);
    expect(doc.nachname).toBe("Huemer");
    expect(doc.vorname).toBe("Manfred");
    expect(doc.dienstgrad).toBe("OBM");
    expect(doc.email).toBe("manfred@example.at");
    expect(doc.mobil1).toBe("+436641234567");
    expect(doc.atemschutzGueltig).toBe(true);
    expect(doc.aktiv).toBe(true);
    expect(doc.funktionen).toEqual(["Maschinist", "Atemschutzwart"]);
  });

  it("setzt atemschutzGueltig auf false wenn Name nicht im Set", () => {
    const doc = mapPerson(raw, new Set());
    expect(doc.atemschutzGueltig).toBe(false);
  });

  it("filtert leere Email", () => {
    const doc = mapPerson({ ...raw, Email1: "" }, new Set());
    expect(doc.email).toBeUndefined();
  });

  it("filtert Email ohne @", () => {
    const doc = mapPerson({ ...raw, Email1: "noemail" }, new Set());
    expect(doc.email).toBeUndefined();
  });
});

describe("mapMaterial", () => {
  it("erkennt Atemschutz-Material", () => {
    const raw: SyBosMaterialRaw = {
      ID: 1,
      Klasse1: "Atemschutz",
      Bezeichnung: "PA-Gerät MSA",
    };
    expect(mapMaterial(raw).watCode).toBe("atems");
  });

  it("erkennt Fahrzeug", () => {
    const raw: SyBosMaterialRaw = {
      ID: 2,
      Klasse1: "Fahrzeug",
      Bezeichnung: "TLF-A 4000",
    };
    expect(mapMaterial(raw).watCode).toBe("fuhrp");
  });

  it("erkennt Ölbindemittel als gerae", () => {
    const raw: SyBosMaterialRaw = {
      ID: 3,
      Bezeichnung: "Ölbindemittel Sack",
    };
    expect(mapMaterial(raw).watCode).toBe("gerae");
  });

  it("Fallback ist sachm", () => {
    const raw: SyBosMaterialRaw = {
      ID: 4,
      Bezeichnung: "Irgendwas Komisches",
    };
    expect(mapMaterial(raw).watCode).toBe("sachm");
  });

  it("setzt das richtige _id-Format", () => {
    const doc = mapMaterial({ ID: 12345, Bezeichnung: "Test" });
    expect(doc._id).toBe("material:12345");
    expect(doc.type).toBe("material");
  });
});
