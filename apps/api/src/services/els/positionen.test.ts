import { describe, expect, it } from "vitest";
import type { FahrzeugFunkstatus } from "./logik.js";
import { ELS_POSITION_MAX_ALTER_MS, mitElsVorrang } from "./positionen.js";

const JETZT = Date.parse("2026-10-27T12:00:00.000Z");

function tablet(fahrzeugId: string, lat: number, lng: number, alterMs = 1000) {
  return { fahrzeugId, lat, lng, ts: new Date(JETZT - alterMs).toISOString() };
}

function els(fahrzeugId: FahrzeugFunkstatus["fahrzeugId"], lat: number | null, lng: number | null): FahrzeugFunkstatus {
  return { fahrzeugId, callname: "X", status: "3", unitStatus: "FW", lat, lng, num1: "" };
}

describe("Positionen: ELS hat Vorrang vor Tablet-GPS", () => {
  it("ohne ELS bleibt alles beim Tablet", () => {
    const r = mitElsVorrang([tablet("kdo", 1, 1)], null, JETZT);
    expect(r).toEqual([{ ...tablet("kdo", 1, 1), source: "tablet" }]);
  });

  it("ELS-Position ersetzt den (frischen) Tablet-Ping", () => {
    const fetchedAt = new Date(JETZT - 20_000).toISOString();
    const r = mitElsVorrang([tablet("tlf-a-4000", 1, 1)], { fetchedAt, status: [els("tlf-a-4000", 48.1, 14.2)] }, JETZT);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ fahrzeugId: "tlf-a-4000", lat: 48.1, lng: 14.2, source: "els", ts: fetchedAt });
  });

  it("Fahrzeug ohne Tablet-Ping erscheint mit ELS-Position", () => {
    const fetchedAt = new Date(JETZT - 5_000).toISOString();
    const r = mitElsVorrang([], { fetchedAt, status: [els("mtf", 48, 14)] }, JETZT);
    expect(r).toEqual([{ fahrzeugId: "mtf", lat: 48, lng: 14, ts: fetchedAt, source: "els" }]);
  });

  it("Tablet ist Rückfall: ELS ohne Position für dieses Fahrzeug", () => {
    const fetchedAt = new Date(JETZT - 5_000).toISOString();
    const r = mitElsVorrang(
      [tablet("kdo", 1, 1), tablet("lfa-b", 2, 2)],
      { fetchedAt, status: [els("lfa-b", null, null)] },
      JETZT,
    );
    expect(r.map((p) => [p.fahrzeugId, p.source])).toEqual([
      ["kdo", "tablet"],
      ["lfa-b", "tablet"],
    ]);
  });

  it("Tablet ist Rückfall: ELS-Daten zu alt", () => {
    const fetchedAt = new Date(JETZT - ELS_POSITION_MAX_ALTER_MS - 1000).toISOString();
    const r = mitElsVorrang([tablet("kdo", 1, 1)], { fetchedAt, status: [els("kdo", 48, 14)] }, JETZT);
    expect(r[0]).toMatchObject({ source: "tablet", lat: 1 });
  });

  it("nur das betroffene Fahrzeug wird ersetzt, die anderen bleiben Tablet", () => {
    const fetchedAt = new Date(JETZT - 5_000).toISOString();
    const r = mitElsVorrang(
      [tablet("kdo", 1, 1), tablet("mtf", 3, 3)],
      { fetchedAt, status: [els("kdo", 48, 14)] },
      JETZT,
    );
    expect(r.find((p) => p.fahrzeugId === "kdo")).toMatchObject({ source: "els", lat: 48 });
    expect(r.find((p) => p.fahrzeugId === "mtf")).toMatchObject({ source: "tablet", lat: 3 });
  });
});
