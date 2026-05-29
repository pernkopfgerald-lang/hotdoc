import { ArrowRight, Calendar, CheckCircle2, Clipboard, Eye, Save, Smartphone, Truck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { APP_BUILD, APP_VERSION } from "../version";
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
import { MapCard, type MapPosition } from "../components/MapCard";
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

  // einsaetze[] startet leer — kein Phantom-Einsatz, keine Vorbelegung.
  // Backend-Poll fuegt einen Eintrag hinzu sobald ein echter Einsatz im
  // CouchDB ist (BlaulichtSMS-Alarm ODER manuelle Anlage via Modal).
  const [einsaetze, setEinsaetze] = useState<EinsatzInstance[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  // Fleet ist leer — Live-Positions-Sharing via SSE folgt mit Phase 4.
  // Bis dahin zeigt die Map nur das eigene Tablet (selfPos via Geolocation).
  const fleet: MapPosition[] = [];

  const active = einsaetze.find((e) => e.id === activeId) ?? null;

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
        let anyNewToUs = false;
        let firstNewId: string | null = null;
        setEinsaetze((prev) => {
          const knownIds = new Set(prev.map((e) => e.id));
          const additions: EinsatzInstance[] = [];
          for (const target of list.items) {
            if (knownIds.has(target._id)) continue;
            additions.push(buildEinsatzFromApi(target));
            knownIds.add(target._id);
            if (!firstNewId) firstNewId = target._id;
          }
          if (additions.length === 0) return prev;
          anyNewToUs = true;
          return [...prev, ...additions];
        });
        if (anyNewToUs && firstNewId) {
          setActiveId(firstNewId);
          try {
            navigator.vibrate?.([100, 60, 100, 60, 200]);
          } catch {
            // egal — Vibration ist Komfort, nicht Pflicht
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
    const t = setInterval(() => void runPoll(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fahrzeugId]);

  // Legacy-Mount-Effekt: bleibt für Rückwärtskompatibilität als no-op-Block.
  // Die Logik wurde in den runPoll-Loop oben verschoben damit Auto-Open
  // periodisch greift, nicht nur beim Mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // intentional no-op — siehe runPoll oben
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fahrzeugId]);

  // (Frueher: kuenstliche Random-Walk-Animation fuer Demo-Fleet-Eintraege.
  // Entfernt — Live-Positions-Sharing kommt mit Phase 4 ueber SSE.)

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

  function computeKm(): number {
    if (!active) return 0;
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

      const body = {
        zeit: {
          von: einsatz.alarm.alarmierungZeit,
          bis: now,
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

  function abschliessen() {
    if (!active) return;
    const km = computeKm();
    patchActive((e) => ({
      ...e,
      abgeschlossen: {
        ts: new Date().toISOString(),
        durch: e.kdt ? `${e.kdt.nachname} ${e.kdt.vorname}` : "—",
        kmGefahren: km,
      },
    }));
    setAbschlussModalOpen(false);
    // Upload im Hintergrund anstoßen — UI ist schon abgeschlossen, der
    // User sieht die Sync-Statusbadge in der Abschluss-View.
    void uploadFahrzeugbericht(active, km);
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
                  <div className="input-row">
                    <input value="– – : – –" readOnly className="num" style={{ color: "var(--fg-3)" }} />
                    <div className="chev"><span style={{ fontSize: 12 }}>▾</span></div>
                  </div>
                </div>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label className="caption">Einsatzort</label>
                <input className="input filled" value={active.alarm.einsatzort} readOnly />
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
                <PersonButton label="Fahrer" person={active.fahrer} onOpen={() => setPickerOpen({ kind: "fahrer" })} />
                <PersonButton label="Fahrzeug-Kdt." person={active.kdt} onOpen={() => setPickerOpen({ kind: "kdt" })} />
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
        {APP_VERSION} · {APP_BUILD}
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
          // Wir zeigen einen kurzen Hinweis-Toast: der neue Einsatz erscheint
          // beim nächsten Backend-Poll (alle 30 s) auto-magisch als aktiver
          // Einsatz, die Auto-Open-Logik schaltet dann automatisch um.
          // Vibration als haptisches Feedback bei erfolgreichem Anlegen.
          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            // egal
          }
          // Loggen damit man im Tablet-DevTools sieht was passiert ist
          console.info("[neuer-einsatz] angelegt:", { einsatzId, typ });
        }}
      />

      {/* ─── Archiv (read-only) ─── */}
      <ArchivTabletModal open={archivOpen} onClose={() => setArchivOpen(false)} />
    </div>
  );
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
