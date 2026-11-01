import { describe, expect, it } from "vitest";
import { ZEIT_GRENZE_STD, istAelterAls, zeitAngabe } from "@hotdoc/shared";

/** Zeitangabe fuer "seit …" / "zuletzt gesehen …": ab 12 h keine Uhrzeit mehr. */

const JETZT = Date.parse("2026-11-01T15:00:00.000Z");
const vor = (std: number): string => new Date(JETZT - std * 3600_000).toISOString();

describe("zeitAngabe", () => {
  it("unter 12 h: Uhrzeit (lokal, HH:MM)", () => {
    const t = zeitAngabe(vor(1), JETZT);
    expect(t).toMatch(/^\d{2}:\d{2}$/);
  });

  it("genau 12 h: noch Uhrzeit, darueber: '>12 Stunden'", () => {
    expect(zeitAngabe(vor(12), JETZT)).toMatch(/^\d{2}:\d{2}$/);
    expect(zeitAngabe(vor(12.01), JETZT)).toBe(">12 Stunden");
    expect(zeitAngabe(vor(48), JETZT)).toBe(">12 Stunden");
  });

  it("leer oder ungueltig: leerer Text, kein Fehler", () => {
    expect(zeitAngabe(null, JETZT)).toBe("");
    expect(zeitAngabe(undefined, JETZT)).toBe("");
    expect(zeitAngabe("", JETZT)).toBe("");
    expect(zeitAngabe("kein-datum", JETZT)).toBe("");
  });

  it("istAelterAls und Grenzwert", () => {
    expect(ZEIT_GRENZE_STD).toBe(12);
    expect(istAelterAls(vor(13), JETZT)).toBe(true);
    expect(istAelterAls(vor(11), JETZT)).toBe(false);
    expect(istAelterAls("kaputt", JETZT)).toBe(false);
  });
});
