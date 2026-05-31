import { ArrowRight, Calendar, CheckCircle2, Clipboard, Eye, Save, Smartphone, Truck, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { APP_BUILD, APP_VERSION } from "../version";
import { AboutModal } from "../components/AboutModal";
import { IdleView } from "../components/IdleView";
import { HandoffBanner } from "../components/HandoffBanner";
import { HandoffModal } from "../components/HandoffModal";
import { AbschlussModal, type AbschlussCheck } from "../components/AbschlussModal";
import { AlarmCard, type AlarmDaten } from "../components/AlarmCard";
import { AuftraegeSection, type Auftrag } from "../components/AuftraegeSection";
import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { StatusBanner } from "../components/StatusBanner";
import { DictateButton, type DictateResult } from "../components/DictateButton";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { FxToggle } from "../components/FxToggle";
import { GearChips } from "../components/GearChips";
import {
  MannschaftSlot,
  emptySlot,
  type MannschaftSlotData,
} from "../components/MannschaftSlot";
import { MapCard, type MapPosition, type RouteData } from "../components/MapCard";
import { NeuerEinsatzTabletModal, type EinsatzTyp } from "../components/NeuerEinsatzTabletModal";
import { ArchivTabletModal } from "../components/ArchivTabletModal";
import { PersonButton } from "../components/PersonButton";
import { PersonPickerModal, type PickPerson } from "../components/PersonPickerModal";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { VorschauModal } from "../components/VorschauModal";
import { GEAR_BY_FAHRZEUG } from "../data/gear";
import { apiCall } from "../lib/api";
import { broadcastChronikEntry, fetchChronikDiff } from "../lib/chronik-sync";
import { haversineKm, useGeolocation } from "../lib/geo";
import { loadReportStates, saveReportState } from "../lib/report-state";
import { describeFailure, transcribeAudio } from "../lib/transcribe";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

type PickerTarget = { kind: "fahrer" } | { kind: "kdt" } | { kind: "crew"; slot: number };

const ROAD_FACTOR = 1.3;

/** Feuerwehrhaus FF Eberstalzell, Solarstrasse 1 — Bezugspunkt fuer KM-
 *  Berechnung und Map-Fallback wenn das Tablet noch keine GPS-Position hat. */
const HOME_POS = { lat: 48.0884, lng: 13.9586 };

const DEFAULT_AUFTRAG_TYPEN: readonly string[] = [
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
] as const;

interface EinsatzInstance {
  id: string;
  alarm: AlarmDaten;
  einsatzPos: { lat: number; lng: number };
  manuell: boolean;
  fahrer: PickPerson | null;
  kdt: PickPerson | null;
  mannschaft: MannschaftSlotData[];
  gearSelected: Set<string>;
  oelSaecke: number;
  auftraege: Auftrag[];
  chronik: ChronikEintrag[];
  abgeschlossen: { ts: string; durch: string; kmGefahren: number } | null;
  /** User-eingegebene "Uhrzeit bis" als "HH:MM". Leer = noch nicht gesetzt.
   *  Beim Abschluss wird die aktuelle Zeit NUR verwendet wenn dieser Wert
   *  leer ist — wenn der Kdt schon manuell eingetragen hat, ueberschreibt
   *  der Abschluss seine Eingabe nicht. */
  uhrzeitBisHHMM: string;
  /** Manueller KM-Override durch den Fahrzeugkdt. null = Auto-Wert aus
   *  GraphHopper-Route × 2 (oder Luftlinie × 1.3 × 2 als Fallback). */
  kmManualOverride: number | null;
}

interface Props {
  fahrzeugId: FahrzeugId;
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
  /** Single-Device-Logout nach erfolgreichem QR-Handoff. */
  onHandoffLogout: () => void;
}

/**
 * Generischer Fahrzeugbericht — funktioniert für KDO / TLF / LFA-B / MTF.
 * Mannschaftsplätze und Geräteliste kommen aus der Fahrzeugkonfiguration.
 * Für Zentrale gibt es eine eigene Page (Hauptbericht, Anhang B des Spec).
 */
export function BerichtPage({ fahrzeugId, onSwitchFahrzeug, onResetSetup, onHandoffLogout }: Props) {
  const fahrzeug = FAHRZEUGE[fahrzeugId];
  const gearList = GEAR_BY_FAHRZEUG[fahrzeugId];

  const [personen, setPersonen] = useState<PickPerson[]>([]);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget | null>(null);
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);
  const [abschlussModalOpen, setAbschlussModalOpen] = useState(false);
  const [vorschauOpen, setVorschauOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  /** Modal-State für Neuer-Einsatz-Anlage vom Tablet, mit Typ-Vorwahl. */
  const [neuerEinsatzOpen, setNeuerEinsatzOpen] = useState<EinsatzTyp | null>(null);
  /** Read-only Archiv-Modal. */
  const [archivOpen, setArchivOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /**
   * Pop-Up bei neuem Einsatz waehrend bereits ein Einsatz mit User-Eingaben
   * laeuft. Der Fahrzeugkdt soll bewusst entscheiden, nicht aus Versehen
   * mitten in der Eingabe in einen neuen Einsatz wechseln. Rotes Modal mit
   * Backdrop-Blur — klickbar ist nur "Oeffnen" oder "Spaeter" (waehrend
   * "Spaeter" bleibt der Eintrag in der Tab-Leiste sichtbar).
   */
  const [newEinsatzPopup, setNewEinsatzPopup] = useState<{
    id: string;
    einsatzart: string;
    einsatzort: string;
  } | null>(null);

  // einsaetze[] startet leer — kein Phantom-Einsatz, keine Vorbelegung.
  // Backend-Poll fuegt einen Eintrag hinzu sobald ein echter Einsatz im
  // CouchDB ist (BlaulichtSMS-Alarm ODER manuelle Anlage via Modal).
  const [einsaetze, setEinsaetze] = useState<EinsatzInstance[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  // Live-Fleet aus /api/positions — wird unten alle 3 s gepollt. Eigener Eintrag
  // wird per Ping hochgeladen, Florianstation und alle Tablets teilen die Sicht.
  const [fleet, setFleet] = useState<MapPosition[]>([]);

  const active = einsaetze.find((e) => e.id === activeId) ?? null;

  // Folge-Auftrag-Vererbung: wenn der Funktionaer auf "Neuer Einsatz" klickt
  // waehrend ein nicht-abgeschlossener Einsatz aktiv ist, parken wir das
  // Personal in diesem Ref. Sobald der neue Einsatz im naechsten Poll
  // auftaucht, wird sein leerer Mannschafts-Block aus diesem Ref vorbefuellt.
  // Hintergrund: Lotsendienst nach Brandeinsatz, Folge-Ubung etc. — dieselbe
  // Besatzung, derselbe Wagen, der Kdt soll nicht alles neu tippen.
  interface InheritedPersonal {
    fahrer: PickPerson | null;
    kdt: PickPerson | null;
    mannschaft: MannschaftSlotData[];
  }
  const inheritPersonalRef = useRef<InheritedPersonal | null>(null);

  // Refs fuer den Live-Zugriff in setInterval-Closures. Das useEffect mit
  // [fahrzeugId] bindet runPoll genau einmal — `einsaetze` und `activeId`
  // wuerden im Closure einfrieren und immer den Initial-Snapshot sehen
  // (Bug: Pop-Up triggert nie, weil cur immer null ist). Refs umgehen das.
  const einsaetzeRef = useRef(einsaetze);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    einsaetzeRef.current = einsaetze;
  }, [einsaetze]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const geo = useGeolocation();
  const selfPos = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : HOME_POS;

  // Personalliste aus /api/admin/personen — Quelle: syBOS-Sync. Keine
  // lokale Vorbelegung; der Kdt traegt die tatsaechliche Besatzung manuell ein.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiCall<{
          items: Array<{
            syBosId: number;
            vorname?: string;
            nachname?: string;
            rang?: string;
            atemschutzGueltig?: boolean;
            aktiv?: boolean;
          }>;
        }>("/api/admin/personen");
        if (cancelled) return;
        const list: PickPerson[] = r.items
          .filter((p) => p.aktiv !== false)
          .map((p) => ({
            _id: `person:${p.syBosId}`,
            syBosId: p.syBosId,
            nachname: p.nachname ?? "",
            vorname: p.vorname ?? "",
            dienstgrad: p.rang ?? "",
            atemschutzGueltig: p.atemschutzGueltig === true,
          }))
          .sort((a, b) => a.nachname.localeCompare(b.nachname));
        setPersonen(list);
      } catch {
        // Backend nicht erreichbar — Picker bleibt leer, Auto-Retry beim
        // naechsten Mount/Vehicle-Switch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fahrzeugId]);

  // Persist abgeschlossen-Status in localStorage bei jeder Änderung —
  // damit der Reload nicht den frisch abgeschlossenen Bericht wieder
  // auf "aktiv" zurücksetzt (war das User-Bug-Symptom: nach Refresh war
  // der Dummy-Bericht zurück).
  useEffect(() => {
    for (const e of einsaetze) {
      saveReportState(fahrzeugId, e.id, e.abgeschlossen);
    }
  }, [einsaetze, fahrzeugId]);

  // Backend-Polling (alle 30 s) — drei Aufgaben in einem Lauf:
  //   1. Frischer abgeschlossen-Stand aus Backend übernehmen (z. B. nach
  //      Florianstation-Reaktivierung oder Tablet-Gerätewechsel).
  //   2. **Auto-Open bei neuem Alarm:** wenn ein NEUER aktiver Einsatz
  //      auftaucht während mein Bericht abgeschlossen ist → automatischer
  //      Wechsel zum frischen Einsatz + haptisches Feedback (Vibration).
  //      Damit reißt die App bei jedem BlaulichtSMS-Alarm sofort auf, ohne
  //      dass der Kdt. erst Tabs wechseln muss.
  //   3. Neu via "Neuer Einsatz"-Modal angelegte Einsätze (manuell, Übung,
  //      Lotsendienst) werden ebenfalls auto-aktiviert — selbe Logik, weil
  //      auch sie als status="aktiv" zurückkommen.
  useEffect(() => {
    let cancelled = false;

    interface ApiEinsatzListItem {
      _id: string;
      alarmId?: string;
      einsatzTyp?: string;
      einsatzart?: string;
      einsatzartFreitext?: string;
      einsatzort?: string;
      alarmierungZeit?: string;
      alarmierungText?: string;
      alarmierungAuthor?: string;
      koordinaten?: { lat: number; lng: number };
      stichwort?: string;
    }

    const buildEinsatzFromApi = (api: ApiEinsatzListItem): EinsatzInstance => {
      const persistedStates = loadReportStates(fahrzeugId);
      const persisted = persistedStates[api._id] ?? null;
      const alarm: AlarmDaten = {
        alarmId: api.alarmId ?? api._id.replace(/^einsatz:/, ""),
        einsatzart: api.einsatzart ?? api.einsatzartFreitext ?? api.alarmierungText ?? "Einsatz",
        einsatzort: api.einsatzort ?? "",
        alarmierungZeit: api.alarmierungZeit ?? new Date().toISOString(),
        alarmierungAuthor: api.alarmierungAuthor ?? "BWST",
        koordinaten: api.koordinaten ?? HOME_POS,
        distanzKm: 0,
      };
      if (api.stichwort) {
        alarm.stichwort = api.stichwort as NonNullable<AlarmDaten["stichwort"]>;
      }
      return {
        id: api._id,
        alarm,
        einsatzPos: api.koordinaten ?? HOME_POS,
        manuell: api.einsatzTyp === "manuell" || api.einsatzTyp === "uebung" || api.einsatzTyp === "lotsendienst",
        fahrer: null,
        kdt: null,
        mannschaft: Array.from(
          { length: fahrzeug.besatzung.mannschaftsplaetzeZusaetzlich },
          (_, i) => emptySlot(i + 1),
        ),
        gearSelected: new Set(),
        oelSaecke: 0,
        auftraege: [],
        chronik: [],
        abgeschlossen: persisted,
        uhrzeitBisHHMM: "",
        kmManualOverride: null,
      };
    };

    const runPoll = async () => {
      try {
        const list = await apiCall<{ items: ApiEinsatzListItem[] }>(
          `/api/einsaetze?status=aktiv&fuerFahrzeug=${encodeURIComponent(fahrzeugId)}`,
        );
        if (cancelled) return;
        if (list.items.length === 0) return;

        // Phase 1: Neue Einsaetze erkennen + in lokale Liste aufnehmen.
        // Beim ersten neuen Einsatz im Tick switcht das Tablet auto-magisch
        // dorthin + vibriert. Folge-Einsaetze landen in der Liste, aber der
        // Funktionaer bleibt auf dem aktuellen Tab — er soll waehlen.
        // ZUSAETZLICH: bestehende Einsaetze werden re-synchronisiert bzgl.
        // Stamm-Felder die die Florianstation aendern kann (einsatzart,
        // stichwort, einsatzort, Koordinaten) → der Fahrzeug-Bericht zeigt
        // immer die aktuelle Klassifikation, nicht die vom Anlage-Zeitpunkt.
        let anyNewToUs = false;
        let firstNewId: string | null = null;
        setEinsaetze((prev) => {
          const knownIds = new Set(prev.map((e) => e.id));
          const additions: EinsatzInstance[] = [];
          for (const target of list.items) {
            if (knownIds.has(target._id)) continue;
            const fresh = buildEinsatzFromApi(target);
            // Folge-Auftrag-Vererbung: das erste neu erkannte Einsatz-Doc
            // bekommt das gepuffert Personal — alle weiteren bleiben leer.
            // Wir markieren die ID auch im hydratedRef, damit der spaetere
            // Hydrate-Sweep nichts vom Backend drueberzieht (Backend hat noch
            // keinen Fahrzeugbericht fuer den neuen Einsatz).
            const inherit = inheritPersonalRef.current;
            if (inherit && !firstNewId) {
              fresh.fahrer = inherit.fahrer;
              fresh.kdt = inherit.kdt;
              fresh.mannschaft = inherit.mannschaft.map((m, i) => ({
                ...m,
                slot: i + 1,
              }));
              inheritPersonalRef.current = null;
              hydratedIdsRef.current.add(target._id);
            }
            additions.push(fresh);
            knownIds.add(target._id);
            if (!firstNewId) firstNewId = target._id;
          }
          // Stamm-Felder fuer alle bestehenden Eintraege nachziehen.
          // KEIN Overwrite von alarmierungZeit/alarmId — die kommen vom Alarm.
          const synced = prev.map((e) => {
            const api = list.items.find((it) => it._id === e.id);
            if (!api) return e;
            const fresh = {
              einsatzart:
                api.einsatzart ?? api.einsatzartFreitext ?? e.alarm.einsatzart,
              einsatzort: api.einsatzort ?? e.alarm.einsatzort,
              stichwort: api.stichwort,
            };
            const ortChanged = fresh.einsatzort !== e.alarm.einsatzort;
            const artChanged = fresh.einsatzart !== e.alarm.einsatzart;
            const stwChanged = (fresh.stichwort ?? null) !== (e.alarm.stichwort ?? null);
            if (!ortChanged && !artChanged && !stwChanged) return e;
            const nextAlarm: AlarmDaten = {
              ...e.alarm,
              einsatzart: fresh.einsatzart,
              einsatzort: fresh.einsatzort,
            };
            if (fresh.stichwort) {
              nextAlarm.stichwort = fresh.stichwort as NonNullable<AlarmDaten["stichwort"]>;
            } else if ("stichwort" in nextAlarm) {
              delete nextAlarm.stichwort;
            }
            const nextEinsatzPos = api.koordinaten ?? e.einsatzPos;
            return { ...e, alarm: nextAlarm, einsatzPos: nextEinsatzPos };
          });
          if (additions.length === 0) {
            // Nur Sync — nicht "neuer Einsatz"
            return synced;
          }
          anyNewToUs = true;
          return [...synced, ...additions];
        });
        if (anyNewToUs && firstNewId) {
          try {
            navigator.vibrate?.([100, 60, 100, 60, 200]);
          } catch {
            // egal — Vibration ist Komfort, nicht Pflicht
          }
          // Verhaltens-Logik: wenn das Tablet GAR KEINEN aktiven Einsatz hatte
          // (Idle oder bestehender abgeschlossen), direkt umschalten — der
          // Funktionaer wartet ja darauf. Wenn aber schon ein laufender
          // Einsatz mit echten User-Eingaben offen ist (Mannschaft eingetragen,
          // Geraete gewaehlt, Auftraege geschrieben), zeigen wir stattdessen
          // ein rotes Pop-Up — er soll bewusst entscheiden, nicht aus Versehen
          // mitten in der Eingabe rausgerissen werden.
          const cur = einsaetzeRef.current.find((e) => e.id === activeIdRef.current);
          const hasActiveWork =
            cur &&
            !cur.abgeschlossen &&
            (cur.fahrer ||
              cur.kdt ||
              cur.mannschaft.some((m) => m.person) ||
              cur.gearSelected.size > 0 ||
              cur.oelSaecke > 0 ||
              cur.auftraege.length > 0);
          if (hasActiveWork) {
            // Pop-Up triggern — Werte aus der frisch erkannten Einsatz-Doc.
            const target = list.items.find((it) => it._id === firstNewId);
            if (target) {
              setNewEinsatzPopup({
                id: firstNewId,
                einsatzart:
                  target.einsatzart ?? target.einsatzartFreitext ?? "Neuer Einsatz",
                einsatzort: target.einsatzort ?? "",
              });
            }
          } else {
            setActiveId(firstNewId);
          }
        }

        // Phase 2: Abschluss-Status fuer ALLE bekannten Einsaetze pruefen.
        // Die Florianstation oder ein anderes Tablet kann irgendeinen Bericht
        // abgeschlossen haben — wir muessen jeden moeglicherweise betroffenen
        // Eintrag synchronisieren, nicht nur items[0].
        for (const target of list.items) {
          const einsatzIdEnc = encodeURIComponent(target._id);
          const fz = await apiCall<{
            items?: Array<{
              fahrzeugId?: string;
              status?: "in_arbeit" | "abgeschlossen";
              geaendertAm?: string;
              km?: { gefahrenKm?: number };
              fahrzeugKdtPersonId?: number;
            }>;
          }>(`/api/einsaetze/${einsatzIdEnc}/fahrzeugberichte`);
          if (cancelled) return;
          const mine = fz.items?.find((b) => b.fahrzeugId === fahrzeugId);
          if (!mine || mine.status !== "abgeschlossen") continue;
          setEinsaetze((prev) =>
            prev.map((e) =>
              e.id === target._id && !e.abgeschlossen
                ? {
                    ...e,
                    abgeschlossen: {
                      ts: mine.geaendertAm ?? new Date().toISOString(),
                      durch:
                        mine.fahrzeugKdtPersonId !== undefined
                          ? `Pers-${mine.fahrzeugKdtPersonId}`
                          : "—",
                      kmGefahren: mine.km?.gefahrenKm ?? 0,
                    },
                  }
                : e,
            ),
          );
        }
      } catch {
        // Backend nicht erreichbar — localStorage-Stand bleibt massgeblich.
      }
    };

    void runPoll();
    // Polling alle 5 s. Vorher waren es 30 s — das war der Hauptgrund warum
    // die Disposition von der Florianstation bis zum Empfang am Fahrzeug-
    // Tablet bis zu 30 s gebraucht hat. Fuenf Sekunden ist die richtige
    // Wahl: schnell genug damit der Funktionaer auf der Florianstation den
    // Wechsel quasi-live sieht, langsam genug damit keine Backend-Last
    // entsteht (5 Tablets × 12 Polls/min = 60 Calls/min auf einen
    // CouchDB-_all_docs-Endpoint mit prefix-Limit — vernachlaessigbar).
    const t = setInterval(() => void runPoll(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fahrzeugId]);

  // Hydrate-On-Boot: nach einem Tablet-Reload mitten in einem laufenden
  // Einsatz sind Mannschaft/Aufträge/Geräte lokal leer. Wir holen den letzten
  // status="in_arbeit"-Fahrzeugbericht aus dem Backend und füllen die Felder
  // damit auf. Greift nur wenn der Einsatz noch KEINE lokalen Eingaben hat —
  // sobald der User auch nur einen Slot tippt, blockiert das die Hydrierung
  // (sonst würde der laufende Live-Sync gegen den User kämpfen).
  const hydratedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (personen.length === 0 || einsaetze.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const e of einsaetze) {
        if (cancelled) return;
        if (hydratedIdsRef.current.has(e.id)) continue;
        const hasLocalData =
          !!e.fahrer ||
          !!e.kdt ||
          e.mannschaft.some((m) => m.person) ||
          e.gearSelected.size > 0 ||
          e.oelSaecke > 0 ||
          e.auftraege.length > 0;
        if (hasLocalData || e.abgeschlossen) {
          hydratedIdsRef.current.add(e.id);
          continue;
        }
        try {
          interface FzgberSnapshot {
            fahrzeugId?: string;
            status?: "in_arbeit" | "abgeschlossen";
            fahrerPersonId?: number;
            fahrzeugKdtPersonId?: number;
            mannschaft?: Array<{
              slot: number;
              personId: number;
              atemschutzAktiv?: boolean;
              atemschutzDauerMin?: number;
            }>;
            geraete?: Array<{ materialId: string }>;
            oelbindemittelSaecke?: number;
            taetigkeitsbericht?: string;
            zeit?: { bis?: string };
          }
          const r = await apiCall<{ items?: FzgberSnapshot[] }>(
            `/api/einsaetze/${encodeURIComponent(e.id)}/fahrzeugberichte`,
          );
          if (cancelled) return;
          const mine = r.items?.find((b) => b.fahrzeugId === fahrzeugId);
          if (!mine || mine.status === "abgeschlossen") {
            hydratedIdsRef.current.add(e.id);
            continue;
          }
          const personById = (id?: number): PickPerson | null => {
            if (typeof id !== "number") return null;
            return personen.find((p) => p.syBosId === id) ?? null;
          };
          setEinsaetze((prev) =>
            prev.map((x) => {
              if (x.id !== e.id) return x;
              // Mannschaft rekonstruieren — Slot-Index 1-basiert im Backend
              const m = [...x.mannschaft];
              for (const slot of mine.mannschaft ?? []) {
                const i = slot.slot - 1;
                if (i < 0 || i >= m.length) continue;
                const p = personById(slot.personId);
                if (!p) continue;
                const restored: MannschaftSlotData = {
                  ...m[i]!,
                  person: p,
                  atemschutzAktiv: !!slot.atemschutzAktiv,
                };
                if (
                  slot.atemschutzAktiv &&
                  typeof slot.atemschutzDauerMin === "number"
                ) {
                  restored.atemschutzDauerMin = slot.atemschutzDauerMin;
                }
                m[i] = restored;
              }
              // Aufträge aus taetigkeitsbericht-Zeilen ("· Text") rekonstruieren.
              const restoredAufts: Auftrag[] = (mine.taetigkeitsbericht ?? "")
                .split("\n")
                .map((line) => line.replace(/^·\s*/, "").trim())
                .filter(Boolean)
                .map((text, idx) => ({
                  id: `restored-${idx}-${Date.now()}`,
                  text,
                  zeitstempel: x.alarm.alarmierungZeit,
                }));
              // Uhrzeit bis aus ISO zurueckparsen falls gesetzt.
              let uhrzeitBis = x.uhrzeitBisHHMM;
              if (mine.zeit?.bis) {
                try {
                  const d = new Date(mine.zeit.bis);
                  if (!Number.isNaN(d.getTime())) {
                    uhrzeitBis = `${String(d.getHours()).padStart(2, "0")}:${String(
                      d.getMinutes(),
                    ).padStart(2, "0")}`;
                  }
                } catch {
                  // ignorieren — Default bleibt leer
                }
              }
              return {
                ...x,
                fahrer: personById(mine.fahrerPersonId) ?? x.fahrer,
                kdt: personById(mine.fahrzeugKdtPersonId) ?? x.kdt,
                mannschaft: m,
                gearSelected: new Set(
                  (mine.geraete ?? []).map((g) => g.materialId),
                ),
                oelSaecke: mine.oelbindemittelSaecke ?? 0,
                auftraege: restoredAufts,
                uhrzeitBisHHMM: uhrzeitBis,
              };
            }),
          );
          hydratedIdsRef.current.add(e.id);
        } catch {
          // Backend tot — nächster Pass versucht es erneut sobald einsaetze
          // sich ändert (z. B. weil ein neuer Einsatz dazukommt).
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [einsaetze, personen, fahrzeugId]);

  // Live-Position-Push: alle 3 s die aktuelle GPS-Position an /api/positions
  // schicken. Der Backend-State haelt nur den letzten Ping (kein Track-Persist),
  // Florianstation pollt /api/positions ihrerseits alle 3 s. Wenn GPS noch
  // nicht da ist (geo.fix === null) wird nichts geschickt.
  const geoFixRef = useRef(geo.fix);
  useEffect(() => {
    geoFixRef.current = geo.fix;
  }, [geo.fix]);
  useEffect(() => {
    const id = setInterval(() => {
      const fix = geoFixRef.current;
      if (!fix) return;
      const body: Record<string, number> = {
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
      };
      if (fix.speedKmh !== null) body.speed = fix.speedKmh / 3.6;
      if (fix.headingDeg !== null) body.heading = fix.headingDeg;
      void apiCall("/api/positions", { method: "POST", body }).catch(() => {
        // Netz weg / Backend down — die naechste Iteration probiert es nochmal.
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // GraphHopper-Routing — Route von eigener Position zum Einsatzort holen.
  // Throttle: erst neu holen wenn das Tablet sich > 100 m vom letzten Fetch
  // wegbewegt hat. Backend cached identische Sektoren ohnehin (5 min TTL),
  // 100 m matcht die Cache-Aufloesung perfekt. Bei neuem Einsatzort wird
  // sofort neu geholt.
  const [route, setRoute] = useState<RouteData | undefined>(undefined);
  const lastFetchedSelfPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFetchedEinsatzPosRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!active?.einsatzPos || !geo.fix) return;
    const einsatzPos = active.einsatzPos;
    const fromPos = { lat: geo.fix.lat, lng: geo.fix.lng };
    // Hat sich was geaendert?
    const last = lastFetchedSelfPosRef.current;
    const lastE = lastFetchedEinsatzPosRef.current;
    const movedFar =
      !last ||
      haversineKm(last, fromPos) * 1000 > 100;
    const newEinsatz =
      !lastE || lastE.lat !== einsatzPos.lat || lastE.lng !== einsatzPos.lng;
    if (!movedFar && !newEinsatz) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiCall<{
          ok: true;
          path: Array<{ lat: number; lng: number }>;
          distanceM: number;
          timeMs: number;
          instructions: Array<{
            text: string;
            distanceM: number;
            timeMs: number;
            sign: number;
          }>;
        }>(
          `/api/routing/route?fromLat=${fromPos.lat}&fromLng=${fromPos.lng}&toLat=${einsatzPos.lat}&toLng=${einsatzPos.lng}`,
        );
        if (cancelled) return;
        setRoute({
          path: r.path,
          distanceM: r.distanceM,
          timeMs: r.timeMs,
          instructions: r.instructions,
        });
        lastFetchedSelfPosRef.current = fromPos;
        lastFetchedEinsatzPosRef.current = einsatzPos;
      } catch {
        // Routing tot oder Quota erschöpft → Map faellt auf Luftlinie zurueck.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    active?.einsatzPos?.lat,
    active?.einsatzPos?.lng,
    geo.fix?.lat,
    geo.fix?.lng,
  ]);

  // Live-Fleet-Polling: alle 3 s die Positionen aller Fahrzeuge holen.
  // Das eigene Fahrzeug erscheint in der Liste mit isSelf-Flag, damit die
  // Map es hervorheben kann. Florian Eberstalzell wird im Backend nicht
  // gefuehrt (sendet keine Pings) → wir fuegen ihn fix am FF-Haus dazu.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiCall<{
          items: Array<{
            fahrzeugId: string;
            lat: number;
            lng: number;
            ts: string;
          }>;
        }>("/api/positions");
        if (cancelled) return;
        const mapped: MapPosition[] = r.items
          .filter((p) => p.fahrzeugId in FAHRZEUGE)
          .map((p) => {
            const meta = FAHRZEUGE[p.fahrzeugId as FahrzeugId];
            return {
              fahrzeugId: p.fahrzeugId as FahrzeugId,
              funkrufname: meta.funkrufname,
              abk: shortCode(p.fahrzeugId as FahrzeugId),
              lat: p.lat,
              lng: p.lng,
              lastSeenAt: p.ts,
              isSelf: p.fahrzeugId === fahrzeugId,
            };
          });
        // Florian Eberstalzell fix am FF-Haus dazu, wenn nicht ohnehin in der Liste.
        if (!mapped.some((m) => m.fahrzeugId === "zentrale")) {
          mapped.push({
            fahrzeugId: "zentrale",
            funkrufname: "Florian Eberstalzell",
            abk: "FLORIAN",
            lat: HOME_POS.lat,
            lng: HOME_POS.lng,
            isZentrale: true,
          });
        }
        setFleet(mapped);
      } catch {
        // egal — nächster Tick erneut
      }
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fahrzeugId]);

  // Live-Sync zum Backend: nach jeder Aenderung am Bericht (Mannschaft,
  // Geraete, Aufträge, ÖL) wird mit 2,5 s Debounce ein status="in_arbeit"-
  // Fahrzeugbericht ins Backend geschoben. Damit sieht die Florianstation
  // den Personal-Stand live, nicht erst beim Abschluss. Pausiert wenn
  // Bericht schon abgeschlossen oder kein Active-Einsatz.
  useEffect(() => {
    if (!active || active.abgeschlossen) return;
    const handle = setTimeout(() => {
      void syncBerichtLive(active);
    }, 2500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active?.id,
    active?.abgeschlossen,
    active?.fahrer,
    active?.kdt,
    active?.mannschaft,
    active?.gearSelected,
    active?.oelSaecke,
    active?.auftraege,
  ]);

  // Chronik-Cross-Sync — alle 8 s neue Einträge der anderen Fahrzeuge holen.
  // Pausiert wenn Bericht abgeschlossen (kein Schreibschutz-Bypass nötig).
  useEffect(() => {
    if (!active || active.abgeschlossen) return;
    let cancelled = false;
    const tick = async () => {
      const knownIds = new Set(active.chronik.map((c) => c.id));
      const neue = await fetchChronikDiff(activeId, knownIds);
      if (cancelled || neue.length === 0) return;
      patchActive((e) => {
        const own = new Set(e.chronik.map((c) => c.id));
        const toAdd = neue.filter((n) => !own.has(n.id));
        if (toAdd.length === 0) return e;
        return {
          ...e,
          chronik: [...e.chronik, ...toAdd].sort(
            (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
          ),
        };
      });
    };
    void tick();
    const t = setInterval(() => void tick(), 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, active?.abgeschlossen]);

  function patchActive(updater: (e: EinsatzInstance) => EinsatzInstance) {
    setEinsaetze((prev) => prev.map((e) => (e.id === activeId ? updater(e) : e)));
  }

  const bereitsGewaehlt = useMemo(() => {
    const s = new Set<number>();
    if (!active) return s;
    if (active.fahrer) s.add(active.fahrer.syBosId);
    if (active.kdt) s.add(active.kdt.syBosId);
    for (const m of active.mannschaft) if (m.person) s.add(m.person.syBosId);
    return s;
  }, [active]);

  function selectPerson(p: PickPerson) {
    if (!pickerOpen) return;
    patchActive((e) => {
      if (pickerOpen.kind === "fahrer") return { ...e, fahrer: p };
      if (pickerOpen.kind === "kdt") return { ...e, kdt: p };
      const idx = pickerOpen.slot - 1;
      return {
        ...e,
        mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, person: p } : m)),
      };
    });
    setPickerOpen(null);
  }

  function pickerTitle(): string {
    if (!pickerOpen) return "";
    if (pickerOpen.kind === "fahrer") return "Fahrer wählen";
    if (pickerOpen.kind === "kdt") return "Fahrzeug-Kommandant wählen";
    return `Mannschaftsplatz ${pickerOpen.slot}`;
  }

  function toggleMannschaftAs(idx: number) {
    patchActive((e) => ({
      ...e,
      mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, atemschutzAktiv: !m.atemschutzAktiv } : m)),
    }));
  }
  function setMannschaftAsDauer(idx: number, dauer: number) {
    patchActive((e) => ({
      ...e,
      mannschaft: e.mannschaft.map((m, i) => (i === idx ? { ...m, atemschutzDauerMin: dauer } : m)),
    }));
  }

  /**
   * Zwei-Pfade-Flow:
   *  - kind="speech" (Chrome/Edge): Text ist sofort da, KEIN Server-Upload nötig.
   *    Chronik-Eintrag wird direkt mit dem Text geschrieben (kein Pending-State).
   *  - kind="audio" (iOS-Safari/Firefox): Audio-Blob hochladen an Whisper-API.
   *    Bei nicht-konfigurierter API erscheint ein klarer Hinweis-Text im Eintrag.
   */
  function onDictateResult(result: DictateResult) {
    const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const zeitstempel = new Date().toISOString();
    const dauer = formatDuration(result.durationMs);

    if (result.kind === "speech") {
      // ─── Pfad A: Web-Speech-API direktes Transkript ───
      const text = result.text.trim();
      const finalText = text || `🎤 Audio · ${dauer} · (keine Sprache erkannt)`;
      patchActive((e) => ({
        ...e,
        chronik: [
          ...e.chronik,
          {
            id,
            zeitstempel,
            funkrufname: fahrzeug.funkrufname,
            source: "fahrzeug",
            text: finalText,
          },
        ],
      }));
      void broadcastChronikEntry(activeId, {
        id,
        zeitstempel,
        funkrufname: fahrzeug.funkrufname,
        fahrzeugId,
        source: "fahrzeug",
        text: finalText,
      });
      return;
    }

    // ─── Pfad B: Audio-Blob → Whisper-Backend (iOS-Safari / Firefox) ───
    const pendingText = `🎤 Audio · ${dauer} · transkribiere …`;
    patchActive((e) => ({
      ...e,
      chronik: [
        ...e.chronik,
        {
          id,
          zeitstempel,
          funkrufname: fahrzeug.funkrufname,
          source: "fahrzeug",
          pending: true,
          text: pendingText,
        },
      ],
    }));
    void broadcastChronikEntry(activeId, {
      id,
      zeitstempel,
      funkrufname: fahrzeug.funkrufname,
      fahrzeugId,
      source: "fahrzeug",
      pending: true,
      text: pendingText,
    });

    void (async () => {
      const outcome = await transcribeAudio(result.blob, { lang: "de" });
      const finalText = outcome.ok
        ? outcome.text.trim() || `🎤 Audio · ${dauer} · (leer)`
        : `🎤 Audio · ${dauer} — ${describeFailure(outcome.reason)}`;

      patchActive((e) => ({
        ...e,
        chronik: e.chronik.map((entry) =>
          entry.id === id
            ? { ...entry, pending: false, text: finalText }
            : entry,
        ),
      }));
      void broadcastChronikEntry(activeId, {
        id,
        zeitstempel,
        funkrufname: fahrzeug.funkrufname,
        fahrzeugId,
        source: "fahrzeug",
        pending: false,
        text: finalText,
      });
    })();
  }

  function addAuftrag(text: string) {
    const id = `auf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const zeitstempel = new Date().toISOString();
    patchActive((e) => ({
      ...e,
      auftraege: [...e.auftraege, { id, text, zeitstempel }],
    }));
    // Auch in der Chronik vermerken — andere Fahrzeuge sehen "Auftrag begonnen: X"
    const chronikId = `chr-auf-${id}`;
    const chronikText = `Auftrag begonnen: ${text}`;
    patchActive((e) => ({
      ...e,
      chronik: [
        ...e.chronik,
        {
          id: chronikId,
          zeitstempel,
          funkrufname: fahrzeug.funkrufname,
          source: "fahrzeug",
          text: chronikText,
        },
      ],
    }));
    void broadcastChronikEntry(activeId, {
      id: chronikId,
      zeitstempel,
      funkrufname: fahrzeug.funkrufname,
      fahrzeugId,
      source: "fahrzeug",
      text: chronikText,
    });
  }
  function removeAuftrag(id: string) {
    patchActive((e) => ({ ...e, auftraege: e.auftraege.filter((a) => a.id !== id) }));
  }

  function toggleGear(id: string) {
    patchActive((e) => {
      const next = new Set(e.gearSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...e, gearSelected: next };
    });
  }
  function setOelSaecke(n: number) {
    patchActive((e) => ({ ...e, oelSaecke: n }));
  }

  // createNewAuftrag entfernt — die Anlage neuer Einsätze läuft jetzt
  // ausschließlich über das NeuerEinsatzTabletModal, das POST
  // /api/einsaetze/manuell ruft. Der neue Einsatz erscheint beim nächsten
  // 30s-Backend-Poll automatisch und triggert Auto-Open + Vibration.

  function handleSwitchVehicle(id: FahrzeugId) {
    setVehicleSwitcherOpen(false);
    onSwitchFahrzeug(id);
  }

  /**
   * KM-Berechnung priorisiert:
   *   1. Manueller Override durch den Fahrzeugkdt (wenn vorhanden)
   *   2. GraphHopper-Route Feuerwehrhaus → Einsatzort × 2 (Hin+Rück)
   *   3. Luftlinie × 1.3 (Strassen-Faktor) × 2 als Fallback wenn Routing
   *      noch nicht zurueckgegeben hat oder die API down ist
   *
   * Die manuelle Eingabe gewinnt IMMER — der Kdt weiss am besten ob er
   * den direkten Weg gefahren ist oder noch ein Mannschaftsfahrzeug
   * abgeholt hat. Auto-Wert bleibt sichtbar als Vergleich.
   */
  function computeKm(): number {
    if (!active) return 0;
    if (typeof active.kmManualOverride === "number") return active.kmManualOverride;
    return computeKmAuto();
  }
  function computeKmAuto(): number {
    if (!active) return 0;
    if (route && route.distanceM > 0) {
      return (route.distanceM / 1000) * 2;
    }
    const luftlinie = haversineKm(HOME_POS, active.einsatzPos);
    return luftlinie * ROAD_FACTOR * 2;
  }

  // Sync-Zustand für den Upload — wird nach abschliessen() befüllt damit
  // der User sieht ob der Bericht im Backend angekommen ist.
  const [uploadState, setUploadState] = useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "ok"; einsatzId: string; at: string }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });

  /**
   * Fahrzeugbericht-Upload — wird beim Abschließen versucht. Findet den
   * aktiven Einsatz im Backend (per /api/einsaetze?status=aktiv) und PUTtet
   * den Bericht. Bei Offline / fehlendem Einsatz: lokaler Stand bleibt
   * erhalten, der User sieht eine "lokal gespeichert"-Meldung und kann
   * beim nächsten Reconnect erneut hochladen.
   */
  async function uploadFahrzeugbericht(
    einsatz: EinsatzInstance,
    kmGefahren: number,
  ): Promise<void> {
    setUploadState({ kind: "uploading" });
    try {
      // Aktiven Einsatz im Backend suchen
      const list = await apiCall<{ items: Array<{ _id: string; alarmId?: string }> }>(
        "/api/einsaetze?status=aktiv",
      );
      const matchByAlarmId = list.items.find((d) => d.alarmId === einsatz.alarm.alarmId);
      const firstActive = list.items[0];
      const target = matchByAlarmId ?? firstActive;
      if (!target) {
        setUploadState({
          kind: "error",
          msg: "Kein aktiver Einsatz im Backend gefunden — Bericht nur lokal gespeichert.",
        });
        return;
      }
      const einsatzId = target._id;
      const now = new Date().toISOString();
      // Wenn der Kdt die "Uhrzeit bis" schon manuell gesetzt hat,
      // respektieren wir das — der Abschluss soll seine Eingabe nicht
      // ueberschreiben. Andernfalls Zeitpunkt des Abschluss-Klicks.
      const bisISO = einsatz.uhrzeitBisHHMM
        ? hhmmToISOAt(einsatz.alarm.alarmierungZeit, einsatz.uhrzeitBisHHMM)
        : now;

      const body = {
        zeit: {
          von: einsatz.alarm.alarmierungZeit,
          bis: bisISO,
        },
        km: { gefahrenKm: kmGefahren },
        gpsTrack: [],
        ...(einsatz.fahrer?.syBosId ? { fahrerPersonId: einsatz.fahrer.syBosId } : {}),
        ...(einsatz.kdt?.syBosId ? { fahrzeugKdtPersonId: einsatz.kdt.syBosId } : {}),
        mannschaft: einsatz.mannschaft
          .map((m, idx) =>
            m.person
              ? {
                  slot: idx + 1,
                  personId: m.person.syBosId,
                  atemschutzAktiv: !!m.atemschutzAktiv,
                  ...(m.atemschutzAktiv && typeof m.atemschutzDauerMin === "number"
                    ? { atemschutzDauerMin: m.atemschutzDauerMin }
                    : {}),
                }
              : null,
          )
          .filter((x): x is NonNullable<typeof x> => x !== null),
        geraete: Array.from(einsatz.gearSelected).map((id) => ({ materialId: id })),
        oelbindemittelSaecke: Math.max(0, Math.min(99, Math.floor(einsatz.oelSaecke))),
        taetigkeitsbericht: einsatz.auftraege.map((a) => `· ${a.text}`).join("\n"),
        status: "abgeschlossen" as const,
      };

      await apiCall(
        `/api/einsaetze/${encodeURIComponent(einsatzId)}/fahrzeugbericht/${encodeURIComponent(fahrzeugId)}`,
        { method: "PUT", body },
      );
      setUploadState({ kind: "ok", einsatzId, at: new Date().toLocaleTimeString("de-AT") });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadState({ kind: "error", msg });
    }
  }

  function abschliessen(alsoCloseEinsatz: boolean) {
    if (!active) return;
    const km = computeKm();
    const einsatzId = active.id;
    patchActive((e) => ({
      ...e,
      abgeschlossen: {
        ts: new Date().toISOString(),
        durch: e.kdt ? `${e.kdt.nachname} ${e.kdt.vorname}` : "—",
        kmGefahren: km,
      },
    }));
    setAbschlussModalOpen(false);
    void uploadFahrzeugbericht(active, km);
    // Solo-Tablet-Workflow: Wenn der Funktionaer das Hakerl gesetzt hat,
    // schliesst der Fahrzeug-Abschluss auch gleich den Einsatz selbst.
    // Backend erlaubt das seit dem requireAuth("mannschaft")-Switch.
    if (alsoCloseEinsatz) {
      void apiCall(`/api/einsaetze/${encodeURIComponent(einsatzId)}/abschluss`, {
        method: "POST",
        body: {},
      }).catch((err) => {
        console.warn("[abschluss] Einsatz-Abschluss fehlgeschlagen:", err);
      });
    }
  }

  /**
   * Live-Sync: schreibt den aktuellen Zwischenstand (Mannschaft, Geraete,
   * Aufträge, ÖL) als status="in_arbeit"-Fahrzeugbericht ins Backend.
   * Dadurch sieht die Florianstation den Personal-Stand live (alle ~15 s
   * per Poll), ohne dass der Kdt manuell „Senden" druecken muss.
   * Silent — kein UI-Feedback; Fehler nur in der Konsole. Der Abschluss-
   * Upload hat eigene UI-Statusbadge.
   */
  async function syncBerichtLive(einsatz: EinsatzInstance): Promise<void> {
    try {
      const body = {
        zeit: {
          von: einsatz.alarm.alarmierungZeit,
          ...(einsatz.uhrzeitBisHHMM
            ? {
                bis: hhmmToISOAt(
                  einsatz.alarm.alarmierungZeit,
                  einsatz.uhrzeitBisHHMM,
                ),
              }
            : {}),
        },
        km: { gefahrenKm: computeKm() },
        gpsTrack: [],
        ...(einsatz.fahrer?.syBosId
          ? { fahrerPersonId: einsatz.fahrer.syBosId }
          : {}),
        ...(einsatz.kdt?.syBosId
          ? { fahrzeugKdtPersonId: einsatz.kdt.syBosId }
          : {}),
        mannschaft: einsatz.mannschaft
          .map((m, idx) =>
            m.person
              ? {
                  slot: idx + 1,
                  personId: m.person.syBosId,
                  atemschutzAktiv: !!m.atemschutzAktiv,
                  ...(m.atemschutzAktiv &&
                  typeof m.atemschutzDauerMin === "number"
                    ? { atemschutzDauerMin: m.atemschutzDauerMin }
                    : {}),
                }
              : null,
          )
          .filter((x): x is NonNullable<typeof x> => x !== null),
        geraete: Array.from(einsatz.gearSelected).map((id) => ({
          materialId: id,
        })),
        oelbindemittelSaecke: Math.max(
          0,
          Math.min(99, Math.floor(einsatz.oelSaecke)),
        ),
        taetigkeitsbericht: einsatz.auftraege
          .map((a) => `· ${a.text}`)
          .join("\n"),
        status: "in_arbeit" as const,
      };
      await apiCall(
        `/api/einsaetze/${encodeURIComponent(einsatz.id)}/fahrzeugbericht/${encodeURIComponent(fahrzeugId)}`,
        { method: "PUT", body },
      );
    } catch (err) {
      console.warn("[live-sync] Fahrzeugbericht konnte nicht synchronisiert werden:", err);
    }
  }

  const tabs: EinsatzTabSummary[] = einsaetze.map((e) => ({
    id: e.id,
    einsatzart: e.alarm.einsatzart,
    einsatzort: e.alarm.einsatzort,
    status: e.abgeschlossen ? "abgeschlossen" : "aktiv",
    manuell: e.manuell,
  }));

  // Idle: kein aktiver Einsatz im lokalen State oder Bericht abgeschlossen.
  // Bei Idle rendern wir die IdleView mit Quick-Actions statt das Formular.
  const istIdle = !active || !!active.abgeschlossen;

  const mannschaftCount = active?.mannschaft.filter((m) => m.person).length ?? 0;
  const asAktiv = active?.mannschaft.filter((m) => m.person && m.atemschutzAktiv).length ?? 0;
  const personenAnzahl = mannschaftCount + (active?.fahrer ? 1 : 0) + (active?.kdt ? 1 : 0);
  const fahrerKdtCount = (active?.fahrer ? 1 : 0) + (active?.kdt ? 1 : 0);
  const kmRound = computeKm();
  const kmDisplay = `${kmRound.toFixed(1).replace(".", ",")} km`;

  const checks: AbschlussCheck[] = [
    { ok: !!active?.fahrer, label: "Fahrer eingetragen" },
    { ok: !!active?.kdt, label: "Fahrzeug-Kommandant eingetragen" },
    { ok: mannschaftCount >= 1, label: `Mindestens 1 Mannschaftsplatz besetzt (aktuell ${mannschaftCount})` },
    { ok: !!active?.alarm.einsatzort.trim(), label: "Einsatzadresse gesetzt (für Strecken-Berechnung)" },
  ];

  const abschlussSummary = [
    { label: "Mannschaft", value: `${personenAnzahl} Pers.` },
    { label: "KM (auto)", value: kmDisplay },
    { label: "Geräte", value: String(active?.gearSelected.size ?? 0) },
    { label: "Aufträge", value: String(active?.auftraege.length ?? 0) },
  ];

  const datum = active ? new Date(active.alarm.alarmierungZeit) : new Date();
  const datumStr = `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`;
  const zeitStr = `${pad(datum.getHours())}:${pad(datum.getMinutes())}`;

  return (
    <div>
      <Topbar funkrufname={fahrzeug.funkrufname} {...(active ? { einsatzNr: active.alarm.alarmId } : {})} geo={geo} />

      <EinsatzTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={() => setNeuerEinsatzOpen("manuell")}
      />

      <StatusBanner />
      <HandoffBanner onReleased={onHandoffLogout} />

      <main className="page">
        {istIdle || !active ? (
          <IdleView
            funkrufname={fahrzeug.funkrufname}
            onNeuerBericht={(typ) => setNeuerEinsatzOpen(typ)}
            onArchiv={() => setArchivOpen(true)}
            syncState={uploadState}
            onRetryUpload={() => active?.abgeschlossen && void uploadFahrzeugbericht(active, active.abgeschlossen.kmGefahren)}
          />
        ) : (
          <>
            <AlarmCard alarm={active.alarm} />

            <SectionHead title="Einsatzdaten" />
            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Calendar size={20} />
                  Datum &amp; Zeitraum
                </div>
                <span className="card-meta">Auto-Übernahme aus Alarm</span>
              </div>
              <div className="grid-3" style={{ gap: 14 }}>
                <div className="field">
                  <label className="caption">Datum</label>
                  <div className="input-row filled">
                    <input value={datumStr} readOnly />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">Uhrzeit von</label>
                  <div className="input-row filled">
                    <input value={zeitStr} readOnly className="num" />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">Uhrzeit bis</label>
                  <div className={`input-row${active.uhrzeitBisHHMM ? " filled" : ""}`}>
                    <input
                      type="time"
                      value={active.uhrzeitBisHHMM}
                      onChange={(e) =>
                        patchActive((x) => ({ ...x, uhrzeitBisHHMM: e.target.value }))
                      }
                      disabled={!!active.abgeschlossen}
                      className="num"
                      style={{
                        color: active.uhrzeitBisHHMM
                          ? "var(--fg)"
                          : "var(--fg-3)",
                      }}
                    />
                    {active.uhrzeitBisHHMM ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Uhrzeit löschen"
                        title="Uhrzeit löschen"
                        disabled={!!active.abgeschlossen}
                        onClick={() =>
                          patchActive((x) => ({ ...x, uhrzeitBisHHMM: "" }))
                        }
                        style={{ width: 30, height: 30, minHeight: 30 }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                      </button>
                    ) : (
                      <div className="chev">
                        <span style={{ fontSize: 12 }}>▾</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label className="caption">Einsatzort</label>
                <input className="input filled" value={active.alarm.einsatzort} readOnly />
              </div>
              {/* Strecke / Kilometer — Auto-Berechnung Feuerwehrhaus ↔ Einsatzort × 2 */}
              <div className="grid-2" style={{ marginTop: 14, gap: 14 }}>
                <div className="field">
                  <label className="caption">
                    Strecke (Hin+Rück) · Auto
                  </label>
                  <div className="input-row filled">
                    <input
                      value={`${computeKmAuto().toFixed(1).replace(".", ",")} km`}
                      readOnly
                      className="num"
                      style={{ color: "var(--fg-3)", fontWeight: 500 }}
                    />
                    <div
                      className="chev"
                      title={
                        route && route.distanceM > 0
                          ? "Über GraphHopper-Route berechnet"
                          : "Luftlinie × 1,3 (GraphHopper noch nicht da)"
                      }
                    >
                      <span style={{ fontSize: 11 }}>
                        {route && route.distanceM > 0 ? "GH" : "≈"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label className="caption">
                    Tatsächlich gefahren · Eingabe Fzg-Kdt
                  </label>
                  <div
                    className={`input-row${
                      typeof active.kmManualOverride === "number" ? " filled" : ""
                    }`}
                  >
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="9999"
                      value={
                        typeof active.kmManualOverride === "number"
                          ? String(active.kmManualOverride)
                          : ""
                      }
                      placeholder={`${computeKmAuto().toFixed(1).replace(".", ",")} (übernehmen)`}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        patchActive((x) => ({
                          ...x,
                          kmManualOverride:
                            v === "" || Number.isNaN(Number(v))
                              ? null
                              : Math.max(0, Math.min(9999, Number(v))),
                        }));
                      }}
                      disabled={!!active.abgeschlossen}
                      className="num"
                    />
                    {typeof active.kmManualOverride === "number" ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Auf Auto-Wert zurücksetzen"
                        title="Auf Auto-Wert zurücksetzen"
                        disabled={!!active.abgeschlossen}
                        onClick={() =>
                          patchActive((x) => ({ ...x, kmManualOverride: null }))
                        }
                        style={{ width: 30, height: 30, minHeight: 30 }}
                      >
                        <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
                      </button>
                    ) : (
                      <div className="chev">
                        <span style={{ fontSize: 11 }}>km</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Truck size={20} />
                  Fahrzeug
                </div>
                <span className="card-meta">
                  <span className="num">{fahrzeug.bezeichnung}</span> · {fahrzeug.funkrufname}
                </span>
              </div>
              <div className="vehicle-row">
                {(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"] as const).map((id) => {
                  const active2 = id === fahrzeugId;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`vehicle-chip${active2 ? " active" : ""}`}
                      onClick={() => !active2 && handleSwitchVehicle(id)}
                    >
                      <div className="code">{shortCode(id)}</div>
                      <div className="sub">{shortSub(id)}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Users size={20} />
                  Fahrer &amp; Fahrzeug-Kdt.
                </div>
                <span className="card-meta">
                  <span className="num">{fahrerKdtCount}</span> / 2 belegt
                </span>
              </div>
              <div className="grid-2">
                <PersonButton
                  label="Fahrer"
                  person={active.fahrer}
                  onOpen={() => setPickerOpen({ kind: "fahrer" })}
                  onClear={() => patchActive((e) => ({ ...e, fahrer: null }))}
                />
                <PersonButton
                  label="Fahrzeug-Kdt."
                  person={active.kdt}
                  onOpen={() => setPickerOpen({ kind: "kdt" })}
                  onClear={() => patchActive((e) => ({ ...e, kdt: null }))}
                />
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Users size={20} />
                  Mannschaft
                </div>
                <span className="card-meta">
                  <span className="num">{mannschaftCount}</span> / {active.mannschaft.length} Plätze
                  {asAktiv > 0 ? <> · <span className="num">{asAktiv}</span>× Atemschutz aktiv</> : null}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {active.mannschaft.map((m, i) => (
                  <MannschaftSlot
                    key={m.slot}
                    data={m}
                    onPickPerson={() => setPickerOpen({ kind: "crew", slot: m.slot })}
                    onToggleAs={() => toggleMannschaftAs(i)}
                    onChangeAs={(v) => setMannschaftAsDauer(i, v)}
                    onClearPerson={() =>
                      patchActive((e) => ({
                        ...e,
                        mannschaft: e.mannschaft.map((slot, idx) =>
                          idx === i
                            ? { ...slot, person: null, atemschutzAktiv: false }
                            : slot,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            </section>

            <GearChips
              items={gearList}
              selected={active.gearSelected}
              oelbindemittelSaecke={active.oelSaecke}
              onToggle={toggleGear}
              onOelChange={setOelSaecke}
            />

            <AuftraegeSection
              auftraege={active.auftraege}
              verfuegbareTypen={DEFAULT_AUFTRAG_TYPEN}
              onAdd={addAuftrag}
              onRemove={removeAuftrag}
            />

            <SectionHead title="Anfahrt & Position-Sharing" />
            <MapCard
              selfPos={selfPos}
              einsatzPos={active.einsatzPos}
              einsatzAdresse={active.alarm.einsatzort}
              fleet={fleet}
              hydranten={[]}
              showLoeschwasser={false}
              {...(route ? { route } : {})}
            />

            <section className="card">
              <div className="card-head">
                <div className="card-title">
                  <Clipboard size={20} />
                  Einsatzchronik
                </div>
                <span className="card-meta">Whisper · offline</span>
              </div>
              <ChronikTimeline eintraege={active.chronik} />
              <DictateButton onResult={onDictateResult} />
            </section>

            <div className="cta-wrap">
              <div className="cta-secondary">
                <button type="button">
                  <Save size={16} />
                  Entwurf speichern
                </button>
                <button type="button" onClick={() => setVorschauOpen(true)}>
                  <Eye size={16} />
                  Vorschau Bericht
                </button>
              </div>
              <button type="button" className="cta" onClick={() => setAbschlussModalOpen(true)}>
                <CheckCircle2 size={22} />
                Fahrzeugbericht abschließen
                <ArrowRight size={22} />
              </button>
              <div className="cta-hint">
                Übergibt den Bericht an die Zentrale <strong>„Florian Eberstalzell"</strong>.
              </div>
            </div>
          </>
        )}
      </main>

      <div className="appfoot">
        HotDoc
        <span className="sep">·</span>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
          }}
          title="Über HotDoc · Entwickler · Lizenz · Release-Notes"
        >
          {APP_VERSION} · {APP_BUILD}
        </button>
        <span className="sep">·</span>
        {fahrzeug.funkrufname}
        <span className="sep">·</span>
        <button
          type="button"
          onClick={() => setHandoffOpen(true)}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--red)",
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
            marginRight: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
          title="Sitzung per QR-Code aufs Handy übertragen (z. B. Tablet-Akku leer)"
        >
          <Smartphone size={11} /> An Handy übergeben
        </button>
        <span className="sep">·</span>
        <button
          type="button"
          onClick={() => setVehicleSwitcherOpen(true)}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
            marginRight: 8,
          }}
        >
          Fahrzeug wechseln
        </button>
        <span className="sep">·</span>
        <button
          type="button"
          onClick={onResetSetup}
          style={{
            background: "transparent",
            border: 0,
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
            textDecoration: "underline",
            minHeight: 0,
            padding: 0,
          }}
        >
          Setup
        </button>
        <span className="sep">·</span>
        <FxToggle />
      </div>

      <HandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        einsatzId={activeId}
        onClaimed={() => {
          setHandoffOpen(false);
          onHandoffLogout();
        }}
      />

      <PersonPickerModal
        open={!!pickerOpen}
        title={pickerTitle()}
        subtitle={`aktive Mitglieder · ${fahrzeug.bezeichnung} · ${fahrzeug.besatzung.typ}`}
        personen={personen}
        bereitsGewaehlt={bereitsGewaehlt}
        onSelect={selectPerson}
        onClose={() => setPickerOpen(null)}
      />

      <VehicleSwitcherModal
        open={vehicleSwitcherOpen}
        current={fahrzeugId}
        onSelect={handleSwitchVehicle}
        onClose={() => setVehicleSwitcherOpen(false)}
      />

      {/* NeuerAuftragModal entfernt — Konsolidierung mit NeuerEinsatzTabletModal,
          beide Buttons ("+ Neuer Einsatz" oben im Tab-Header und unten in der
          IdleView) öffnen jetzt das gleiche Modal. */}

      <AbschlussModal
        showCloseEinsatzOption
        open={abschlussModalOpen}
        funkrufname={fahrzeug.funkrufname}
        checks={checks}
        summary={abschlussSummary}
        onConfirm={abschliessen}
        onCancel={() => setAbschlussModalOpen(false)}
      />

      {active ? (
        <VorschauModal
          open={vorschauOpen}
          data={{
            fahrzeugId,
            funkrufname: fahrzeug.funkrufname,
            alarm: active.alarm,
            fahrer: active.fahrer,
            kdt: active.kdt,
            mannschaft: active.mannschaft,
            gearList,
            gearSelected: active.gearSelected,
            oelSaecke: active.oelSaecke,
            auftraege: active.auftraege,
            chronik: active.chronik,
            kmGefahren: kmRound,
          }}
          onClose={() => setVorschauOpen(false)}
        />
      ) : null}

      {/* ─── Neuer Einsatz/Übung/Lotsendienst ─── */}
      <NeuerEinsatzTabletModal
        open={neuerEinsatzOpen !== null}
        initialTyp={neuerEinsatzOpen ?? "manuell"}
        onClose={() => setNeuerEinsatzOpen(null)}
        onCreated={(einsatzId, typ) => {
          setNeuerEinsatzOpen(null);
          // Folge-Auftrag-Personal puffern: wenn der aktuelle Einsatz noch
          // laeuft und Personal eingetragen hat, uebernehmen wir es in den
          // neuen Einsatz sobald der vom Backend zurueckkommt. Diese Logik
          // greift NUR fuer manuell/uebung/lotsendienst — BlaulichtSMS-Alarme
          // bekommen ihre eigene Besatzung weil die typisch frisch alarmiert
          // werden. Wenn das Tablet im Idle ist (active=null), ist ohnehin
          // nichts zu vererben.
          if (
            active &&
            !active.abgeschlossen &&
            (typ === "manuell" || typ === "uebung" || typ === "lotsendienst") &&
            (active.fahrer || active.kdt || active.mannschaft.some((m) => m.person))
          ) {
            inheritPersonalRef.current = {
              fahrer: active.fahrer,
              kdt: active.kdt,
              // Deep-Copy damit der alte Bericht nicht mitvergreift wenn der
              // neue Bericht Werte aendert.
              mannschaft: active.mannschaft.map((m) => ({
                ...m,
                person: m.person ?? null,
              })),
            };
          }
          // Vibration als haptisches Feedback bei erfolgreichem Anlegen.
          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            // egal
          }
          console.info("[neuer-einsatz] angelegt:", { einsatzId, typ, inherit: !!inheritPersonalRef.current });
        }}
      />

      {/* ─── Archiv (read-only) — Fahrzeug-Modus: zeigt eigene Fahrzeug-
           Berichte mit KM + Personenzahl statt aller Hauptberichte. ─── */}
      <ArchivTabletModal
        open={archivOpen}
        onClose={() => setArchivOpen(false)}
        fahrzeugId={fahrzeugId}
        fahrzeugName={fahrzeug.funkrufname}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* ─── Pop-Up: Neuer Einsatz waehrend laufender Bearbeitung.
           Backdrop-Blur sperrt den Hintergrund visuell. Der Fahrzeugkdt
           muss entweder "Oeffnen" klicken (wechselt activeId, der bisherige
           bleibt in der Tab-Leiste sichtbar) oder "Spaeter" (Pop-Up
           geht weg, neuer Einsatz bleibt als Tab in der Leiste). ─── */}
      {newEinsatzPopup && (
        <div
          className="modal-backdrop"
          style={{
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-einsatz-popup-title"
        >
          <div
            style={{
              background: "var(--bg, #fff)",
              color: "var(--text, #111)",
              borderRadius: 16,
              padding: "24px 28px",
              width: "min(520px, calc(100% - 32px))",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              border: "3px solid #dc2626",
              animation: "pulse-red 1.4s ease-in-out infinite",
            }}
          >
            <style>{`
              @keyframes pulse-red {
                0%, 100% { box-shadow: 0 24px 60px rgba(0,0,0,0.35), 0 0 0 0 rgba(220,38,38,0.6); }
                50%      { box-shadow: 0 24px 60px rgba(0,0,0,0.35), 0 0 0 12px rgba(220,38,38,0); }
              }
            `}</style>
            <div
              style={{
                display: "inline-block",
                padding: "4px 14px",
                borderRadius: 999,
                background: "#dc2626",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              ⚠ Neuer Einsatz
            </div>
            <h2
              id="new-einsatz-popup-title"
              style={{ margin: "0 0 8px 0", fontSize: 22, lineHeight: 1.25 }}
            >
              {newEinsatzPopup.einsatzart || "Einsatz"}
            </h2>
            {newEinsatzPopup.einsatzort && (
              <div
                style={{
                  fontSize: 16,
                  color: "var(--text-muted, #555)",
                  marginBottom: 18,
                }}
              >
                📍 {newEinsatzPopup.einsatzort}
              </div>
            )}
            <div
              style={{
                fontSize: 14,
                color: "var(--text-muted, #666)",
                marginBottom: 20,
                lineHeight: 1.5,
              }}
            >
              Ein neuer Einsatz wurde dem Fahrzeug zugewiesen. Der aktuelle
              Bericht bleibt erhalten und ist über die Tab-Leiste oben
              erreichbar.
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setNewEinsatzPopup(null)}
                style={{ minWidth: 110 }}
              >
                Später
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setActiveId(newEinsatzPopup.id);
                  setNewEinsatzPopup(null);
                }}
                style={{
                  minWidth: 140,
                  background: "#dc2626",
                  borderColor: "#dc2626",
                  color: "#fff",
                  fontWeight: 700,
                }}
                autoFocus
              >
                Einsatz öffnen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Kombiniert das Datum der Alarmierung mit einer User-eingegebenen
 * "HH:MM"-Uhrzeit zu einem ISO-Timestamp. Wenn die Uhrzeit kleiner als
 * die Alarmierungs-Uhrzeit ist (z. B. Einsatz ueber Mitternacht), wird
 * der Tag um 24h vorgeschoben. Bei kaputtem Input wird der Alarmierungs-
 * Zeitpunkt selbst zurueckgegeben — defensiv damit kein Crash.
 */
function hhmmToISOAt(alarmierungISO: string, hhmm: string): string {
  try {
    const base = new Date(alarmierungISO);
    if (Number.isNaN(base.getTime())) return alarmierungISO;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return alarmierungISO;
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    const out = new Date(base);
    out.setHours(h, min, 0, 0);
    if (out.getTime() < base.getTime()) {
      // Einsatz ueber Mitternacht — naechster Tag
      out.setDate(out.getDate() + 1);
    }
    return out.toISOString();
  } catch {
    return alarmierungISO;
  }
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className="section-head">
      <span className="h">{title}</span>
      <span className="line" />
    </div>
  );
}

function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}
function shortSub(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "Kommando";
    case "tlf-a-4000": return "Tanklösch.";
    case "lfa-b":      return "Löschfzg.";
    case "mtf":        return "Mannsch.";
    case "zentrale":   return "Zentrale";
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}
