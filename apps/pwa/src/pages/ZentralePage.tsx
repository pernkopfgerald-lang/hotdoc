import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clipboard,
  Clock,
  Download,
  FileText,
  Lock,
  Map as MapIcon,
  MapPin,
  Phone,
  Save,
  Siren,
  Smartphone,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { DemoBanner } from "../components/DemoBanner";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { FlorianMap, type FahrzeugPos } from "../components/FlorianMap";
import { HandoffBanner } from "../components/HandoffBanner";
import { HandoffModal } from "../components/HandoffModal";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { DEMO_ALARM } from "../data/demo-alarm";
import { apiCall, getTabletToken } from "../lib/api";
import { broadcastChronikEntry, fetchChronikDiff } from "../lib/chronik-sync";
import { useGeolocation } from "../lib/geo";
import {
  BETEILIGTE_STELLEN,
  FAHRZEUGE,
  SONSTIGE_FF,
  type BeteiligteStelle,
  type FahrzeugId,
  type SonstigeFF,
} from "@hotdoc/shared";

const HOME_POS = { lat: 48.0884, lng: 13.9586 };

interface FahrzeugberichtApiDoc {
  _id: string;
  fahrzeugId: string;
  mannschaft?: Array<{ slot: number; personId: number; atemschutzAktiv?: boolean }>;
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  oelbindemittelSaecke?: number;
  status?: "in_arbeit" | "abgeschlossen";
}

interface Props {
  onSwitchFahrzeug: (id: FahrzeugId) => void;
  onResetSetup: () => void;
  /** Single-Device-Logout nach erfolgreichem QR-Handoff. */
  onHandoffLogout: () => void;
}

interface EinsatzApiDoc {
  _id: string;
  einsatzort?: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  alarmId?: string;
  alarmierungZeit?: string;
  alarmierungAuthor?: string;
  alarmierungText?: string;
  koordinaten?: { lat: number; lng: number };
  status?: string;
  einsatzTyp?: string;
  schreibschutz?: boolean;
  pflichtbereich?: boolean;
  einsatzzoneEzell?: boolean;
  ueberOertlicheHilfe?: boolean;
  alarmiertDurch?: "BWST" | "LWZ";
  einsatzauftragVia?: "WAS" | "Funk" | "Telefon" | "Bote" | "Behoerde";
  anrufer?: string;
  anruferTel?: string;
  meldungEinsatzleitung?: string;
  beteiligteStellen?: BeteiligteStelle[];
  sonstigeAnwesendeFF?: { aktive?: SonstigeFF[]; sonstigeFreitext?: string };
  zeitmarken?: {
    lageUnterKontrolle?: string;
    brandAus?: string;
  };
  verrechnung?: { verrechenbar?: boolean; rechnungsadresse?: string };
  oelbindemittel?: { verwendet?: boolean; gesamtSaecke?: number };
}

/**
 * Editor-State der Florianstation. Spiegelt alle Felder die der Einsatzleiter
 * tippt — getrennt vom geladenen Backend-Doc, damit „dirty"-Detection und
 * Re-Load nicht in Konflikt geraten.
 */
interface EditorState {
  pflichtbereich: boolean | null;          // null = noch nicht entschieden
  einsatzzoneEzell: boolean | null;
  ueberOertlicheHilfe: boolean | null;
  alarmiertDurch: "BWST" | "LWZ" | null;
  einsatzauftragVia: "WAS" | "Funk" | "Telefon" | "Bote" | "Behoerde" | null;
  anrufer: string;
  anruferTel: string;
  lageUnterKontrolleHHMM: string;          // "HH:MM" — wird beim Save in ISO konvertiert
  brandAusHHMM: string;
  beteiligteStellen: BeteiligteStelle[];
  sonstigeAnwesendeFF: SonstigeFF[];
  sonstigeFreitext: string;
  meldungEinsatzleitung: string;
  verrechenbar: boolean;
  oelSaecke: number;
}

const EMPTY_EDITOR: EditorState = {
  pflichtbereich: null,
  einsatzzoneEzell: null,
  ueberOertlicheHilfe: null,
  alarmiertDurch: null,
  einsatzauftragVia: null,
  anrufer: "",
  anruferTel: "",
  lageUnterKontrolleHHMM: "",
  brandAusHHMM: "",
  beteiligteStellen: [],
  sonstigeAnwesendeFF: [],
  sonstigeFreitext: "",
  meldungEinsatzleitung: "",
  verrechenbar: false,
  oelSaecke: 0,
};

/**
 * Mock-Fleet-Generator für FlorianMap.
 *
 * Bis Phase 4 (SSE /api/positions/stream) kommt keine echte GPS-Position
 * vom Backend. Wir platzieren die Fahrzeuge dezent um Einsatzort bzw.
 * Feuerwehrhaus, damit die Karte nicht leer ist und der Einsatzleiter
 * eine Vorstellung der Lage bekommt.
 *
 * Florian Eberstalzell ist fix am Feuerwehrhaus (isZentrale=true →
 * niemals stale). TANK ist demonstrativ 14 min stale damit das
 * Offline-Symbol auf der Karte zu sehen ist.
 */
function buildFleetForFlorianMap(
  fahrzeugStatus: Array<{
    id: FahrzeugId;
    status: "wartend" | "im_einsatz" | "abgeschlossen";
  }>,
  einsatzKoord: { lat: number; lng: number } | null,
): FahrzeugPos[] {
  const E = einsatzKoord ?? HOME_POS;
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 14 * 60 * 1000).toISOString();

  // Offsets pro Fahrzeug — knapp um den Einsatzort wenn vorhanden, sonst
  // um das Feuerwehrhaus. Status kommt aus der echten Aggregation.
  const offsets: Record<FahrzeugId, { lat: number; lng: number; staleAt?: string }> = {
    kdo: { lat: E.lat - 0.0009, lng: E.lng + 0.0007 },
    "tlf-a-4000": { lat: E.lat + 0.0006, lng: E.lng - 0.0006, staleAt: stale },
    "lfa-b": { lat: HOME_POS.lat + 0.0003, lng: HOME_POS.lng + 0.0001 },
    mtf: { lat: HOME_POS.lat, lng: HOME_POS.lng - 0.0003 },
    zentrale: { lat: HOME_POS.lat, lng: HOME_POS.lng },
  };

  const fleet: FahrzeugPos[] = [];
  for (const fz of fahrzeugStatus) {
    const off = offsets[fz.id];
    if (!off) continue;
    const abk = shortCode(fz.id);
    const funkrufname = FAHRZEUGE[fz.id].funkrufname;
    fleet.push({
      fahrzeugId: fz.id,
      funkrufname,
      abk,
      lat: off.lat,
      lng: off.lng,
      status: fz.status,
      lastSeenAt: off.staleAt ?? now,
    });
  }
  // Florian Eberstalzell — immer am FF-Haus, niemals stale.
  fleet.push({
    fahrzeugId: "zentrale",
    funkrufname: FAHRZEUGE.zentrale.funkrufname,
    abk: "FLORIAN",
    lat: HOME_POS.lat,
    lng: HOME_POS.lng,
    status: "wartend",
    isZentrale: true,
  });
  return fleet;
}

function isoToHHMM(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function hhmmToIso(hhmm: string, refDateIso: string): string | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return undefined;
  const ref = new Date(refDateIso);
  if (Number.isNaN(ref.getTime())) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return undefined;
  const d = new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate(),
    h,
    min,
    0,
    0,
  );
  return d.toISOString();
}

/**
 * Florianstation / Einsatzzentrale — Hauptbericht-Layout (Anhang B des
 * Spec). Aggregiert Fahrzeugberichte aus dem Einsatz, zeigt Status
 * pro Fahrzeug und übernimmt die Übergabe an den Bearbeiter (PDF +
 * syBOS-Spickzettel).
 *
 * Vollständige Backend-Anbindung (Aggregation aus CouchDB-Views) kommt
 * in Phase 6 — aktuell sind die Werte aus dem Mock-Alarm-Demo.
 */
export function ZentralePage({ onSwitchFahrzeug, onResetSetup, onHandoffLogout }: Props) {
  const fahrzeug = FAHRZEUGE.zentrale;
  const geo = useGeolocation();
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
  const [aktiverEinsatz, setAktiverEinsatz] = useState<EinsatzApiDoc | null>(null);
  const [fahrzeugberichte, setFahrzeugberichte] = useState<FahrzeugberichtApiDoc[]>([]);
  const [personenMap, setPersonenMap] = useState<Map<number, string>>(new Map());
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "spick" | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editorDirty, setEditorDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const schreibschutz = aktiverEinsatz?.schreibschutz === true;

  // Helper für Editor-Mutation — markiert immer auch als „dirty" und
  // löscht den Save-OK-Hinweis falls noch sichtbar.
  function patchEditor(p: Partial<EditorState>) {
    setEditor((prev) => ({ ...prev, ...p }));
    setEditorDirty(true);
    setSaveOk(null);
  }

  // Aktive Einsätze vom Backend laden — der erste aktive wird die Quelle
  // für PDF/Spickzettel/Chronik-Sync. Refresht alle 30 s.
  // Während der User editiert (`editorDirty=true`) wird der Editor-State
  // NICHT überschrieben, sonst verliert er seine Tipparbeit zwischen den
  // Polls. Nur das Backend-Doc selbst wird aktualisiert.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiCall<{ items: EinsatzApiDoc[] }>(
          "/api/einsaetze?status=aktiv",
        );
        if (cancelled) return;
        const first = r.items[0];
        if (first) {
          setAktiverEinsatzId(first._id);
          setAktiverEinsatz(first);
        }
      } catch {
        // Backend nicht erreichbar — bleibt bei null, UI zeigt Demo-Fallback
      }
    };
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Fahrzeugberichte aller Fahrzeuge zum aktiven Einsatz pollen.
  // Refresht alle 15 s — schneller als der Einsatz-Poll, damit der
  // Einsatzleiter sieht wenn ein Tablet einen Bericht abschließt.
  useEffect(() => {
    if (!aktiverEinsatzId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiCall<{ items: FahrzeugberichtApiDoc[] }>(
          `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}/fahrzeugberichte`,
        );
        if (!cancelled) setFahrzeugberichte(r.items);
      } catch {
        // 404 oder 401 → bleibt leer, UI rendert "Wartend" für alle
      }
    };
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [aktiverEinsatzId]);

  // Personalliste einmalig laden — wird benötigt um aus den
  // `fahrzeugKdtPersonId`-IDs Klar-Namen für die Status-Liste zu machen.
  // Default-Cache: leer, dann fall back auf "Pers-ID 123".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiCall<{
          items: Array<{ syBosId: number; vorname?: string; nachname?: string }>;
        }>("/api/admin/personen");
        if (cancelled) return;
        const m = new Map<number, string>();
        for (const p of r.items) {
          const name = `${p.nachname ?? ""} ${p.vorname ?? ""}`.trim();
          if (name) m.set(p.syBosId, name);
        }
        setPersonenMap(m);
      } catch {
        // Endpoint vielleicht (noch) nicht vorhanden — ignorieren, UI zeigt IDs
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Editor-State aus geladenem Einsatz-Doc seeden — nur wenn nicht gerade
  // editiert wird, sonst werden Tippänderungen weggeworfen.
  useEffect(() => {
    if (!aktiverEinsatz) return;
    if (editorDirty) return;
    setEditor({
      pflichtbereich:
        typeof aktiverEinsatz.pflichtbereich === "boolean"
          ? aktiverEinsatz.pflichtbereich
          : null,
      einsatzzoneEzell:
        typeof aktiverEinsatz.einsatzzoneEzell === "boolean"
          ? aktiverEinsatz.einsatzzoneEzell
          : null,
      ueberOertlicheHilfe:
        typeof aktiverEinsatz.ueberOertlicheHilfe === "boolean"
          ? aktiverEinsatz.ueberOertlicheHilfe
          : null,
      alarmiertDurch: aktiverEinsatz.alarmiertDurch ?? null,
      einsatzauftragVia: aktiverEinsatz.einsatzauftragVia ?? null,
      anrufer: aktiverEinsatz.anrufer ?? "",
      anruferTel: aktiverEinsatz.anruferTel ?? "",
      lageUnterKontrolleHHMM: isoToHHMM(aktiverEinsatz.zeitmarken?.lageUnterKontrolle),
      brandAusHHMM: isoToHHMM(aktiverEinsatz.zeitmarken?.brandAus),
      beteiligteStellen: aktiverEinsatz.beteiligteStellen ?? [],
      sonstigeAnwesendeFF: aktiverEinsatz.sonstigeAnwesendeFF?.aktive ?? [],
      sonstigeFreitext: aktiverEinsatz.sonstigeAnwesendeFF?.sonstigeFreitext ?? "",
      meldungEinsatzleitung: aktiverEinsatz.meldungEinsatzleitung ?? "",
      verrechenbar: aktiverEinsatz.verrechnung?.verrechenbar ?? false,
      oelSaecke: aktiverEinsatz.oelbindemittel?.gesamtSaecke ?? 0,
    });
  }, [aktiverEinsatz, editorDirty]);

  async function saveEditor(): Promise<void> {
    if (!aktiverEinsatzId) {
      setSaveErr("Kein aktiver Einsatz ausgewählt — Speichern nicht möglich.");
      return;
    }
    if (schreibschutz) {
      setSaveErr("Bericht ist abgeschlossen (schreibgeschützt). Erst reaktivieren.");
      return;
    }
    setSaveBusy(true);
    setSaveErr(null);
    setSaveOk(null);
    try {
      const refIso = aktiverEinsatz?.alarmierungZeit ?? new Date().toISOString();
      const lage = hhmmToIso(editor.lageUnterKontrolleHHMM, refIso);
      const brand = hhmmToIso(editor.brandAusHHMM, refIso);

      const body: Record<string, unknown> = {
        beteiligteStellen: editor.beteiligteStellen,
        sonstigeAnwesendeFF: {
          aktive: editor.sonstigeAnwesendeFF,
          ...(editor.sonstigeFreitext.trim()
            ? { sonstigeFreitext: editor.sonstigeFreitext.trim() }
            : {}),
        },
        meldungEinsatzleitung: editor.meldungEinsatzleitung,
        zeitmarken: {
          ...(lage ? { lageUnterKontrolle: lage } : {}),
          ...(brand ? { brandAus: brand } : {}),
        },
        verrechnung: { verrechenbar: editor.verrechenbar },
        oelbindemittel: {
          verwendet: editor.oelSaecke > 0,
          gesamtSaecke: Math.max(0, Math.floor(editor.oelSaecke)),
        },
      };
      if (editor.pflichtbereich !== null) body.pflichtbereich = editor.pflichtbereich;
      if (editor.einsatzzoneEzell !== null) body.einsatzzoneEzell = editor.einsatzzoneEzell;
      if (editor.ueberOertlicheHilfe !== null)
        body.ueberOertlicheHilfe = editor.ueberOertlicheHilfe;
      if (editor.alarmiertDurch) body.alarmiertDurch = editor.alarmiertDurch;
      if (editor.einsatzauftragVia) body.einsatzauftragVia = editor.einsatzauftragVia;
      if (editor.anrufer.trim()) body.anrufer = editor.anrufer.trim();
      if (editor.anruferTel.trim()) body.anruferTel = editor.anruferTel.trim();

      await apiCall(`/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`, {
        method: "PUT",
        body,
      });
      setEditorDirty(false);
      setSaveOk(`Hauptbericht gespeichert · ${new Date().toLocaleTimeString("de-AT")}`);
      // Doc neu laden damit die Anzeige stimmt
      try {
        const reloaded = await apiCall<EinsatzApiDoc>(
          `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
        );
        setAktiverEinsatz(reloaded);
      } catch {
        // egal — der Save war erfolgreich, nächster Poll holt es
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErr(`Speichern fehlgeschlagen: ${msg}`);
    } finally {
      setSaveBusy(false);
    }
  }

  function toggleArrayItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  async function downloadPdf(einsatzId: string): Promise<void> {
    setDownloadBusy("pdf");
    setDownloadErr(null);
    try {
      const token = getTabletToken();
      const res = await fetch(`/api/einsaetze/${encodeURIComponent(einsatzId)}/pdf`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} — ${txt.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Tab öffnen statt direkt download — PDF-Viewer hat oft Druck-Button
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        // Pop-up blocked → klassischer Download
        const a = document.createElement("a");
        a.href = url;
        a.download = `einsatzbericht-${einsatzId.replace(/[^a-z0-9-]/gi, "_")}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setDownloadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function openSpickzettel(einsatzId: string): Promise<void> {
    setDownloadBusy("spick");
    setDownloadErr(null);
    try {
      const token = getTabletToken();
      const res = await fetch(`/api/einsaetze/${encodeURIComponent(einsatzId)}/spickzettel`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const win = window.open("", "_blank", "noopener,noreferrer");
      if (!win) {
        alert("Pop-up-Blocker — bitte für diese Seite erlauben.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      setDownloadErr(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloadBusy(null);
    }
  }

  /**
   * Fahrzeug-Status pro Wagen — abgeleitet aus den echten Fahrzeugbericht-
   * Docs des aktiven Einsatzes. Wenn kein Bericht existiert → "wartend".
   * Wenn Bericht existiert + status=abgeschlossen → grüner Haken.
   * Sonst → "im Einsatz".
   *
   * Mannschafts-Zahl = Slots besetzt + Fahrer + Kdt (falls eingetragen).
   * kdt-Name wird über personenMap aus syBosId aufgelöst (Fallback "—").
   */
  const FAHRZEUG_ORDER: FahrzeugId[] = ["kdo", "tlf-a-4000", "lfa-b", "mtf"];
  const fahrzeugStatus: {
    id: FahrzeugId;
    status: "wartend" | "im_einsatz" | "abgeschlossen";
    mannschaft: number;
    kdt?: string;
    asAktiv: number;
    oelSaecke: number;
  }[] = FAHRZEUG_ORDER.map((id) => {
    const bericht = fahrzeugberichte.find((b) => b.fahrzeugId === id);
    if (!bericht) {
      return { id, status: "wartend" as const, mannschaft: 0, asAktiv: 0, oelSaecke: 0 };
    }
    const mannschaftSlots = (bericht.mannschaft ?? []).filter(
      (m) => typeof m.personId === "number" && m.personId > 0,
    );
    const headcount =
      mannschaftSlots.length +
      (bericht.fahrerPersonId ? 1 : 0) +
      (bericht.fahrzeugKdtPersonId ? 1 : 0);
    const asAktiv = mannschaftSlots.filter((m) => m.atemschutzAktiv === true).length;
    const kdtId = bericht.fahrzeugKdtPersonId;
    const kdtName = kdtId ? (personenMap.get(kdtId) ?? `Pers-ID ${kdtId}`) : undefined;
    const status: "im_einsatz" | "abgeschlossen" =
      bericht.status === "abgeschlossen" ? "abgeschlossen" : "im_einsatz";
    return {
      id,
      status,
      mannschaft: headcount,
      ...(kdtName ? { kdt: kdtName } : {}),
      asAktiv,
      oelSaecke: bericht.oelbindemittelSaecke ?? 0,
    };
  });

  // Live-Daten des aktiven Einsatzes (aus Backend) — fallen auf DEMO_ALARM
  // zurück nur solange kein echter Einsatz geladen wurde. Sobald BlaulichtSMS
  // einen echten Alarm sendet, werden diese Felder ausgetauscht.
  const e = aktiverEinsatz;
  const einsatzId = e?._id?.replace(/^einsatz:/, "") ?? DEMO_ALARM.alarmId;
  const einsatzort = e?.einsatzort ?? DEMO_ALARM.einsatzort;
  const einsatzart =
    e?.einsatzart ?? e?.einsatzartFreitext ?? e?.alarmierungText ?? DEMO_ALARM.einsatzart;
  const alarmierungZeit = e?.alarmierungZeit ?? DEMO_ALARM.alarmierungZeit;
  const alarmierungAuthor = e?.alarmierungAuthor ?? DEMO_ALARM.alarmierungAuthor;
  const einsatzTyp: "alarm" | "manuell" = e?.einsatzTyp === "manuell" ? "manuell" : "alarm";

  const tabs: EinsatzTabSummary[] = [
    {
      id: einsatzId,
      einsatzart,
      einsatzort,
      status: "aktiv",
      manuell: einsatzTyp === "manuell",
    },
  ];

  const datum = new Date(alarmierungZeit);
  const datumStr = `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`;

  const aggregateMannschaft = fahrzeugStatus.reduce((sum, f) => sum + f.mannschaft, 0);
  const abgeschlossenCount = fahrzeugStatus.filter((f) => f.status === "abgeschlossen").length;
  const aktivCount = fahrzeugStatus.filter((f) => f.status === "im_einsatz").length;

  // AS-Trupps: Atemschutz-Personen in 2er-Trupps. Eine ungerade Anzahl wird
  // aufgerundet (sicherheitskritisch — fünfter AS heißt: ein dritter Trupp
  // ist in Vorbereitung, auch wenn der Partner noch fehlt).
  const asPersonenGesamt = fahrzeugStatus.reduce((sum, f) => sum + f.asAktiv, 0);
  const asTruppsGesamt = Math.ceil(asPersonenGesamt / 2);
  // Öl-Säcke gesamt: aus Fahrzeugberichten ODER manueller Override im
  // Einsatz-Doc (Florian-Editor). Wir nehmen den größeren Wert — damit
  // der Editor die Aggregation überschreiben kann, ohne sie zu unterbieten.
  const oelSummeFahrzeug = fahrzeugStatus.reduce((sum, f) => sum + f.oelSaecke, 0);
  const oelSaeckeGesamt = Math.max(oelSummeFahrzeug, aktiverEinsatz?.oelbindemittel?.gesamtSaecke ?? 0);

  // Globale Einsatzchronik — wird aus dem CouchDB-Einsatz-Doc gepollt,
  // identischer Cross-Sync wie auf den Tablets. Anfangs Demo-Einträge
  // damit die UI nicht leer ist; sobald echte Daten via Sync kommen,
  // werden sie zusätzlich gemerged.
  const [chronik, setChronik] = useState<ChronikEintrag[]>([
    {
      id: "z1-demo",
      zeitstempel: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      funkrufname: "BlaulichtSMS",
      source: "blaulichtsms",
      text: "Alarmierung · Brand KFZ · Eberstalzeller Straße 5",
    },
  ]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const id = aktiverEinsatzId ?? `einsatz:${einsatzId}`;
      const knownIds = new Set(chronik.map((c) => c.id));
      const neue = await fetchChronikDiff(id, knownIds);
      if (cancelled || neue.length === 0) return;
      setChronik((prev) => {
        const own = new Set(prev.map((c) => c.id));
        const toAdd = neue.filter((n) => !own.has(n.id));
        if (toAdd.length === 0) return prev;
        return [...prev, ...toAdd].sort(
          (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
        );
      });
    };
    void tick();
    const t = setInterval(() => void tick(), 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiverEinsatzId]);

  return (
    <div>
      <Topbar funkrufname={fahrzeug.funkrufname} einsatzNr={einsatzId} geo={geo} />

      <EinsatzTabs tabs={tabs} activeId={einsatzId} onSelect={() => {}} onNew={() => {}} />

      <DemoBanner />
      <HandoffBanner onReleased={onHandoffLogout} />

      <main className="page">
        {/* Hauptbericht-Header */}
        <section
          className="alarm"
          style={{
            background:
              "linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 55%, #DBEAFE 100%)",
            borderColor: "rgba(37,99,235,0.25)",
          }}
        >
          <div className="alarm-top">
            <div className="alarm-left">
              <div className="alarm-icon" style={{ background: "var(--info)" }}>
                <Activity size={30} color="#fff" strokeWidth={2} />
              </div>
              <div>
                <div className="alarm-tags">
                  <span className="alarm-tag" style={{ color: "var(--info)" }}>
                    <span
                      className="dot"
                      style={{ background: "var(--info)" }}
                    />
                    Einsatzzentrale
                  </span>
                  <span className="alarm-tag muted">· Florian Eberstalzell · Hauptbericht</span>
                </div>
                <div className="alarm-title">{einsatzart}</div>
                <div className="alarm-addr">
                  <MapPin size={16} />
                  {einsatzort}
                </div>
              </div>
            </div>
            <div className="alarm-no">#{einsatzId}</div>
          </div>

          <div className="alarm-meta">
            <div className="cell">
              <div className="lbl">Alarmiert</div>
              <div className="val">{formatTime(alarmierungZeit)}</div>
            </div>
            <div className="cell">
              <div className="lbl">Fahrzeuge aktiv</div>
              <div className="val">
                {aktivCount}
                <span className="unit">/ {fahrzeugStatus.length}</span>
              </div>
            </div>
            <div className="cell">
              <div className="lbl">Mannschaft</div>
              <div className="val">
                {aggregateMannschaft}
                <span className="unit">Pers.</span>
              </div>
            </div>
            <div className="cell">
              <div className="lbl">Berichte</div>
              <div className="val">
                {abgeschlossenCount}
                <span className="unit">/ {fahrzeugStatus.length} fertig</span>
              </div>
            </div>
          </div>
        </section>

        <SectionHead title="Einsatzdaten" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Calendar size={20} />
              Stammdaten Einsatz
            </div>
            <span className="card-meta">
              {schreibschutz ? (
                <span style={{ color: "var(--warn)", fontWeight: 700 }}>
                  <Lock size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                  Schreibgeschützt
                </span>
              ) : (
                <>Auto-Übernahme aus BlaulichtSMS · Florian editiert</>
              )}
            </span>
          </div>
          <div className="grid-3" style={{ gap: 14 }}>
            <ReadOnly label="Datum" value={datumStr} />
            <ReadOnly label="Alarmiert" value={formatTime(alarmierungZeit)} />
            <ReadOnly label="Auslöser" value={alarmierungAuthor} />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label className="caption">Einsatzort</label>
            <input className="input filled" value={einsatzort} readOnly />
          </div>

          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px dashed var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 18,
            }}
          >
            <TriToggle
              label="Pflichtbereich"
              value={editor.pflichtbereich}
              disabled={schreibschutz}
              onChange={(v) => patchEditor({ pflichtbereich: v })}
            />
            <TriToggle
              label="Einsatzzone FF Eberstalzell"
              value={editor.einsatzzoneEzell}
              disabled={schreibschutz}
              onChange={(v) => patchEditor({ einsatzzoneEzell: v })}
            />
            <TriToggle
              label="Überörtliche Hilfe"
              value={editor.ueberOertlicheHilfe}
              disabled={schreibschutz}
              onChange={(v) => patchEditor({ ueberOertlicheHilfe: v })}
            />
            <div className="field">
              <label className="caption">Alarmiert durch</label>
              <div style={{ display: "flex", gap: 18, paddingTop: 6 }}>
                {(["BWST", "LWZ"] as const).map((opt) => (
                  <label
                    key={opt}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 14,
                      cursor: schreibschutz ? "not-allowed" : "pointer",
                      opacity: schreibschutz ? 0.55 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="alarmiertDurch"
                      value={opt}
                      disabled={schreibschutz}
                      checked={editor.alarmiertDurch === opt}
                      onChange={() => patchEditor({ alarmiertDurch: opt })}
                      style={{ accentColor: "var(--red)" }}
                    />
                    {opt}
                  </label>
                ))}
                {editor.alarmiertDurch ? (
                  <button
                    type="button"
                    onClick={() => patchEditor({ alarmiertDurch: null })}
                    disabled={schreibschutz}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--fg-3)",
                      fontSize: 11,
                      cursor: schreibschutz ? "not-allowed" : "pointer",
                      textDecoration: "underline",
                      minHeight: 0,
                      padding: 0,
                    }}
                  >
                    löschen
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <SectionHead title="Einsatzauftrag" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Phone size={20} />
              Auftragsweg &amp; Anrufer
            </div>
            <span className="card-meta">Wie kam der Auftrag · Wer hat angerufen</span>
          </div>
          <div className="grid-3" style={{ gap: 14 }}>
            <div className="field">
              <label className="caption">Auftrag über</label>
              <select
                className="input"
                disabled={schreibschutz}
                value={editor.einsatzauftragVia ?? ""}
                onChange={(e) =>
                  patchEditor({
                    einsatzauftragVia: (e.target.value || null) as EditorState["einsatzauftragVia"],
                  })
                }
              >
                <option value="">—</option>
                <option value="WAS">WAS (Warn- &amp; Alarmsystem)</option>
                <option value="Funk">Funk</option>
                <option value="Telefon">Telefon</option>
                <option value="Bote">Bote</option>
                <option value="Behoerde">Behörde</option>
              </select>
            </div>
            <div className="field">
              <label className="caption">Anrufer / Meldender</label>
              <input
                type="text"
                className="input"
                placeholder="Name oder Funktion"
                disabled={schreibschutz}
                value={editor.anrufer}
                onChange={(e) => patchEditor({ anrufer: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="caption">Telefon Anrufer</label>
              <input
                type="tel"
                className="input num"
                placeholder="+43 …"
                disabled={schreibschutz}
                value={editor.anruferTel}
                onChange={(e) => patchEditor({ anruferTel: e.target.value })}
              />
            </div>
          </div>
        </section>

        <SectionHead title="Zeitmarken" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Clock size={20} />
              Lage unter Kontrolle · Brand aus
            </div>
            <span className="card-meta">
              {alarmierungZeit
                ? `Basis-Datum ${datumStr}`
                : "kein Datum"}
            </span>
          </div>
          <div className="grid-3" style={{ gap: 14 }}>
            <div className="field">
              <label className="caption">Lage unter Kontrolle</label>
              <input
                type="time"
                className="input"
                value={editor.lageUnterKontrolleHHMM}
                disabled={schreibschutz}
                onChange={(e) =>
                  patchEditor({ lageUnterKontrolleHHMM: e.target.value })
                }
              />
            </div>
            <div className="field">
              <label className="caption">Brand aus</label>
              <input
                type="time"
                className="input"
                value={editor.brandAusHHMM}
                disabled={schreibschutz}
                onChange={(e) => patchEditor({ brandAusHHMM: e.target.value })}
              />
            </div>
            <div className="field">
              <label className="caption">Verrechenbar</label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingTop: 12,
                  fontSize: 14,
                  cursor: schreibschutz ? "not-allowed" : "pointer",
                  opacity: schreibschutz ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={editor.verrechenbar}
                  disabled={schreibschutz}
                  onChange={(e) => patchEditor({ verrechenbar: e.target.checked })}
                  style={{ accentColor: "var(--info)" }}
                />
                Einsatz ist verrechenbar
              </label>
            </div>
          </div>
        </section>

        <SectionHead title="Beteiligte Stellen & Sonstige FF" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Siren size={20} />
              Auf der Einsatzstelle anwesend
            </div>
            <span className="card-meta">
              {editor.beteiligteStellen.length + editor.sonstigeAnwesendeFF.length} markiert
            </span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: 8,
              }}
            >
              Beteiligte Stellen
            </div>
            <div className="chips">
              {BETEILIGTE_STELLEN.map((s) => {
                const on = editor.beteiligteStellen.includes(s);
                return (
                  <label
                    key={s}
                    className={`chip${on ? " filled" : ""}`}
                    style={schreibschutz ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={schreibschutz}
                      onChange={() =>
                        patchEditor({
                          beteiligteStellen: toggleArrayItem(editor.beteiligteStellen, s),
                        })
                      }
                      style={{ accentColor: "var(--info)", margin: 0 }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: 8,
              }}
            >
              Sonstige anwesende Feuerwehren
            </div>
            <div className="chips">
              {SONSTIGE_FF.map((s) => {
                const on = editor.sonstigeAnwesendeFF.includes(s);
                return (
                  <label
                    key={s}
                    className={`chip${on ? " filled" : ""}`}
                    style={schreibschutz ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={schreibschutz}
                      onChange={() =>
                        patchEditor({
                          sonstigeAnwesendeFF: toggleArrayItem(editor.sonstigeAnwesendeFF, s),
                        })
                      }
                      style={{ accentColor: "var(--info)", margin: 0 }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label className="caption">Sonstige (Freitext)</label>
            <input
              className="input"
              placeholder="z. B. ÖAMTC, Bundesheer, …"
              value={editor.sonstigeFreitext}
              disabled={schreibschutz}
              onChange={(e) => patchEditor({ sonstigeFreitext: e.target.value })}
            />
          </div>
        </section>

        <SectionHead title="Ölbindemittel" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">Verbrauch · Aggregation</div>
            <span className="card-meta">aus Fahrzeugberichten + manueller Override</span>
          </div>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <div className="field" style={{ flex: "0 0 200px" }}>
              <label className="caption">Gesamt Säcke</label>
              <input
                type="number"
                min={0}
                step={1}
                className="input num"
                value={editor.oelSaecke}
                disabled={schreibschutz}
                onChange={(e) =>
                  patchEditor({
                    oelSaecke: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  })
                }
              />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)", flex: 1 }}>
              Aktuell <strong>{editor.oelSaecke}</strong> Säcke ausgewiesen.
              Beim PDF-Export erscheint die Markierung „Ölbindemittel verwendet" automatisch
              wenn die Anzahl &gt; 0 ist.
            </p>
          </div>
        </section>

        <SectionHead title="Meldung von der Einsatzleitung" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <FileText size={20} />
              Freitext Einsatzleiter
            </div>
            <span className="card-meta">
              {editor.meldungEinsatzleitung.length} / 4000 Zeichen
            </span>
          </div>
          <textarea
            className="input"
            rows={6}
            maxLength={4000}
            placeholder="Beobachtungen, Lagebild, Übergabe an Polizei/RK, Nachalarmierungen, Auffälligkeiten…"
            value={editor.meldungEinsatzleitung}
            disabled={schreibschutz}
            onChange={(e) => patchEditor({ meldungEinsatzleitung: e.target.value })}
            style={{ resize: "vertical", fontSize: 14, lineHeight: 1.5 }}
          />
        </section>

        <section
          style={{
            position: "sticky",
            bottom: 12,
            zIndex: 30,
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: "12px 16px",
            margin: "8px 16px 0",
            borderRadius: 14,
            background: editorDirty
              ? "color-mix(in srgb, var(--warn-tint) 65%, var(--surface))"
              : "var(--surface)",
            border: `1px solid ${editorDirty ? "var(--amber-border)" : "var(--border)"}`,
            boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {saveErr ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--red)",
                  fontSize: 13,
                }}
              >
                <AlertTriangle size={14} /> {saveErr}
              </div>
            ) : saveOk ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--ok)",
                  fontSize: 13,
                }}
              >
                <CheckCircle2 size={14} /> {saveOk}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--fg-3)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {schreibschutz
                  ? "Bericht abgeschlossen · Reaktivierung erforderlich"
                  : editorDirty
                    ? "Ungespeicherte Änderungen am Hauptbericht"
                    : "Hauptbericht synchron mit Backend"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void saveEditor()}
            disabled={!editorDirty || saveBusy || !aktiverEinsatzId || schreibschutz}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 10,
              border: 0,
              background:
                !editorDirty || saveBusy || !aktiverEinsatzId || schreibschutz
                  ? "var(--surface-2)"
                  : "linear-gradient(180deg, var(--info) 0%, color-mix(in srgb, var(--info) 70%, #000) 100%)",
              color:
                !editorDirty || saveBusy || !aktiverEinsatzId || schreibschutz
                  ? "var(--fg-3)"
                  : "#fff",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.04em",
              cursor:
                !editorDirty || saveBusy || !aktiverEinsatzId || schreibschutz
                  ? "not-allowed"
                  : "pointer",
              boxShadow:
                !editorDirty || saveBusy || !aktiverEinsatzId || schreibschutz
                  ? "none"
                  : "0 4px 12px rgba(37,99,235,0.32)",
            }}
          >
            <Save size={15} />
            {saveBusy ? "Speichere …" : "Hauptbericht speichern"}
          </button>
        </section>

        <SectionHead title="Fahrzeuge im Einsatz" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Truck size={20} />
              Status pro Fahrzeug
            </div>
            <span className="card-meta">
              <span className="num">{aktivCount}</span> im Einsatz · <span className="num">{abgeschlossenCount}</span> abgeschlossen
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fahrzeugStatus.map((f) => {
              const fz = FAHRZEUGE[f.id];
              const badge =
                f.status === "abgeschlossen"
                  ? { cls: "ok", label: "Abgeschlossen", Icon: CheckCircle2 }
                  : f.status === "im_einsatz"
                    ? { cls: "warn", label: "Im Einsatz", Icon: Activity }
                    : { cls: "neutral", label: "Wartend", Icon: Lock };
              const Icon = badge.Icon;
              return (
                <div key={f.id} className="crew-row filled">
                  <div className="crew-num" style={{ width: 64, fontFamily: "var(--font-mono)" }}>
                    {shortCode(f.id)}
                  </div>
                  <div className="crew-name" style={{ flex: "0 1 auto" }}>
                    {fz.funkrufname}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--fg-3)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontWeight: 600,
                      marginLeft: 12,
                    }}
                  >
                    {f.kdt ?? "—"} · {f.mannschaft} Pers.
                  </div>
                  <div className="crew-meta" style={{ marginLeft: "auto" }}>
                    <span className={`badge ${badge.cls}`} style={{ gap: 4 }}>
                      <Icon size={11} />
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <SectionHead title="Karte · Live-Positionen" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <MapIcon size={20} />
              Lagekarte
            </div>
            <span className="card-meta">
              {aktiverEinsatz?.koordinaten ? "Auto-Center auf Einsatzort" : "Standort Eberstalzell"}
            </span>
          </div>
          <FlorianMap
            {...(aktiverEinsatz?.koordinaten
              ? {
                  einsatzort: {
                    lat: aktiverEinsatz.koordinaten.lat,
                    lng: aktiverEinsatz.koordinaten.lng,
                    label: einsatzort,
                  },
                }
              : {})}
            fahrzeuge={buildFleetForFlorianMap(
              fahrzeugStatus,
              aktiverEinsatz?.koordinaten ?? null,
            )}
            zoom={aktiverEinsatz?.koordinaten ? 16 : 14}
          />
          <p
            style={{
              marginTop: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            Live-Position-Sharing via SSE folgt mit Phase 4 — aktuell mock-positionen um den
            Einsatzort und das Feuerwehrhaus.
          </p>
        </section>

        <SectionHead title="Zusammenfassung Mannschaft" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Users size={20} />
              Gesamtaufstellung
            </div>
            <span className="card-meta">
              <span className="num">{aggregateMannschaft}</span> Personen im Einsatz
            </span>
          </div>
          <div className="grid-3" style={{ gap: 12 }}>
            <Stat label="Aktive Mannschaft" value={String(aggregateMannschaft)} unit="Pers." />
            <Stat
              label="Atemschutz aktiv"
              value={String(asTruppsGesamt)}
              unit={asTruppsGesamt === 1 ? "Trupp" : "Trupps"}
              tone="as"
            />
            <Stat label="Öl Säcke" value={String(oelSaeckeGesamt)} unit="Sack" tone="warn" />
          </div>
        </section>

        <SectionHead title="Globale Einsatzchronik" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Clipboard size={20} />
              Chronologie aller Fahrzeuge
            </div>
            <span className="card-meta">
              {aktiverEinsatzId ? "Live aus Replikation" : "kein aktiver Einsatz"}
            </span>
          </div>
          <ChronikTimeline eintraege={chronik} />
          <FlorianChronikInput
            einsatzId={aktiverEinsatzId}
            onAdded={(eintrag) =>
              setChronik((prev) =>
                [...prev, eintrag].sort(
                  (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
                ),
              )
            }
          />
        </section>

        <SectionHead title="Übergabe an Bearbeiter" />
        <div className="cta-wrap">
          {downloadErr ? (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 13,
                border: "1px solid var(--red-border)",
              }}
            >
              {downloadErr}
            </div>
          ) : null}
          <div className="cta-secondary">
            <button
              type="button"
              onClick={() => aktiverEinsatzId && void downloadPdf(aktiverEinsatzId)}
              disabled={!aktiverEinsatzId || downloadBusy !== null}
            >
              <Download size={16} />
              {downloadBusy === "pdf" ? "Lade …" : "PDF-Bericht"}
            </button>
            <button
              type="button"
              onClick={() => aktiverEinsatzId && void openSpickzettel(aktiverEinsatzId)}
              disabled={!aktiverEinsatzId || downloadBusy !== null}
            >
              <FileText size={16} />
              {downloadBusy === "spick" ? "Lade …" : "syBOS-Spickzettel"}
            </button>
          </div>
          <button
            type="button"
            className="cta"
            disabled={abgeschlossenCount < fahrzeugStatus.length}
            style={
              abgeschlossenCount < fahrzeugStatus.length
                ? { opacity: 0.55, cursor: "not-allowed" }
                : undefined
            }
          >
            <CheckCircle2 size={22} />
            Einsatz abschließen &amp; archivieren
            <ArrowRight size={22} />
          </button>
          <div className="cta-hint">
            {abgeschlossenCount < fahrzeugStatus.length ? (
              <>
                <strong>{fahrzeugStatus.length - abgeschlossenCount}</strong> Fahrzeugberichte
                fehlen noch — Abschluss erst nach Eingang aller Berichte möglich.
              </>
            ) : (
              <>Alle Fahrzeugberichte vollständig — bereit zur Übergabe.</>
            )}
          </div>
        </div>
      </main>

      <div className="appfoot">
        HotDoc
        <span className="sep">·</span>
        v0.7 UC2
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
      </div>

      <HandoffModal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        {...(aktiverEinsatzId ? { einsatzId: aktiverEinsatzId } : {})}
        onClaimed={() => {
          setHandoffOpen(false);
          onHandoffLogout();
        }}
      />

      <VehicleSwitcherModal
        open={vehicleSwitcherOpen}
        current="zentrale"
        onSelect={(id) => {
          setVehicleSwitcherOpen(false);
          onSwitchFahrzeug(id);
        }}
        onClose={() => setVehicleSwitcherOpen(false)}
      />
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <label className="caption">{label}</label>
      <div className="input-row filled">
        <input value={value} readOnly />
      </div>
    </div>
  );
}

/**
 * Drei-Zustand-Schalter (JA / NEIN / unbestimmt) — abgebildet als zwei
 * Radio-Buttons mit „Löschen"-Link. Der unbestimmte Zustand bedeutet
 * „im Papier-Bericht leer", entspricht null im JSON-Doc.
 */
function TriToggle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean | null;
  disabled?: boolean;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="field">
      <label className="caption">{label}</label>
      <div
        style={{
          display: "flex",
          gap: 14,
          paddingTop: 6,
          alignItems: "center",
          opacity: disabled ? 0.55 : 1,
        }}
      >
        {(["JA", "NEIN"] as const).map((opt) => {
          const checked = opt === "JA" ? value === true : value === false;
          return (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              <input
                type="radio"
                disabled={disabled}
                checked={checked}
                onChange={() => onChange(opt === "JA")}
                style={{ accentColor: opt === "JA" ? "var(--ok)" : "var(--red)" }}
              />
              {opt}
            </label>
          );
        })}
        {value !== null ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--fg-3)",
              fontSize: 11,
              cursor: disabled ? "not-allowed" : "pointer",
              textDecoration: "underline",
              minHeight: 0,
              padding: 0,
            }}
          >
            löschen
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "as" | "warn";
}) {
  const bg = tone === "as" ? "var(--as-tint)" : tone === "warn" ? "var(--warn-tint)" : "var(--surface-2)";
  const fg = tone === "as" ? "var(--as)" : tone === "warn" ? "var(--warn)" : "var(--fg-3)";
  const valFg = tone === "as" ? "var(--as)" : tone === "warn" ? "var(--warn)" : "var(--fg)";
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: bg,
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: fg,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: valFg,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {unit ? (
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-2)", marginLeft: 4 }}>
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Florianstation-Chronik-Input.
 *
 * Erlaubt der Einsatzzentrale eigene Chronik-Einträge direkt zu erfassen
 * (z. B. "Nachalarmierung Bezirk angefordert", "Krankentransport
 * nachgefordert"). Der Eintrag wird sofort lokal gerendert UND an alle
 * Fahrzeug-Tablets gebroadcastet via /api/einsaetze/:id/chronik.
 *
 * Die Florianstation diktiert nicht — Eingabe per Tastatur (das PC-
 * Tablet hat keinen Mikrofon-Workflow, FR-17).
 */
function FlorianChronikInput({
  einsatzId,
  onAdded,
}: {
  einsatzId: string | null;
  onAdded: (entry: ChronikEintrag) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (!einsatzId) {
      setErr("Kein aktiver Einsatz — kann Chronik-Eintrag nicht zuordnen.");
      return;
    }
    setBusy(true);
    setErr(null);
    const id = `florian-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const zeitstempel = new Date().toISOString();
    const entry: ChronikEintrag = {
      id,
      zeitstempel,
      funkrufname: "Florian Eberstalzell",
      source: "manuell",
      text: cleaned,
    };
    onAdded(entry); // optimistic
    setText("");
    setBusy(false);
    await broadcastChronikEntry(einsatzId, {
      id,
      zeitstempel,
      funkrufname: "Florian Eberstalzell",
      fahrzeugId: "zentrale",
      source: "manuell",
      text: cleaned,
    });
  }

  return (
    <div style={{ marginTop: 14 }}>
      {err ? (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 12px",
            borderRadius: 8,
            background: "var(--red-tint)",
            color: "var(--red)",
            fontSize: 12,
            border: "1px solid var(--red-border)",
          }}
        >
          {err}
        </div>
      ) : null}
      <div className="freeform">
        <input
          className="input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder="Florianstation-Eintrag · z. B. Nachalarmierung BFKDT angefordert …"
          disabled={!einsatzId}
        />
        <button
          type="button"
          className="add-btn"
          onClick={() => void submit()}
          disabled={busy || !text.trim() || !einsatzId}
          aria-label="Chronik-Eintrag hinzufügen"
        >
          +
        </button>
      </div>
      <p
        style={{
          marginTop: 8,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--fg-3)",
          letterSpacing: "0.06em",
        }}
      >
        Eintrag erscheint binnen 8 s in der Chronik aller Fahrzeug-Tablets.
      </p>
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

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
