import { describe, expect, it } from "vitest";
import { himmelsrichtung, parseStationsWerte, wetterGueltig } from "./wetter.js";
import { wetterZeile } from "./pdf/template.js";

const JETZT = Date.parse("2026-10-03T14:00:00Z");
const ROH = { epoch: JETZT / 1000 - 120, bar: 1037.3, temp: 19.3, hum: 65, wdir: 356, wspd: 2.6, wspdhi: 3.1, rainrate: 0 };

describe("parseStationsWerte", () => {
  it("uebernimmt die Werte der Station", () => {
    const w = parseStationsWerte(ROH, JETZT)!;
    expect(w).toMatchObject({ tempC: 19.3, luftfeuchtePct: 65, luftdruckHpa: 1037.3, windMs: 2.6, windBoeMs: 3.1, windRichtungGrad: 356, regenMmH: 0 });
    expect(w.messzeit).toBe(new Date(JETZT - 120_000).toISOString());
  });
  it("verwirft veraltete oder unbrauchbare Messungen", () => {
    expect(parseStationsWerte({ ...ROH, epoch: JETZT / 1000 - 3 * 3600 }, JETZT)).toBeNull();
    expect(parseStationsWerte({ epoch: JETZT / 1000 }, JETZT)).toBeNull();
    expect(parseStationsWerte(null, JETZT)).toBeNull();
    expect(parseStationsWerte({ ...ROH, epoch: "x" }, JETZT)).toBeNull();
  });
});

describe("wetterGueltig", () => {
  const alarm = new Date(JETZT).toISOString();
  const wetter = { ...parseStationsWerte(ROH, JETZT)!, alarmierungZeit: alarm };
  it("gueltig bei unveraenderter Alarmzeit", () => {
    expect(wetterGueltig({ alarmierungZeit: alarm, wetter })).toBeTruthy();
  });
  it("ungueltig, wenn die Alarmzeit geaendert wurde", () => {
    expect(wetterGueltig({ alarmierungZeit: new Date(JETZT - 3600_000).toISOString(), wetter })).toBeUndefined();
  });
  it("ungueltig ohne Wetter oder ohne Alarmzeit", () => {
    expect(wetterGueltig({ alarmierungZeit: alarm })).toBeUndefined();
    expect(wetterGueltig({ wetter })).toBeUndefined();
  });
});

describe("Anzeige", () => {
  it("Himmelsrichtung", () => {
    expect(himmelsrichtung(356)).toBe("N");
    expect(himmelsrichtung(90)).toBe("O");
    expect(himmelsrichtung(225)).toBe("SW");
  });
  it("Wetterzeile im deutschen Format", () => {
    const z = wetterZeile({ ...parseStationsWerte(ROH, JETZT)!, alarmierungZeit: "x" } as never);
    expect(z).toBe("19,3 °C · Luftfeuchte 65 % · Wind N 2,6 m/s (Böen 3,1 m/s) · Luftdruck 1037 hPa · Niederschlag 0,0 mm/h");
  });
});
