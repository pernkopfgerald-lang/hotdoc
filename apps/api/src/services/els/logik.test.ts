import { describe, expect, it } from "vitest";
import {
  baueFahrzeugStatus,
  elsAlarmId,
  elsEinsatzort,
  elsEventRelevant,
  elsStichwort,
  elsZeitNachIso,
  extractList,
  findeKandidat,
  graceAbgelaufen,
  istSchonVerknuepft,
  jwtExpMs,
  ordneUnitZu,
  parseEvent,
  parseUnit,
} from "./logik.js";

const unitRoh = {
  unid: "9310100",
  unid_long: "Feuerwehr/Florian Demofeuerwehr 1 (93101)",
  callname: "TANK",
  sybosId: "1234",
  s_name: "Demofeuerwehr 1",
  unityp: "TANK",
  unit_status: "FW",
  status_florianstation: "4",
  lastStatusTimestamp: "2023-12-31 22:40:01",
  eid: 122,
  num_1: "E202300001",
  latitude: 48.31039,
  longitude: 14.30999,
};

const eventRoh = {
  num_1: "E202300001",
  eid: 122,
  exercise: "N",
  not_publish: "N",
  tycod: "B0-FREI-ABF",
  sub_tycod: "CONTAINER-BR",
  typ_eng: "Brand Abfall im Freien",
  sub_eng: "Brand Container im Freien",
  event_alarmtext: "unklare Lage",
  location: "PETZOLDSTRASSE 43 LINZ",
  create_time: "2023-12-31 22:40:01",
  firstdispatch_time: "2023-12-31 22:43:15",
  latitude: 48.31039,
  longitude: 14.30999,
  caller_name: "Max Mustermann",
};

describe("extractList", () => {
  it("nimmt Listen direkt, in Wurzelobjekten und Einzelobjekte", () => {
    expect(extractList({ unit: [{ a: 1 }, { a: 2 }] }, "unit")).toHaveLength(2);
    expect(extractList({ units: { unit: [{ a: 1 }] } }, "unit")).toHaveLength(1);
    expect(extractList({ unit: { a: 1 } }, "unit")).toEqual([{ a: 1 }]);
    expect(extractList([{ a: 1 }], "unit")).toHaveLength(1);
  });
  it("liefert [] bei leer/unbekannt", () => {
    expect(extractList({}, "unit")).toEqual([]);
    expect(extractList(null, "unit")).toEqual([]);
    expect(extractList({ unit: "" }, "unit")).toEqual([]);
    expect(extractList({ unit: null }, "unit")).toEqual([]);
  });
});

describe("jwtExpMs", () => {
  it("liest exp (Sekunden) in ms", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_700_000_000 })).toString("base64url");
    expect(jwtExpMs(`x.${payload}.y`)).toBe(1_700_000_000_000);
  });
  it("null bei Muell", () => {
    expect(jwtExpMs("abc")).toBeNull();
    expect(jwtExpMs("a.b.c")).toBeNull();
    expect(jwtExpMs(`a.${Buffer.from("{}").toString("base64url")}.c`)).toBeNull();
  });
});

describe("elsZeitNachIso", () => {
  it("Wiener Ortszeit -> UTC (Winter +1, Sommer +2)", () => {
    expect(elsZeitNachIso("2023-12-31 22:40:01")).toBe("2023-12-31T21:40:01.000Z");
    expect(elsZeitNachIso("2024-07-01 12:00:00")).toBe("2024-07-01T10:00:00.000Z");
  });
  it("belaesst Zeitangaben mit Zone", () => {
    expect(elsZeitNachIso("2024-07-01T10:00:00Z")).toBe("2024-07-01T10:00:00.000Z");
    expect(elsZeitNachIso("2024-07-01T12:00:00+02:00")).toBe("2024-07-01T10:00:00.000Z");
  });
  it("undefined bei leer/Muell", () => {
    expect(elsZeitNachIso("")).toBeUndefined();
    expect(elsZeitNachIso("gestern")).toBeUndefined();
    expect(elsZeitNachIso(undefined)).toBeUndefined();
  });
});

describe("Einheiten", () => {
  it("parst die Felder", () => {
    const u = parseUnit(unitRoh);
    expect(u).toMatchObject({ unid: "9310100", callname: "TANK", statusFlorian: "4", num1: "E202300001", eid: 122 });
    expect(u?.lat).toBeCloseTo(48.31039);
    expect(u?.lastStatusTimestamp).toBe("2023-12-31T21:40:01.000Z");
  });
  it("0/0-Position und fehlende Position gelten als keine Position", () => {
    expect(parseUnit({ ...unitRoh, latitude: 0, longitude: 0 })).toMatchObject({ lat: null, lng: null });
    expect(parseUnit({ unid: "1", callname: "X" })).toMatchObject({ lat: null, lng: null });
  });
  it("verwirft Eintraege ohne Kennung", () => {
    expect(parseUnit({ latitude: 1 })).toBeNull();
  });

  it("ordnet ueber Kuerzel/Funkrufname zu (Umlaute, Gross-/Kleinschreibung egal)", () => {
    const tank = parseUnit(unitRoh)!;
    expect(ordneUnitZu(tank)).toBe("tlf-a-4000");
    expect(ordneUnitZu({ ...tank, callname: "Tank Eberstalzell" })).toBe("tlf-a-4000");
    expect(ordneUnitZu({ ...tank, callname: "pumpe" })).toBe("lfa-b");
    expect(ordneUnitZu({ ...tank, callname: "Kommando Eberstalzell" })).toBe("kdo");
    expect(ordneUnitZu({ ...tank, callname: "MTF" })).toBe("mtf");
  });
  it("kein Treffer -> null, manuelle Zuordnung hat Vorrang", () => {
    const fremd = { ...parseUnit(unitRoh)!, callname: "RLFA 2000", unid: "777" };
    expect(ordneUnitZu(fremd)).toBeNull();
    expect(ordneUnitZu(fremd, { mtf: "777" })).toBe("mtf");
    expect(ordneUnitZu(fremd, { lfa: "x" } as never)).toBeNull();
    // Override per Rufname, auch wenn der Standardabgleich "TANK" -> TLF waere
    const tank = parseUnit(unitRoh)!;
    expect(ordneUnitZu(tank, { kdo: "TANK" })).toBe("kdo");
  });
  it("ordnet ueber die syBOS-ID zu", () => {
    const u = { ...parseUnit(unitRoh)!, callname: "Irgendwas", sName: "", sybosId: "42" };
    expect(ordneUnitZu(u, {}, { lfa_b: "42" } as never)).toBeNull();
    expect(ordneUnitZu(u, {}, { "lfa-b": "42" })).toBe("lfa-b");
  });
  it("baut den Status je Fahrzeug, nur Zugeordnete, juengster gewinnt", () => {
    const a = parseUnit(unitRoh)!;
    const b = parseUnit({ ...unitRoh, status_florianstation: "3", lastStatusTimestamp: "2023-12-31 22:55:00" })!;
    const fremd = parseUnit({ ...unitRoh, unid: "5", callname: "FREMD" })!;
    const s = baueFahrzeugStatus([a, b, fremd]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ fahrzeugId: "tlf-a-4000", status: "3" });
  });
});

describe("Einsaetze", () => {
  const e = parseEvent(eventRoh)!;

  it("parst Stichwort, Ort, Zeiten", () => {
    expect(e.num1).toBe("E202300001");
    expect(elsStichwort(e)).toBe(
      "B0-FREI-ABF / CONTAINER-BR · Brand Abfall im Freien (Brand Container im Freien)",
    );
    expect(elsEinsatzort(e)).toBe("PETZOLDSTRASSE 43 LINZ");
    expect(elsEinsatzort({ ...e, location: "", plz: "4020", area: "Linz" })).toBe("4020 Linz");
    expect(e.firstDispatchTime).toBe("2023-12-31T21:43:15.000Z");
    expect(elsAlarmId(e.num1)).toBe("els-E202300001");
  });
  it("speichert keine Anruferdaten im geparsten Event", () => {
    expect(JSON.stringify(e)).not.toContain("Mustermann");
  });
  it("Relevanz: nur alarmierte, nicht beendete, keine Uebung, nicht gesperrt", () => {
    expect(elsEventRelevant(e)).toBe(true);
    expect(elsEventRelevant({ ...e, exercise: true })).toBe(false);
    expect(elsEventRelevant({ ...e, notPublish: true })).toBe(false);
    expect(elsEventRelevant({ ...e, freeTime: "2023-12-31T23:00:00.000Z" })).toBe(false);
    const ohneAlarm = parseEvent({ ...eventRoh, firstdispatch_time: "" })!;
    expect(elsEventRelevant(ohneAlarm)).toBe(false);
  });
  it("Uebung wird an exercise=Y erkannt", () => {
    expect(parseEvent({ ...eventRoh, exercise: "Y" })?.exercise).toBe(true);
    expect(parseEvent({ ...eventRoh, num_1: "" })).toBeNull();
  });
  it("Wartezeit", () => {
    const t0 = Date.parse(e.firstDispatchTime!);
    expect(graceAbgelaufen(e, 120, t0 + 119_000)).toBe(false);
    expect(graceAbgelaufen(e, 120, t0 + 120_000)).toBe(true);
    expect(graceAbgelaufen({ ...e, firstDispatchTime: undefined }, 0)).toBe(false);
  });

  const basis = {
    _id: "einsatz:abc",
    status: "aktiv",
    alarmId: "abc",
    alarmierungZeit: "2023-12-31T21:44:00.000Z",
    einsatzort: "Etwas anderes",
    koordinaten: { lat: 48.3104, lng: 14.3101 },
  };
  it("erkennt bereits verknuepfte Einsaetze", () => {
    expect(istSchonVerknuepft(e, [basis])).toBeUndefined();
    expect(istSchonVerknuepft(e, [{ ...basis, alarmIds: ["abc", "els-E202300001"] }])?._id).toBe("einsatz:abc");
    expect(istSchonVerknuepft(e, [{ ...basis, alarmId: "els-E202300001" }])?._id).toBe("einsatz:abc");
  });
  it("Kandidat ueber Koordinaten (<300 m) im Zeitfenster", () => {
    expect(findeKandidat(e, [basis])?._id).toBe("einsatz:abc");
  });
  it("Kandidat ueber gleichen Einsatzort-Text", () => {
    const k = { ...basis, koordinaten: undefined, einsatzort: "petzoldstrasse  43 linz" };
    expect(findeKandidat(e, [k])?._id).toBe("einsatz:abc");
  });
  it("kein Kandidat: zu weit weg, zu alt, nicht aktiv", () => {
    expect(findeKandidat(e, [{ ...basis, koordinaten: { lat: 48.4, lng: 14.5 } }])).toBeUndefined();
    expect(findeKandidat(e, [{ ...basis, alarmierungZeit: "2023-12-31T20:00:00.000Z" }])).toBeUndefined();
    expect(findeKandidat(e, [{ ...basis, status: "abgeschlossen" }])).toBeUndefined();
  });
  it("mehrere Treffer: der zeitlich naechste", () => {
    const naeher = { ...basis, _id: "einsatz:naeher", alarmierungZeit: "2023-12-31T21:43:20.000Z" };
    expect(findeKandidat(e, [basis, naeher])?._id).toBe("einsatz:naeher");
  });
});
