import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clipboard,
  Clock,
  Download,

  GraduationCap,
  Lock,
  Map as MapIcon,
  MapPin,
  Phone,
  Siren,
  Smartphone,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { APP_BUILD, APP_VERSION } from "../version";
import { AboutModal } from "../components/AboutModal";
import { ChronikTimeline, type ChronikEintrag } from "../components/ChronikTimeline";
import { ArchivTabletModal } from "../components/ArchivTabletModal";
import { CloseTabConfirmModal } from "../components/CloseTabConfirmModal";
import { StatusBanner } from "../components/StatusBanner";
import { EinsatzTabs, type EinsatzTabSummary } from "../components/EinsatzTabs";
import { NeuerEinsatzTabletModal, type EinsatzTyp } from "../components/NeuerEinsatzTabletModal";
import { FlorianMap, type FahrzeugPos } from "../components/FlorianMap";
import { FxToggle } from "../components/FxToggle";
import { HandoffBanner } from "../components/HandoffBanner";
import { HandoffModal } from "../components/HandoffModal";
import { PersonPickerModal, type PickPerson } from "../components/PersonPickerModal";
import { Topbar } from "../components/Topbar";
import { VehicleSwitcherModal } from "../components/VehicleSwitcherModal";
import { apiCall, getTabletToken } from "../lib/api";
import { broadcastChronikEntry, fetchChronikDiff } from "../lib/chronik-sync";
import { useGeolocation } from "../lib/geo";
import {
  BETEILIGTE_STELLEN as DEFAULT_BETEILIGTE_STELLEN,
  FAHRZEUGE,
  FLORIAN_POSITION,
  SONSTIGE_FF as DEFAULT_SONSTIGE_FF,
  type FahrzeugId,
} from "@hotdoc/shared";

const HOME_POS = FLORIAN_POSITION;

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
  beteiligteStellen?: string[];
  sonstigeAnwesendeFF?: { aktive?: string[]; sonstigeFreitext?: string };
  zeitmarken?: {
    lageUnterKontrolle?: string;
    brandAus?: string;
  };
  verrechnung?: { verrechenbar?: boolean; rechnungsadresse?: string };
  oelbindemittel?: { verwendet?: boolean; gesamtSaecke?: number };
  einsatzleiterPersonId?: number;
  bearbeiterPersonId?: number;
  reservePersonIds?: number[];
  zugewieseneFahrzeuge?: Array<"kdo" | "tlf-a-4000" | "lfa-b" | "mtf">;
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
  // String-Listen (vorher Enum-Typen) — die Auswahl im Backoffice gewachsen.
  beteiligteStellen: string[];
  sonstigeAnwesendeFF: string[];
  sonstigeFreitext: string;
  meldungEinsatzleitung: string;
  verrechenbar: boolean;
  oelSaecke: number;
  /** syBOS-Person-ID des Sachbearbeiters in der Florianstation. */
  bearbeiterPersonId: number | null;
  /** syBOS-Person-IDs der Reserve-Mannschaft (zur Verfügung gestanden, nicht ausgerückt). */
  reservePersonIds: number[];
  /** Florianstation-Disposition: welche Fahrzeuge bearbeiten diesen Einsatz?
   *  Leer → alle Fahrzeuge-Tablets sehen den Einsatz (Default bei BlaulichtSMS-Alarm). */
  zugewieseneFahrzeuge: Array<"kdo" | "tlf-a-4000" | "lfa-b" | "mtf">;
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
  bearbeiterPersonId: null,
  reservePersonIds: [],
  zugewieseneFahrzeuge: [],
};

/**
 * Echte Fleet-Liste für die FlorianMap aus den Live-Pings (alle 3 s vom
 * Tablet via POST /api/positions). Der Status (wartend / im_einsatz /
 * abgeschlossen) kommt aus den Fahrzeugberichten (siehe fahrzeugStatus-
 * Aggregation oben). Fahrzeuge ohne Ping erscheinen nicht auf der Karte.
 * Florian Eberstalzell wird fix am Feuerwehrhaus dazugesetzt.
 */
function buildFleetForFlorianMap(
  positions: Array<{ fahrzeugId: FahrzeugId; lat: number; lng: number; ts: string }>,
  fahrzeugStatus: Array<{
    id: FahrzeugId;
    status: "wartend" | "im_einsatz" | "abgeschlossen";
  }>,
): FahrzeugPos[] {
  const statusById = new Map(fahrzeugStatus.map((f) => [f.id, f.status]));
  const fleet: FahrzeugPos[] = positions.map((p) => ({
    fahrzeugId: p.fahrzeugId,
    funkrufname: FAHRZEUGE[p.fahrzeugId].funkrufname,
    abk: shortCode(p.fahrzeugId),
    lat: p.lat,
    lng: p.lng,
    status: statusById.get(p.fahrzeugId) ?? "wartend",
    lastSeenAt: p.ts,
  }));
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
 * syBOS-Spickzettel). Werte werden live aus CouchDB aggregiert
 * (Mannschaft, AS-Trupps, Öl, Fahrzeug-Status, GPS-Positionen).
 */
export function ZentralePage({ onSwitchFahrzeug, onResetSetup, onHandoffLogout }: Props) {
  const fahrzeug = FAHRZEUGE.zentrale;
  const geo = useGeolocation();
  const [vehicleSwitcherOpen, setVehicleSwitcherOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [aktiveEinsaetze, setAktiveEinsaetze] = useState<EinsatzApiDoc[]>([]);
  const [aktiverEinsatzId, setAktiverEinsatzId] = useState<string | null>(null);
  /** Tab-Schließen-Dialog: welcher Auftrag wird via X-Klick geschlossen? */
  const [tabToClose, setTabToClose] = useState<{
    id: string;
    label: string;
  } | null>(null);
  /**
   * Gerade-eben-angelegte Einsatz-ID — schuetzt davor dass der naechste
   * Polling-Tick die ID auf items[0] zuruecksetzt waehrend der Backend
   * den neuen Einsatz noch nicht in der aktiv-Liste hat (kann bis ~10 s
   * dauern). Wird nach 30 s wieder geloescht.
   */
  const justCreatedRef = useRef<{ id: string; ts: number } | null>(null);
  /**
   * Forciertes Reload der aktiven Einsatz-Liste — wird nach onCreated
   * aufgerufen damit der neue Einsatz sofort in `aktiveEinsaetze`
   * landet und der `aktiverEinsatz`-Find ihn findet. Sonst wartet der
   * User bis zu 30 s (Polling-Intervall) bis der Editor was anzeigt.
   * Wird im useEffect bei Mount initialisiert.
   */
  const reloadAktiveEinsaetzeRef = useRef<() => void>(() => undefined);
  const aktiverEinsatz: EinsatzApiDoc | null =
    aktiveEinsaetze.find((e) => e._id === aktiverEinsatzId) ?? null;
  const [fahrzeugberichte, setFahrzeugberichte] = useState<FahrzeugberichtApiDoc[]>([]);
  /**
   * Wenn der Funktionaer auf eine Status-Card klickt, markiert das den
   * Fahrzeug-Marker auf der FlorianMap mit dem Pulse-Ring + oeffnet das
   * Detail-Panel + klappt unter der Status-Card die Mannschafts-Details auf.
   * Null = nichts ausgewaehlt (Default).
   */
  const [selectedFahrzeugId, setSelectedFahrzeugId] = useState<FahrzeugId | null>(null);
  /** Live-Pings der Fahrzeuge aus /api/positions (alle 3 s). Zentrale fehlt
   *  hier absichtlich — die ist am Feuerwehrhaus, nicht im Einsatz. */
  const [positions, setPositions] = useState<
    Array<{ fahrzeugId: FahrzeugId; lat: number; lng: number; ts: string }>
  >([]);
  const [personen, setPersonen] = useState<PickPerson[]>([]);
  // Dynamische Listen aus /api/config/beteiligte-stellen + sonstige-ff.
  // Fallback auf Shared-Defaults wenn das Backend noch nichts hat. Die Listen
  // werden im Backoffice gepflegt — der Funktionaer kann Stellen hinzufuegen
  // ohne ein PWA-Deploy zu brauchen.
  const [beteiligteStellenAll, setBeteiligteStellenAll] = useState<string[]>(
    () => [...DEFAULT_BETEILIGTE_STELLEN],
  );
  const [sonstigeFfAll, setSonstigeFfAll] = useState<string[]>(
    () => [...DEFAULT_SONSTIGE_FF],
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r1 = await apiCall<{ data?: { items?: string[] } }>(
          "/api/config/beteiligte-stellen",
        );
        if (!cancelled && Array.isArray(r1.data?.items)) {
          setBeteiligteStellenAll(r1.data!.items.map(String));
        }
      } catch {
        // Default-Liste bleibt aktiv.
      }
      try {
        const r2 = await apiCall<{ data?: { items?: string[] } }>(
          "/api/config/sonstige-ff",
        );
        if (!cancelled && Array.isArray(r2.data?.items)) {
          setSonstigeFfAll(r2.data!.items.map(String));
        }
      } catch {
        // Default-Liste bleibt aktiv.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const personenMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of personen) {
      const name = `${p.nachname ?? ""} ${p.vorname ?? ""}`.trim();
      if (name) m.set(p.syBosId, name);
    }
    return m;
  }, [personen]);
  /** Welcher Picker ist gerade offen — null = keiner, "bearbeiter" oder "reserve". */
  const [personPickerOpen, setPersonPickerOpen] = useState<null | "bearbeiter" | "reserve">(null);
  const [downloadBusy, setDownloadBusy] = useState<"pdf" | "spick" | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [editorDirty, setEditorDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  // Auto-Save: nach 1,5 s ohne weitere Tipparbeit speichern. Manueller
  // "Speichern"-Button wurde entfernt — der User soll sich nichts merken muessen.
  useEffect(() => {
    const ist_schreibgeschuetzt = aktiverEinsatz?.schreibschutz === true;
    if (!editorDirty || !aktiverEinsatzId || ist_schreibgeschuetzt) return;
    const handle = setTimeout(() => {
      void saveEditor();
    }, 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorDirty, aktiverEinsatzId, aktiverEinsatz?.schreibschutz]);
  // Abschluss-Workflow: separater State-Slot, damit der Confirm-Dialog
  // unabhängig vom normalen Save funktioniert und der Einsatzleiter eine
  // explizite Bestätigung sehen muss bevor der Schreibschutz aktiviert wird.
  const [abschlussConfirmOpen, setAbschlussConfirmOpen] = useState(false);
  const [abschlussBusy, setAbschlussBusy] = useState(false);
  const [abschlussErr, setAbschlussErr] = useState<string | null>(null);
  const [abschlussOk, setAbschlussOk] = useState<string | null>(null);
  /** Modal-State fuer Neuer-Einsatz-Anlage in der Florianstation. */
  const [neuerEinsatzOpen, setNeuerEinsatzOpen] = useState<EinsatzTyp | null>(null);
  const [archivOpenFlorian, setArchivOpenFlorian] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Wenn der 403 vom Abschluss-Endpoint zurückkommt, ist meist der Token
   *  veraltet (alte Rolle "mannschaft" für zentrale). Wir zeigen dann einen
   *  direkten Re-Auth-Button im Fehler-Banner statt nur Text. */
  const [abschlussNeedsReauth, setAbschlussNeedsReauth] = useState(false);
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
        setAktiveEinsaetze(r.items);
        // Auto-Select: wenn aktuell ausgewaehlter Einsatz nicht mehr in der Liste
        // (z. B. abgeschlossen oder gewipt) → auf den ersten verbleibenden umschalten.
        setAktiverEinsatzId((prev) => {
          if (prev && r.items.some((e) => e._id === prev)) return prev;
          // Wenn der gerade neu angelegte Einsatz noch nicht in der Liste
          // ist (Backend braucht 5-10 s bis Cache-Refresh), nicht ueberschreiben.
          // Greift maximal 30 s — danach erwarten wir dass er definitiv da ist.
          const justCreated = justCreatedRef.current;
          if (justCreated && Date.now() - justCreated.ts < 30_000) {
            return justCreated.id;
          }
          return r.items[0]?._id ?? null;
        });
        if (r.items.length === 0) {
          setFahrzeugberichte([]);
        }
      } catch {
        // Backend nicht erreichbar — bleibt beim aktuellen Stand (kein
        // ungewollter Reset bei kurzem Netz-Wackler).
      }
    };
    // Reload-Hook fuer onCreated: ruft direkt load() ohne aufs naechste
    // Polling-Intervall zu warten.
    reloadAktiveEinsaetzeRef.current = () => {
      void load();
    };
    void load();
    // Polling alle 10 s (statt 30 s) — damit Multi-Tablet-Updates schneller
    // sichtbar sind. Backend-API ist billig (couchdb _all_docs mit prefix).
    const t = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Fahrzeugberichte aller Fahrzeuge zum aktiven Einsatz pollen.
  // Refresht alle 15 s — schneller als der Einsatz-Poll, damit der
  // Einsatzleiter sieht wenn ein Tablet einen Bericht abschließt.
  //
  // WICHTIG: beim ID-Wechsel SOFORT auf [] leeren, sonst zeigt die UI
  // bis zum ersten Call (~hunderte ms bis zu 15 s) die fahrzeugberichte
  // vom VORIGEN Einsatz an — und wenn der vorige Einsatz schon einen
  // abgeschlossenen KDO-Bericht hatte, denkt der User "der neue Einsatz
  // hat sofort KDO als abgeschlossen gesetzt" (echter Bug-Report).
  useEffect(() => {
    if (!aktiverEinsatzId) {
      setFahrzeugberichte([]);
      return;
    }
    let cancelled = false;
    setFahrzeugberichte([]);
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

  // Live-Positions-Polling. Tablet-Pings landen in einem In-Memory-State
  // im Backend (services/positions-state). Wir pollen alle 3 s — Fahrzeuge
  // ohne Ping fallen serverseitig nach 5 min aus der Liste raus.
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
        const filtered = r.items
          .filter((p): p is { fahrzeugId: FahrzeugId; lat: number; lng: number; ts: string } =>
            ["kdo", "tlf-a-4000", "lfa-b", "mtf"].includes(p.fahrzeugId),
          );
        setPositions(filtered);
      } catch {
        // Netz weg / 401 → wir behalten den letzten State, nächster Tick versucht erneut
      }
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Personalliste einmalig laden — wird benötigt um (a) aus den
  // `fahrzeugKdtPersonId`-IDs Klar-Namen für die Status-Liste zu machen
  // und (b) den PersonPickerModal für Bearbeiter + Reserve zu füttern.
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        // Map auf PickPerson-Shape — fülle Pflichtfelder defensiv auf.
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
          .sort((a, b) => `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`));
        setPersonen(list);
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
    // Auto-Fill bei Einsatzort in Eberstalzell: Pflichtbereich = Ja,
    // Einsatzzone FF Eberstalzell = Ja, ueberoertliche Hilfe = Nein.
    // Greift nur wenn der Server noch keinen Wert hatte (null/undefined)
    // — der Einsatzleiter kann das jederzeit ueberstimmen.
    const ortLower = (aktiverEinsatz.einsatzort ?? "").toLowerCase();
    const inEberstalzell =
      ortLower.includes("eberstalzell") || ortLower.includes("4653");
    setEditor({
      pflichtbereich:
        typeof aktiverEinsatz.pflichtbereich === "boolean"
          ? aktiverEinsatz.pflichtbereich
          : inEberstalzell
            ? true
            : null,
      einsatzzoneEzell:
        typeof aktiverEinsatz.einsatzzoneEzell === "boolean"
          ? aktiverEinsatz.einsatzzoneEzell
          : inEberstalzell
            ? true
            : null,
      ueberOertlicheHilfe:
        typeof aktiverEinsatz.ueberOertlicheHilfe === "boolean"
          ? aktiverEinsatz.ueberOertlicheHilfe
          : inEberstalzell
            ? false
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
      bearbeiterPersonId:
        typeof aktiverEinsatz.bearbeiterPersonId === "number"
          ? aktiverEinsatz.bearbeiterPersonId
          : null,
      reservePersonIds: Array.isArray(aktiverEinsatz.reservePersonIds)
        ? aktiverEinsatz.reservePersonIds
        : [],
      zugewieseneFahrzeuge: Array.isArray(aktiverEinsatz.zugewieseneFahrzeuge)
        ? aktiverEinsatz.zugewieseneFahrzeuge
        : [],
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
      if (editor.bearbeiterPersonId !== null) {
        body.bearbeiterPersonId = editor.bearbeiterPersonId;
      }
      body.reservePersonIds = editor.reservePersonIds;
      body.zugewieseneFahrzeuge = editor.zugewieseneFahrzeuge;

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
        setAktiveEinsaetze((prev) => prev.map((e) => (e._id === reloaded._id ? reloaded : e)));
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

  /**
   * Abschluss-Workflow für den Einsatzleiter.
   *
   * Voraussetzungen (vom Backend nochmal geprüft):
   *  - Token-Rolle = "einsatzleiter" (PIN auf Zentrale → mappt auf einsatzleiter)
   *  - Einsatz existiert + status ≠ "abgeschlossen"
   *
   * Bei Erfolg:
   *  - Backend setzt status="abgeschlossen", schreibschutz=true,
   *    einsatzende=now
   *  - PWA lädt aktiverEinsatz neu (Schreibschutz-Banner wird sichtbar)
   *  - aktiverEinsatzId NICHT auf null setzen — die Florianstation soll den
   *    abgeschlossenen Bericht read-only zur Übersicht behalten bis der
   *    nächste Alarm reinkommt oder der User manuell wechselt.
   *
   * Bei 409 (already_closed): das Tablet hatte einen veralteten Stand
   * — wir laden nur neu, kein Fehler.
   */
  async function handleAbschluss(): Promise<void> {
    if (!aktiverEinsatzId) {
      setAbschlussErr("Kein aktiver Einsatz ausgewählt.");
      return;
    }
    setAbschlussBusy(true);
    setAbschlussErr(null);
    setAbschlussOk(null);
    try {
      await apiCall<{ ok: true; id: string; rev: string }>(
        `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}/abschluss`,
        { method: "POST" },
      );
      // Doc neu laden — der Schreibschutz-Status soll sofort sichtbar werden.
      try {
        const reloaded = await apiCall<EinsatzApiDoc>(
          `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
        );
        setAktiveEinsaetze((prev) => prev.map((e) => (e._id === reloaded._id ? reloaded : e)));
      } catch {
        // Falls Reload nicht klappt — nächster Poll holt es. Nicht blockieren.
      }
      setAbschlussConfirmOpen(false);
      setAbschlussOk(
        `Einsatz abgeschlossen · ${new Date().toLocaleTimeString("de-AT")} · Bericht ist jetzt schreibgeschützt`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 409 = bereits abgeschlossen → kein echter Fehler, nur Neu-Laden.
      if (msg.includes("already_closed") || msg.includes("409")) {
        try {
          const reloaded = await apiCall<EinsatzApiDoc>(
            `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
          );
          setAktiveEinsaetze((prev) => prev.map((e) => (e._id === reloaded._id ? reloaded : e)));
        } catch {
          // egal
        }
        setAbschlussConfirmOpen(false);
        setAbschlussOk("Einsatz war bereits abgeschlossen.");
      } else if (msg.includes("403") || msg.includes("insufficient_role")) {
        setAbschlussErr(
          "Sitzung veraltet — diese Anmeldung wurde noch mit der alten Rollen-Zuordnung ausgestellt. Bitte einmal neu anmelden, danach funktioniert der Abschluss.",
        );
        setAbschlussNeedsReauth(true);
      } else if (msg.includes("401")) {
        setAbschlussErr(
          "Sitzung abgelaufen — bitte die Seite neu laden und erneut anmelden.",
        );
      } else {
        setAbschlussErr(`Abschluss fehlgeschlagen: ${msg}`);
      }
    } finally {
      setAbschlussBusy(false);
    }
  }

  async function downloadPdf(einsatzId: string): Promise<void> {
    setDownloadBusy("pdf");
    setDownloadErr(null);
    try {
      const token = getTabletToken();
      const { resolveApiUrl } = await import("../lib/api");
      const res = await fetch(resolveApiUrl(`/api/einsaetze/${encodeURIComponent(einsatzId)}/pdf`), {
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

  // (Frueher openSpickzettel — syBOS-Spickzettel-Button und Funktion entfernt.)

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
    fahrer?: string;
    kdt?: string;
    mannschaftNamen: string[];
    asAktiv: number;
    oelSaecke: number;
  }[] = FAHRZEUG_ORDER.map((id) => {
    const bericht = fahrzeugberichte.find((b) => b.fahrzeugId === id);
    if (!bericht) {
      return {
        id,
        status: "wartend" as const,
        mannschaft: 0,
        asAktiv: 0,
        oelSaecke: 0,
        mannschaftNamen: [],
      };
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
    const fahrerId = bericht.fahrerPersonId;
    const fahrerName = fahrerId
      ? (personenMap.get(fahrerId) ?? `Pers-ID ${fahrerId}`)
      : undefined;
    const mannschaftNamen = mannschaftSlots
      .map((m) =>
        m.personId !== undefined
          ? (personenMap.get(m.personId) ?? `Pers-ID ${m.personId}`)
          : undefined,
      )
      .filter((s): s is string => !!s);
    const status: "im_einsatz" | "abgeschlossen" =
      bericht.status === "abgeschlossen" ? "abgeschlossen" : "im_einsatz";
    return {
      id,
      status,
      mannschaft: headcount,
      ...(fahrerName ? { fahrer: fahrerName } : {}),
      ...(kdtName ? { kdt: kdtName } : {}),
      mannschaftNamen,
      asAktiv,
      oelSaecke: bericht.oelbindemittelSaecke ?? 0,
    };
  });

  // Live-Daten des aktiven Einsatzes (aus Backend). Wenn kein aktiver Einsatz
  // existiert, bleiben die Felder leer — der Idle-Branch in der JSX rendert
  // dann eine "Bereit"-Karte statt eines Phantom-Einsatzes (frueher: Fallback
  // auf DEMO_ALARM, was nach einem Wipe wie ein echter Einsatz aussah).
  const e = aktiverEinsatz;
  const istIdle = !e;
  const einsatzId = e?._id?.replace(/^einsatz:/, "") ?? "";
  const einsatzort = e?.einsatzort ?? "";
  const einsatzart =
    e?.einsatzart ?? e?.einsatzartFreitext ?? e?.alarmierungText ?? "";
  const alarmierungZeit = e?.alarmierungZeit ?? "";
  const alarmierungAuthor = e?.alarmierungAuthor ?? "";
  const einsatzTyp: "alarm" | "manuell" | "lotsendienst" | "uebung" =
    e?.einsatzTyp === "manuell" ||
    e?.einsatzTyp === "lotsendienst" ||
    e?.einsatzTyp === "uebung"
      ? (e.einsatzTyp as "manuell" | "lotsendienst" | "uebung")
      : "alarm";
  /** Manuell angelegte Einsätze (auch Übung + Lotsendienst) brauchen
   *  nicht zwingend Fahrzeugberichte — oft rückt nur 1 Fahrzeug aus oder
   *  gar keines. Beim BlaulichtSMS-Alarm dagegen ist die Erwartung, dass
   *  alle 4 Fahrzeuge entweder ausrücken oder als „nicht eingesetzt"
   *  markiert werden (Phantom-Cleanup übernimmt die leeren nach 2 h). */
  const istManuellerTyp = einsatzTyp !== "alarm";

  const tabs: EinsatzTabSummary[] = aktiveEinsaetze.map((eDoc) => {
    const id = eDoc._id.replace(/^einsatz:/, "");
    const art = eDoc.einsatzart ?? eDoc.einsatzartFreitext ?? eDoc.alarmierungText ?? "Einsatz";
    const ort = eDoc.einsatzort ?? "";
    return {
      id,
      einsatzart: art,
      einsatzort: ort,
      status: "aktiv" as const,
      manuell: eDoc.einsatzTyp === "manuell" || eDoc.einsatzTyp === "uebung" || eDoc.einsatzTyp === "lotsendienst",
    };
  });

  // Datum nur wenn echter Einsatz vorhanden — sonst Invalid Date.
  const datum = alarmierungZeit ? new Date(alarmierungZeit) : null;
  const datumStr = datum
    ? `${pad(datum.getDate())}.${pad(datum.getMonth() + 1)}.${datum.getFullYear()}`
    : "—";

  const aggregateMannschaft = fahrzeugStatus.reduce((sum, f) => sum + f.mannschaft, 0);
  const abgeschlossenCount = fahrzeugStatus.filter((f) => f.status === "abgeschlossen").length;
  const aktivCount = fahrzeugStatus.filter((f) => f.status === "im_einsatz").length;

  // AS-Trupps: Atemschutz-Personen in 2er-Trupps. Eine ungerade Anzahl wird
  // aufgerundet (sicherheitskritisch — fünfter AS heißt: ein dritter Trupp
  // ist in Vorbereitung, auch wenn der Partner noch fehlt).
  // (Frueher asTruppsGesamt + oelSaeckeGesamt fuer die Zusammenfassung-Sektion —
  // entfernt; die Werte werden ohnehin im Top-Header der Einsatz-Karte gezeigt.)

  // Globale Einsatzchronik — wird aus dem CouchDB-Einsatz-Doc gepollt
  // (identischer Cross-Sync wie auf den Tablets). Start leer; sobald ein
  // echter Einsatz aktiv ist, fuellen die Polls die Liste auf.
  const [chronik, setChronik] = useState<ChronikEintrag[]>([]);

  useEffect(() => {
    // Ohne aktiven Einsatz nichts pollen — keine Phantom-Anfragen mit
    // toter `einsatz:`-ID. Chronik bei Wechsel/Wipe ebenfalls leeren.
    if (!aktiverEinsatzId) {
      setChronik([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const knownIds = new Set(chronik.map((c) => c.id));
      const neue = await fetchChronikDiff(aktiverEinsatzId, knownIds);
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

      <EinsatzTabs
        tabs={tabs}
        activeId={einsatzId}
        onSelect={(id) => {
          const fullId = id.startsWith("einsatz:") ? id : `einsatz:${id}`;
          setAktiverEinsatzId(fullId);
        }}
        onNew={() => setNeuerEinsatzOpen("manuell")}
        onCloseTab={(id) => {
          const fullId = id.startsWith("einsatz:") ? id : `einsatz:${id}`;
          const tab = tabs.find((t) => t.id === fullId);
          setTabToClose({
            id: fullId,
            label: tab
              ? `${tab.einsatzart}${tab.einsatzort ? " · " + tab.einsatzort : ""}`
              : "Auftrag",
          });
        }}
      />

      <StatusBanner />
      <HandoffBanner onReleased={onHandoffLogout} />

      <main className="page">
        {/* Hauptbericht-Header bzw. Idle-Karte wenn kein aktiver Einsatz. */}
        {istIdle ? (
          <section
            className="alarm"
            style={{
              background:
                "linear-gradient(135deg, var(--glass-2), color-mix(in srgb, var(--ok) 8%, transparent))",
              borderColor: "var(--ok-border)",
            }}
          >
            <div className="alarm-top">
              <div className="alarm-left">
                <div
                  className="alarm-icon"
                  style={{ background: "var(--ok)", animation: "pulse-soft 2.4s ease-in-out infinite" }}
                >
                  <Activity size={30} color="#fff" strokeWidth={2} />
                </div>
                <div>
                  <div className="alarm-tags">
                    <span className="alarm-tag" style={{ color: "var(--ok)" }}>
                      <span className="dot" style={{ background: "var(--ok)" }} />
                      Bereit
                    </span>
                    <span className="alarm-tag muted">· Florian Eberstalzell · Einsatzzentrale</span>
                  </div>
                  <div className="alarm-title">Keine aktive Einsatzdokumentation</div>
                  <div className="alarm-addr" style={{ color: "var(--fg-3)" }}>
                    Sobald ein BlaulichtSMS-Alarm eingeht oder ein Tablet eine Tätigkeit anlegt,
                    erscheint der Einsatz hier automatisch.
                  </div>
                  <div
                    style={{
                      marginTop: 14,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setNeuerEinsatzOpen("manuell")}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center" }}
                    >
                      <Siren size={14} /> Einsatz anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setNeuerEinsatzOpen("uebung")}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--ok) 80%, transparent)" }}
                    >
                      <GraduationCap size={14} /> Übung anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setNeuerEinsatzOpen("lotsendienst")}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--warn) 80%, transparent)" }}
                    >
                      <MapPin size={14} /> Lotsendienst anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setArchivOpenFlorian(true)}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 13, gap: 6, display: "inline-flex", alignItems: "center", background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border-strong)" }}
                    >
                      <Archive size={14} /> Archiv durchsuchen
                    </button>
                  </div>
                </div>
              </div>
              <div className="alarm-no" style={{ color: "var(--fg-3)" }}>—</div>
            </div>
          </section>
        ) : (
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
        )}

        {/* Editor-Bereich ist nur sichtbar bei aktivem Einsatz — Idle = Karte + Übergabe-Sektion ausgeblendet, Stammdaten machen ohne Einsatz keinen Sinn. */}
        {!istIdle && (
          <>
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

        <SectionHead
          title="Beteiligte Stellen & Sonstige FF"
          collapsible
          defaultClosed
          storageKey="beteiligte-stellen"
        />
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
              {beteiligteStellenAll.map((s) => {
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
              {sonstigeFfAll.map((s) => {
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

        <SectionHead
          title="Ölbindemittel"
          collapsible
          defaultClosed
          storageKey="oelbindemittel"
        />
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

        {/* Feld "Freitext Einsatzleiter" wurde entfernt (User-Wunsch) — die
            Meldung der Einsatzleitung kommt jetzt direkt in das Chronik-Feld
            unten, das umbenannt wurde auf "Einsatzbericht / Chronologie".
            meldungEinsatzleitung bleibt im API-Schema erhalten fuer
            Backwaerts-Kompatibilitaet mit aelteren Einsaetzen. */}

        {/* Auto-Save-Toast: nur sichtbar wenn was los ist (speichert/gespeichert/Fehler). */}
        {(saveBusy || saveOk || saveErr) && (
          <div
            style={{
              position: "fixed",
              top: 80,
              right: 20,
              zIndex: 1500,
              padding: "8px 14px",
              borderRadius: 10,
              background: saveErr
                ? "var(--red-tint)"
                : saveBusy
                  ? "var(--info-tint)"
                  : "var(--ok-tint)",
              color: saveErr ? "var(--red)" : saveBusy ? "var(--info)" : "var(--ok)",
              border: `1px solid ${saveErr ? "var(--red-border)" : saveBusy ? "var(--blue-border)" : "var(--ok-border)"}`,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {saveErr ? (
              <>
                <AlertTriangle size={13} /> {saveErr}
              </>
            ) : saveBusy ? (
              "Speichere …"
            ) : (
              <>
                <CheckCircle2 size={13} /> Gespeichert
              </>
            )}
          </div>
        )}

        <SectionHead
          title="Sachbearbeiter & Reserve"
          collapsible
          defaultClosed
          storageKey="reserve-bearbeiter"
        />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Users size={20} />
              Bearbeiter / Reserve
            </div>
            <span className="card-meta">
              <span className="num">{editor.reservePersonIds.length}</span> in Reserve
            </span>
          </div>

          {/* ─── Bearbeiter (Sachbearbeiter Florianstation) ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="caption" style={{ marginBottom: 2 }}>
              Sachbearbeiter
            </div>
            {editor.bearbeiterPersonId !== null ? (
              <div
                className="person filled"
                style={{
                  cursor: schreibschutz ? "default" : "pointer",
                  opacity: schreibschutz ? 0.7 : 1,
                }}
              >
                <span className="avatar color-a">
                  {initials(personenMap.get(editor.bearbeiterPersonId) ?? "")}
                </span>
                <div
                  className="name"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                  }}
                >
                  <span>
                    {personenMap.get(editor.bearbeiterPersonId) ??
                      `Pers-ID ${editor.bearbeiterPersonId}`}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "var(--tracking-caps)",
                      textTransform: "uppercase",
                      color: "var(--fg-3)",
                    }}
                  >
                    Sachbearbeiter Florianstation
                  </span>
                </div>
                {!schreibschutz ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setPersonPickerOpen("bearbeiter")}
                      aria-label="Bearbeiter ändern"
                      title="Bearbeiter ändern"
                    >
                      <Users size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => patchEditor({ bearbeiterPersonId: null })}
                      aria-label="Bearbeiter entfernen"
                      title="Bearbeiter entfernen"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                className="crew-row empty"
                disabled={schreibschutz}
                onClick={() => setPersonPickerOpen("bearbeiter")}
                style={{ cursor: schreibschutz ? "not-allowed" : "pointer", width: "100%" }}
              >
                <span className="crew-num">+</span>
                <span className="crew-name placeholder">
                  Sachbearbeiter aus Personalliste wählen …
                </span>
              </button>
            )}

            {/* ─── Reserve-Mannschaft ─── */}
            <div className="caption" style={{ marginTop: 6, marginBottom: 2 }}>
              Reserve · zur Verfügung gestanden, nicht ausgerückt
            </div>
            {editor.reservePersonIds.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {editor.reservePersonIds.map((pid) => (
                  <div key={pid} className="person filled">
                    <span className="avatar color-c">
                      {initials(personenMap.get(pid) ?? "")}
                    </span>
                    <span className="name">
                      {personenMap.get(pid) ?? `Pers-ID ${pid}`}
                    </span>
                    {!schreibschutz ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        onClick={() =>
                          patchEditor({
                            reservePersonIds: editor.reservePersonIds.filter((id) => id !== pid),
                          })
                        }
                        aria-label="Aus Reserve entfernen"
                        title="Aus Reserve entfernen"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--fg-3)",
                  fontStyle: "italic",
                  padding: "4px 2px",
                }}
              >
                Keine Reserve-Personen erfasst.
              </div>
            )}
            {!schreibschutz ? (
              <button
                type="button"
                className="crew-row empty"
                onClick={() => setPersonPickerOpen("reserve")}
                style={{ cursor: "pointer", width: "100%" }}
              >
                <span className="crew-num">+</span>
                <span className="crew-name placeholder">Person zur Reserve hinzufügen …</span>
              </button>
            ) : null}
          </div>
        </section>

        <SectionHead title="Fahrzeug-Disposition" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Truck size={20} />
              Welche Fahrzeuge bearbeiten diesen Einsatz?
            </div>
            <span className="card-meta">
              {editor.zugewieseneFahrzeuge.length === 0
                ? "Default: alle Fahrzeuge sehen den Einsatz"
                : `${editor.zugewieseneFahrzeuge.length} zugewiesen`}
            </span>
          </div>

          <p style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.55, margin: "0 0 14px" }}>
            Keine Auswahl → alle Fahrzeug-Tablets sehen den Einsatz (Default bei
            BlaulichtSMS-Alarm). Auswahl filtert die Sichtbarkeit auf die markierten
            Fahrzeuge — nuetzlich bei Sturm um Adressen aufzuteilen.
          </p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(["kdo", "tlf-a-4000", "lfa-b", "mtf"] as const).map((id) => {
              const aktiv = editor.zugewieseneFahrzeuge.includes(id);
              const fz = FAHRZEUGE[id];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={schreibschutz}
                  onClick={() =>
                    patchEditor({
                      zugewieseneFahrzeuge: aktiv
                        ? editor.zugewieseneFahrzeuge.filter((x) => x !== id)
                        : [...editor.zugewieseneFahrzeuge, id],
                    })
                  }
                  className={`chip${aktiv ? " active" : ""}`}
                  style={{
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    background: aktiv ? "var(--info)" : "var(--surface)",
                    color: aktiv ? "#fff" : "var(--fg)",
                    border: `1px solid ${aktiv ? "var(--info)" : "var(--border)"}`,
                    borderRadius: 10,
                    cursor: schreibschutz ? "not-allowed" : "pointer",
                    opacity: schreibschutz ? 0.5 : 1,
                  }}
                >
                  {fz.funkrufname}
                </button>
              );
            })}
          </div>
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
              const isSelected = selectedFahrzeugId === f.id;
              const isClickable = f.status !== "wartend";
              const toggleSelect = (): void => {
                if (!isClickable) return;
                const next = isSelected ? null : f.id;
                setSelectedFahrzeugId(next);
                // Wenn ausgewaehlt: kurz zur Karte runterscrollen damit der
                // pulsierende Marker im Sichtfeld ist (smoothes UX).
                if (next) {
                  setTimeout(() => {
                    const mapEl = document.querySelector(
                      "[data-florian-map-anchor]",
                    );
                    mapEl?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 80);
                }
              };
              return (
                <div
                  key={f.id}
                  style={{ display: "flex", flexDirection: "column", gap: 0 }}
                >
                  <div
                    className="crew-row filled"
                    onClick={toggleSelect}
                    role={isClickable ? "button" : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSelect();
                            }
                          }
                        : undefined
                    }
                    style={{
                      cursor: isClickable ? "pointer" : "default",
                      borderRadius: isSelected ? "10px 10px 0 0" : undefined,
                      transition: "background 160ms ease",
                      ...(isSelected
                        ? {
                            background:
                              "color-mix(in srgb, var(--warn) 14%, transparent)",
                            outline: "1px solid var(--warn)",
                          }
                        : {}),
                    }}
                    aria-pressed={isClickable ? isSelected : undefined}
                  >
                    <div
                      className="crew-num"
                      style={{ width: 64, fontFamily: "var(--font-mono)" }}
                    >
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
                  {isSelected ? (
                    <div
                      style={{
                        padding: "10px 16px 12px 80px",
                        background:
                          "color-mix(in srgb, var(--warn) 8%, transparent)",
                        border: "1px solid var(--warn)",
                        borderTop: "none",
                        borderRadius: "0 0 10px 10px",
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(110px, max-content) 1fr",
                        rowGap: 4,
                        columnGap: 12,
                        fontSize: 12.5,
                        animation:
                          "glass-reveal 180ms var(--ease-decel) both",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--fg-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          alignSelf: "center",
                        }}
                      >
                        Fahrer
                      </span>
                      <strong>{f.fahrer ?? "—"}</strong>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--fg-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          alignSelf: "center",
                        }}
                      >
                        Fahrzeug-Kdt.
                      </span>
                      <strong>{f.kdt ?? "—"}</strong>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--fg-3)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Mannschaft
                      </span>
                      <div>
                        {f.mannschaftNamen.length > 0 ? (
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 16,
                              fontWeight: 500,
                            }}
                          >
                            {f.mannschaftNamen.map((name, i) => (
                              <li key={i}>{name}</li>
                            ))}
                          </ul>
                        ) : (
                          <span style={{ color: "var(--fg-3)" }}>
                            (noch keine Mannschaft erfasst)
                          </span>
                        )}
                      </div>
                      {f.asAktiv > 0 ? (
                        <>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              color: "var(--warn)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              alignSelf: "center",
                            }}
                          >
                            Atemschutz
                          </span>
                          <strong style={{ color: "var(--warn)" }}>
                            {f.asAktiv} Pers. aktiv
                          </strong>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

          </>
        )}

        <SectionHead title="Karte · Live-Positionen" />
        <section className="card" data-florian-map-anchor>
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
            fahrzeuge={buildFleetForFlorianMap(positions, fahrzeugStatus)}
            zoom={aktiverEinsatz?.koordinaten ? 16 : 14}
            selectedFahrzeugId={selectedFahrzeugId}
            onSelectFahrzeug={(id) =>
              setSelectedFahrzeugId(id as FahrzeugId | null)
            }
            mannschaftByFahrzeug={Object.fromEntries(
              fahrzeugStatus.map((f) => [
                f.id,
                {
                  fahrzeugId: f.id,
                  ...(f.fahrer ? { fahrer: f.fahrer } : {}),
                  ...(f.kdt ? { kdt: f.kdt } : {}),
                  mannschaft: f.mannschaftNamen,
                },
              ]),
            )}
            enablePopOut
            defaultHeight={500}
          />
        </section>

        {/* Aggregations + Chronik + Uebergabe nur sichtbar mit aktivem Einsatz. */}
        {!istIdle && (
          <>
            {/* "Zusammenfassung Mannschaft"-Section entfernt — die Werte stehen
                schon im Top-Header der Einsatz-Karte (Mannschaft, Berichte). */}

        <SectionHead title="Einsatzbericht / Chronologie" />
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Clipboard size={20} />
              Einsatzbericht / Chronologie
            </div>
            <span className="card-meta">
              {aktiverEinsatzId
                ? "Live · Funkverkehr + Meldung Einsatzleiter"
                : "kein aktiver Einsatz"}
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

        <SectionHead
          title="Übergabe an Bearbeiter"
          collapsible
          defaultClosed
          storageKey="uebergabe-bearbeiter"
        />
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
          </div>
          {abschlussOk ? (
            <div
              role="status"
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                background: "var(--ok-tint)",
                color: "var(--ok)",
                border: "1px solid var(--ok-border)",
              }}
            >
              {abschlussOk}
            </div>
          ) : null}
          {abschlussErr ? (
            <div
              role="alert"
              style={{
                marginTop: 8,
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 12,
                background: "var(--red-tint)",
                color: "var(--red)",
                border: "1px solid var(--red-border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <span>{abschlussErr}</span>
              {abschlussNeedsReauth ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem("hotdoc.tabletToken");
                      sessionStorage.setItem("hotdoc.setupReason", "role-stale");
                    } catch {
                      // egal
                    }
                    window.location.reload();
                  }}
                  style={{
                    alignSelf: "flex-start",
                    background: "var(--red)",
                    color: "#fff",
                    border: 0,
                    padding: "6px 12px",
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Jetzt neu anmelden
                </button>
              ) : null}
            </div>
          ) : null}
          {/*
            Abschluss-Logik — drei Stufen:

            1. Beteiligte Fahrzeuge: alles was NICHT "wartend" ist, d. h.
               wo wirklich ein Bericht angelegt wurde (egal ob in_arbeit
               oder abgeschlossen). Wartende zählen NICHT als blockierend
               weil sie offensichtlich gar nicht ausgerückt sind.
            2. Offene Berichte: beteiligte Fahrzeuge die noch "im_einsatz"
               sind. Solange welche offen sind → Block.
            3. Bei manueller Anlage (Lotsendienst/Übung/Sonstiges) ist
               KEIN Fahrzeugbericht zwingend — der Einsatzleiter kann
               jederzeit abschließen. Sinnvoll wenn z. B. Lotsendienst
               komplett im Bereitschaftsdienst lief ohne Tablets.
          */}
          {(() => {
            const beteiligte = fahrzeugStatus.filter((f) => f.status !== "wartend");
            const offene = beteiligte.filter((f) => f.status === "im_einsatz");
            const wartende = fahrzeugStatus.filter((f) => f.status === "wartend");
            const blockiert = !istManuellerTyp && offene.length > 0;
            const offeneNamen = offene
              .map((f) => FAHRZEUGE[f.id].bezeichnung)
              .join(" · ");
            const wartendeNamen = wartende
              .map((f) => FAHRZEUGE[f.id].bezeichnung)
              .join(" · ");
            return (
              <>
                <button
                  type="button"
                  className="cta"
                  onClick={() => {
                    setAbschlussErr(null);
                    setAbschlussOk(null);
                    setAbschlussConfirmOpen(true);
                  }}
                  disabled={
                    schreibschutz || !aktiverEinsatzId || abschlussBusy || blockiert
                  }
                  style={
                    schreibschutz || !aktiverEinsatzId || abschlussBusy || blockiert
                      ? { opacity: 0.55, cursor: "not-allowed" }
                      : undefined
                  }
                >
                  <CheckCircle2 size={22} />
                  {schreibschutz
                    ? "Einsatz bereits abgeschlossen"
                    : "Einsatz abschließen & archivieren"}
                  <ArrowRight size={22} />
                </button>
                <div className="cta-hint">
                  {schreibschutz ? (
                    <>
                      <strong>Bericht ist schreibgeschützt.</strong> Reaktivierung nur
                      durch einen Funktionär möglich.
                    </>
                  ) : blockiert ? (
                    <>
                      <strong>{offeneNamen}</strong>{" "}
                      {offene.length === 1 ? "ist noch im Einsatz" : "sind noch im Einsatz"}.
                      Abschluss möglich sobald{" "}
                      {offene.length === 1
                        ? "dieser Bericht"
                        : "diese Berichte"}{" "}
                      vom Fahrzeug-Kdt. abgeschlossen{" "}
                      {offene.length === 1 ? "wurde" : "wurden"}.
                    </>
                  ) : istManuellerTyp && beteiligte.length === 0 ? (
                    <>
                      {einsatzTyp === "lotsendienst"
                        ? "Lotsendienst"
                        : einsatzTyp === "uebung"
                          ? "Übung"
                          : "Manueller Einsatz"}{" "}
                      ohne Fahrzeugberichte — Abschluss jederzeit möglich.
                    </>
                  ) : istManuellerTyp && wartende.length > 0 ? (
                    <>
                      <strong>{beteiligte.length}</strong> Fahrzeugbericht
                      {beteiligte.length === 1 ? "" : "e"} eingegangen ·{" "}
                      <span style={{ color: "var(--fg-3)" }}>
                        {wartendeNamen} nicht beteiligt
                      </span>{" "}
                      — bereit zur Übergabe.
                    </>
                  ) : wartende.length > 0 ? (
                    <>
                      Alle eingegangenen Fahrzeugberichte abgeschlossen ·{" "}
                      <span style={{ color: "var(--fg-3)" }}>
                        {wartendeNamen} nicht ausgerückt (leere Berichte werden vom
                        Cleanup-Worker nach 2 h entfernt)
                      </span>
                      .
                    </>
                  ) : (
                    <>Alle Fahrzeugberichte vollständig — bereit zur Übergabe.</>
                  )}
                </div>
              </>
            );
          })()}
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

      {/* ─── Tab-Schließen-Dialog (X im Browser-Tab-Reiter) ─── */}
      <CloseTabConfirmModal
        open={tabToClose !== null}
        tabLabel={tabToClose?.label ?? ""}
        isHauptauftrag={true}
        onClose={() => setTabToClose(null)}
        onConfirmAbschluss={async () => {
          if (!tabToClose) return;
          await apiCall(
            `/api/einsaetze/${encodeURIComponent(tabToClose.id)}/abschluss`,
            { method: "POST" },
          );
          // Wenn der geschlossene Tab der aktive war: weg vom abgeschlossenen
          // Einsatz — der nächste Polling-Tick filtert ihn weg, der EinsatzTabs-
          // Reducer setzt den Index automatisch auf den nächsten aktiven Einsatz.
          if (tabToClose.id === aktiverEinsatzId) {
            setAktiverEinsatzId(null);
          }
          reloadAktiveEinsaetzeRef.current();
        }}
        onConfirmVerwerfen={async (grund) => {
          if (!tabToClose) return;
          await apiCall(
            `/api/einsaetze/${encodeURIComponent(tabToClose.id)}/verwerfen`,
            { method: "POST", body: { grund } },
          );
          if (tabToClose.id === aktiverEinsatzId) {
            setAktiverEinsatzId(null);
          }
          reloadAktiveEinsaetzeRef.current();
        }}
      />

      {/* ─── PersonPicker für Bearbeiter ODER Reserve ─── */}
      <PersonPickerModal
        open={personPickerOpen !== null}
        title={
          personPickerOpen === "bearbeiter"
            ? "Sachbearbeiter wählen"
            : "Person zur Reserve hinzufügen"
        }
        subtitle={
          personPickerOpen === "bearbeiter"
            ? "Wer schreibt den Bericht in syBOS?"
            : "Personal das im Haus geblieben ist"
        }
        personen={personen}
        bereitsGewaehlt={
          personPickerOpen === "reserve"
            ? new Set([
                ...editor.reservePersonIds,
                ...(editor.bearbeiterPersonId !== null
                  ? [editor.bearbeiterPersonId]
                  : []),
              ])
            : personPickerOpen === "bearbeiter" && editor.bearbeiterPersonId !== null
              ? new Set([editor.bearbeiterPersonId])
              : new Set<number>()
        }
        onSelect={(p) => {
          if (personPickerOpen === "bearbeiter") {
            patchEditor({ bearbeiterPersonId: p.syBosId });
          } else if (personPickerOpen === "reserve") {
            if (!editor.reservePersonIds.includes(p.syBosId)) {
              patchEditor({
                reservePersonIds: [...editor.reservePersonIds, p.syBosId],
              });
            }
          }
          setPersonPickerOpen(null);
        }}
        onClose={() => setPersonPickerOpen(null)}
      />

      {abschlussConfirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="abschluss-title"
          onClick={() => !abschlussBusy && setAbschlussConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background:
              "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(12px) saturate(150%)",
            WebkitBackdropFilter: "blur(12px) saturate(150%)",
            animation: "glass-reveal 220ms var(--ease-decel) both",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              background: "var(--glass-1)",
              backdropFilter: "var(--blur-1)",
              WebkitBackdropFilter: "var(--blur-1)",
              color: "var(--fg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--glass-border-strong)",
              boxShadow: "var(--glass-shadow-1), var(--glow-red-soft)",
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              position: "relative",
              overflow: "hidden",
              animation: "glass-reveal 320ms var(--ease-spring) both",
            }}
          >
            <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, var(--red) 0%, color-mix(in srgb, var(--red) 60%, #000) 100%)",
                  color: "#fff",
                  boxShadow: "0 8px 20px -6px rgba(200,16,46,0.5)",
                }}
              >
                <Lock size={20} strokeWidth={2.2} />
              </span>
              <div style={{ flex: 1 }}>
                <h2
                  id="abschluss-title"
                  style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Einsatz wirklich abschließen?
                </h2>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                  }}
                >
                  Schreibschutz wird sofort aktiviert
                </p>
              </div>
            </header>

            <div
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: "var(--fg-2)",
                background: "var(--warn-tint)",
                border: "1px solid var(--warn-border)",
                borderRadius: 10,
                padding: "10px 12px",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle
                size={18}
                style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }}
              />
              <div>
                Nach dem Abschluss kann der Hauptbericht <strong>nicht mehr direkt bearbeitet</strong>{" "}
                werden. Eine Reaktivierung ist nur durch einen Funktionär (Backoffice) mit
                Begründung möglich.
                <br />
                <br />
                Bitte vor dem Abschluss prüfen, dass alle Fahrzeugberichte, Mannschaftszahlen und
                Zeitmarken vollständig sind.
              </div>
            </div>

            {abschlussErr ? (
              <div
                role="alert"
                style={{
                  fontSize: 12,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--red-tint)",
                  color: "var(--red)",
                  border: "1px solid var(--red-border)",
                }}
              >
                {abschlussErr}
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
                marginTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => setAbschlussConfirmOpen(false)}
                disabled={abschlussBusy}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border-strong)",
                  color: "var(--fg)",
                  padding: "10px 16px",
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: abschlussBusy ? "not-allowed" : "pointer",
                  opacity: abschlussBusy ? 0.55 : 1,
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void handleAbschluss()}
                disabled={abschlussBusy}
                style={{
                  background: "var(--red)",
                  border: 0,
                  color: "#fff",
                  padding: "10px 18px",
                  borderRadius: 10,
                  fontWeight: 700,
                  cursor: abschlussBusy ? "wait" : "pointer",
                  opacity: abschlussBusy ? 0.7 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 4px 12px -4px rgba(200,16,46,0.45)",
                }}
              >
                <Lock size={16} />
                {abschlussBusy ? "Schließt ab …" : "Ja, abschließen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <NeuerEinsatzTabletModal
        open={neuerEinsatzOpen !== null}
        initialTyp={neuerEinsatzOpen ?? "manuell"}
        onClose={() => setNeuerEinsatzOpen(null)}
        onCreated={(einsatzId) => {
          setNeuerEinsatzOpen(null);
          // Auto-Switch auf den neu angelegten Einsatz — robust gegen den
          // naechsten Poll-Tick der ihn noch nicht in items[] hat.
          justCreatedRef.current = { id: einsatzId, ts: Date.now() };
          setAktiverEinsatzId(einsatzId);
          // Forciertes Reload der Einsatz-Liste — Backend hat den neuen
          // Einsatz schon angelegt + zurueckgegeben, wir warten nicht aufs
          // naechste 10-s-Polling. So ist der Editor binnen <300 ms befuellt
          // statt nach 5-10 s wie vorher.
          reloadAktiveEinsaetzeRef.current();
        }}
      />

      <ArchivTabletModal
        open={archivOpenFlorian}
        onClose={() => setArchivOpenFlorian(false)}
      />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

/**
 * Section-Head, optional kollabierbar.
 *
 * - Ohne `collapsible` Prop: klassischer DIV (Bestand).
 * - Mit `collapsible`: Button-Variante. Klick toggelt offen/zu. State wird
 *   per `storageKey` in localStorage gehalten — User-Wahl ueberlebt Reload.
 *   Versteckt das direkt darauffolgende Sibling (.card oder .cta-wrap) via
 *   CSS-Regel `[data-collapsed="true"] + .card { display: none }`.
 * - `defaultClosed`: Vorbelegung bevor der User je interagiert hat. Wir
 *   nutzen das fuer selten-genutzte Sektionen (Beteiligte Stellen, Reserve,
 *   Oelbindemittel, Uebergabe) damit der Editor schlanker startet.
 */
function SectionHead({
  title,
  collapsible,
  defaultClosed,
  storageKey,
}: {
  title: string;
  collapsible?: boolean;
  defaultClosed?: boolean;
  storageKey?: string;
}) {
  const [closed, setClosed] = useState<boolean>(() => {
    if (!collapsible) return false;
    if (!storageKey) return defaultClosed ?? false;
    try {
      const v = localStorage.getItem(`hotdoc.section.${storageKey}`);
      return v === null ? (defaultClosed ?? false) : v === "1";
    } catch {
      return defaultClosed ?? false;
    }
  });

  if (!collapsible) {
    return (
      <div className="section-head">
        <span className="h">{title}</span>
        <span className="line" />
      </div>
    );
  }

  const toggle = (): void => {
    const next = !closed;
    setClosed(next);
    if (storageKey) {
      try {
        localStorage.setItem(`hotdoc.section.${storageKey}`, next ? "1" : "0");
      } catch {
        // egal — Quota / Private-Mode
      }
    }
  };

  return (
    <button
      type="button"
      className="section-head section-collapsible"
      data-collapsed={closed ? "true" : "false"}
      onClick={toggle}
      aria-expanded={!closed}
      style={{
        appearance: "none",
        border: 0,
        background: "transparent",
        width: "100%",
        cursor: "pointer",
        textAlign: "left",
        minHeight: 0,
        color: "inherit",
        font: "inherit",
      }}
    >
      <span className="h">{title}</span>
      <span
        aria-hidden
        style={{
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          marginLeft: 4,
        }}
      >
        {closed ? "+" : "−"}
      </span>
      <span className="line" />
    </button>
  );
}

/**
 * Leitet die Avatar-Initialen aus "Nachname Vorname" ab — der personenMap
 * hält Namen in dieser Reihenfolge. Liefert "??" bei leerem String, damit
 * der Avatar nie leer ist und der Layout-Slot stabil bleibt.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "??";
  const a = parts[0].charAt(0).toUpperCase();
  const b = parts[1]?.charAt(0).toUpperCase() ?? "";
  return `${a}${b}` || "??";
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

// (Frueher Stat-Helper-Komponente — fuer die entfernte Zusammenfassung-Sektion;
//  raus, da nirgends mehr verwendet.)

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
