import type { AlarmDaten } from "../components/AlarmCard";
import type { GearItem } from "../components/GearChips";
import type { ChronikEintrag } from "../components/ChronikTimeline";
import type { Hydrant, MapPosition } from "../components/MapCard";

export const DEMO_ALARM: AlarmDaten = {
  alarmId: "B26-014",
  einsatzart: "Brand KFZ",
  einsatzort: "Eberstalzeller Straße 5, 4653 Eberstalzell",
  alarmierungZeit: new Date(new Date().setHours(17, 43, 12, 0)).toISOString(),
  alarmierungAuthor: "BWST",
  koordinaten: { lat: 48.11, lng: 13.961 },
  distanzKm: 1.2,
  audioSecs: 24,
  stichwort: "B-2",
};

export const HOME_POS = { lat: 48.0884, lng: 13.9586 };
export const EINSATZ_POS = { lat: 48.11, lng: 13.961 };

export const DEMO_HYDRANTEN: Hydrant[] = [
  { id: "h1", typ: "H", lat: 48.1095, lng: 13.96 },
  { id: "h2", typ: "H", lat: 48.1105, lng: 13.962 },
  { id: "h3", typ: "S", lat: 48.1115, lng: 13.9605 },
  { id: "h4", typ: "H", lat: 48.109, lng: 13.9625 },
  { id: "h5", typ: "H", lat: 48.1108, lng: 13.9595 },
  { id: "h6", typ: "H", lat: 48.089, lng: 13.959 },
];

export function makeInitialFleet(): MapPosition[] {
  const now = new Date().toISOString();
  // Demo: TANK ist seit > 10 min "offline" um den Stale-Status zu zeigen.
  // Sobald echte Positions-Streams da sind, kommt das aus dem Backend.
  const tankStale = new Date(Date.now() - 14 * 60 * 1000).toISOString();
  return [
    {
      fahrzeugId: "lfa-b",
      funkrufname: "Pumpe Eberstalzell",
      abk: "PUMPE",
      lat: HOME_POS.lat,
      lng: HOME_POS.lng,
      isSelf: true,
      lastSeenAt: now,
    },
    {
      fahrzeugId: "kdo",
      funkrufname: "Kommando Eberstalzell",
      abk: "KDO",
      lat: 48.0892,
      lng: 13.9595,
      lastSeenAt: now,
    },
    {
      fahrzeugId: "tlf-a-4000",
      funkrufname: "Tank Eberstalzell",
      abk: "TANK",
      lat: 48.0892,
      lng: 13.958,
      lastSeenAt: tankStale,
    },
    {
      // Florian Eberstalzell — fix am Feuerwehrhaus (Solarstraße 1).
      // Nie stale, bewegt sich nicht.
      fahrzeugId: "zentrale",
      funkrufname: "Florian Eberstalzell",
      abk: "FLORIAN",
      lat: HOME_POS.lat,
      lng: HOME_POS.lng,
      isZentrale: true,
    },
  ];
}

export const DEMO_GEAR_LFA_B: GearItem[] = [
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
];

export function initialChronik(funkrufname: string): ChronikEintrag[] {
  const now = Date.now();
  return [
    {
      id: "c1",
      zeitstempel: new Date(now - 1000 * 60 * 12).toISOString(),
      funkrufname: "BlaulichtSMS",
      source: "blaulichtsms",
      text: "Alarmierung · Brand KFZ · Eberstalzeller Straße 5",
    },
    {
      id: "c2",
      zeitstempel: new Date(now - 1000 * 60 * 9).toISOString(),
      funkrufname,
      source: "fahrzeug",
      text: "Ausrückung mit voller Besatzung.",
    },
    {
      id: "c3",
      zeitstempel: new Date(now - 1000 * 60 * 4).toISOString(),
      funkrufname,
      source: "fahrzeug",
      text: "Eintreffen am Einsatzort, Lage wird erkundet.",
    },
  ];
}
