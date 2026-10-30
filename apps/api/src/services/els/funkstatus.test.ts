import { describe, expect, it } from "vitest";
import {
  funkstatusAusUnitStatus,
  funkstatusChronikText,
  funkstatusKurz,
  funkstatusTon,
} from "@hotdoc/shared";
import { baueFahrzeugStatus, parseUnit } from "./logik.js";

/** Funkstatus aus `unit_status` (Test an der Wache, 30.10.2026) + korrigierte Texte. */

function einheit(over: Record<string, unknown>) {
  const u = parseUnit({
    unid: "511050101",
    callname: "Kommando",
    unityp: "KDOF",
    unit_status: "FW",
    status_florianstation: "",
    lastStatusTimestamp: "2026-10-30 13:40:11",
    num_1: "",
    ...over,
  });
  if (!u) throw new Error("Einheit nicht parsbar");
  return u;
}

describe("Funkstatus aus unit_status", () => {
  it("AD = Status 0 (Außer Dienst), FF = Status 1 (Frei über Funk), FW = Status 2 (Frei auf Wache)", () => {
    expect(funkstatusAusUnitStatus("AD")).toBe("0");
    expect(funkstatusKurz(funkstatusAusUnitStatus("AD"))).toBe("Außer Dienst");
    expect(funkstatusAusUnitStatus("FF")).toBe("1");
    expect(funkstatusAusUnitStatus("FW")).toBe("2");
    expect(funkstatusAusUnitStatus(" ff ")).toBe("1");
  });

  it("unbekannte Codes werden sichtbar durchgereicht, leer bleibt leer", () => {
    expect(funkstatusAusUnitStatus("ab")).toBe("AB");
    expect(funkstatusAusUnitStatus("")).toBe("");
    expect(funkstatusAusUnitStatus(undefined)).toBe("");
  });

  it("Fahrzeug mit leerem status_florianstation bekommt den Status aus unit_status", () => {
    const s = baueFahrzeugStatus([einheit({ unit_status: "FF" })]);
    expect(s[0]).toMatchObject({ fahrzeugId: "kdo", status: "1" });
    expect(funkstatusKurz(s[0]?.status)).toBe("Frei über Funk");

    const s2 = baueFahrzeugStatus([einheit({ unit_status: "FW" })]);
    expect(s2[0]).toMatchObject({ status: "2" });
    expect(funkstatusKurz(s2[0]?.status)).toBe("Frei auf Wache");
  });

  it("eine gelieferte Ziffer in status_florianstation hat weiter Vorrang", () => {
    const s = baueFahrzeugStatus([einheit({ unit_status: "FW", status_florianstation: "4" })]);
    expect(s[0]).toMatchObject({ status: "4" });
  });

  it("unbekannter Buchstabencode erscheint als Rohwert, nicht als 'Frei'", () => {
    const s = baueFahrzeugStatus([einheit({ unit_status: "ab" })]);
    expect(s[0]?.status).toBe("AB");
    expect(funkstatusKurz("AB")).toBe("");
    expect(funkstatusTon("AB")).toBe("neutral");
  });
});

describe("Funkstatus-Texte", () => {
  it("0 = Außer Dienst (kein Notruf), 6 = Alarmierungsauftrag", () => {
    expect(funkstatusKurz("0")).toBe("Außer Dienst");
    expect(funkstatusKurz("6")).toBe("Alarmierungsauftrag");
    expect(funkstatusKurz("5")).toBe("Sprechwunsch");
    expect(funkstatusChronikText("0")).toBe("Funkstatus 0: Außer Dienst");
    expect(funkstatusTon("0")).toBe("warn");
    expect(funkstatusTon("6")).toBe("info");
  });
});
