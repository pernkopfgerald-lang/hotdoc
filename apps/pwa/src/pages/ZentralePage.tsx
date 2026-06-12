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
import { apiCall, ApiError, describeApiError, getTabletToken } from "../lib/api";
import { pollingPaused } from "../lib/visibility";
import { broadcastChronikEntry, fetchChronikDiff } from "../lib/chronik-sync";
// AUDIT-09/KDT-06 (Audit 2026-06-12): gecachte Personalliste als Offline-Fallback.
import { loadPersonenCache, savePersonenCache } from "../lib/personen-cache";
import { useGeolocation } from "../lib/geo";
import {
  BETEILIGTE_STELLEN as DEFAULT_BETEILIGTE_STELLEN,
  // AUDIT-07/EL-11a (Audit 2026-06-12): Fallback-Berichtsnummer fuer die
  // Abschluss-Quittung, solange die Response keine echte Nummer liefert.
  deriveBerichtNrFromId,
  FAHRZEUGE,
  FLORIAN_POSITION,
  SONSTIGE_FF as DEFAULT_SONSTIGE_FF,
  type FahrzeugId,
  // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-Listen.
  kategorieFuer,
  URSACHE_TECHNISCH,
  HAUPT_TAETIGKEIT_TECHNISCH,
  WEITERE_TAETIGKEITEN_TECHNISCH,
} from "@hotdoc/shared";
// Issue 17 (Einsatz-Test 2026-06-02): Brand-Abschluss-Wizard fuer syBOS-Statistik.
import { BrandAbschlussWizard, type BrandStatistik } from "../components/BrandAbschlussWizard";

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
  /** AUDIT-01 (6): Server-Aenderungsstand — entscheidet ob ein lokaler
   *  Editor-Draft (localStorage) juenger ist als das Backend-Doc. */
  geaendertAm?: string;
  /** AUDIT-07/EL-11a: echte Berichtsnummer (serverseitig beim Abschluss
   *  vergeben) — fuer die Abschluss-Quittung beim already_closed-Pfad. */
  berichtNummer?: string;
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
  // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-Block.
  technischeStatistik?: {
    personenRettung?: {
      anzahlPersonen?: number;
      tot?: number;
      verletzt?: number;
      unverletzt?: number;
    };
    tierRettung?: { gross?: number; klein?: number };
    ursache?: string;
    hauptTaetigkeit?: string;
    weitereTaetigkeiten?: string[];
    gefaehrlicheStoffe?: string[];
  };
  // Issue 17 (Einsatz-Test 2026-06-02): syBOS Brand-Statistik-Block.
  brandStatistik?: {
    entdeckung?: string[];
    ausmass?: string;
    klassen?: string[];
    kategorie?: string;
    objektart1?: string;
    objektart2?: string;
    bauart?: string;
    lagen?: string[];
    verlauf?: string;
    personenRettung?: {
      anzahlPersonen?: number;
      tot?: number;
      verletzt?: number;
      unverletzt?: number;
    };
    tierRettung?: { gross?: number; klein?: number };
  };
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
  /** #157 (Test 2026-06-03): Einsatzort in der Florian-Zentrale editierbar —
   *  der EL muss eine falsche Auto-Adresse korrigieren können (z.B. wenn
   *  BlaulichtSMS einen Autobahn-km-Marker daneben geocoded hat). */
  einsatzort: string;
  verrechenbar: boolean;
  oelSaecke: number;
  /** syBOS-Person-ID des Sachbearbeiters in der Florianstation. */
  bearbeiterPersonId: number | null;
  /** syBOS-Person-IDs der Reserve-Mannschaft (zur Verfügung gestanden, nicht ausgerückt). */
  reservePersonIds: number[];
  /** Florianstation-Disposition: welche Fahrzeuge bearbeiten diesen Einsatz?
   *  Leer → alle Fahrzeuge-Tablets sehen den Einsatz (Default bei BlaulichtSMS-Alarm). */
  zugewieseneFahrzeuge: Array<"kdo" | "tlf-a-4000" | "lfa-b" | "mtf">;
  // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-Editor.
  // Nur befuellt wenn kategorieFuer(einsatzart) === "technisch". Wird beim
  // Save 1:1 in body.technischeStatistik gemappt.
  tsPersonAnzahl: number;
  tsPersonTot: number;
  tsPersonVerletzt: number;
  tsPersonUnverletzt: number;
  tsTierGross: number;
  tsTierKlein: number;
  tsUrsache: string;
  tsUrsacheFreitext: string;
  tsHauptTaetigkeit: string;
  tsWeitereTaetigkeiten: string[];
  tsGefaehrlicheStoffe: string[];
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
  einsatzort: "",
  verrechenbar: false,
  oelSaecke: 0,
  bearbeiterPersonId: null,
  reservePersonIds: [],
  zugewieseneFahrzeuge: [],
  // Issue 16 (Einsatz-Test 2026-06-02): Technisch-Statistik-Defaults.
  tsPersonAnzahl: 0,
  tsPersonTot: 0,
  tsPersonVerletzt: 0,
  tsPersonUnverletzt: 0,
  tsTierGross: 0,
  tsTierKlein: 0,
  tsUrsache: "",
  tsUrsacheFreitext: "",
  tsHauptTaetigkeit: "",
  tsWeitereTaetigkeiten: [],
  tsGefaehrlicheStoffe: [],
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
  // AUDIT-01/EL-09 (Audit 2026-06-12): Einsatz ueber Mitternacht — liegt die
  // eingegebene Uhrzeit mehr als 2 Minuten VOR der Alarmierung, ist der
  // Folgetag gemeint ("Brand aus 00:30" bei Alarm 23:40 → naechster Tag).
  // Logik-Vorbild: hhmmToISOAt in BerichtPage.tsx.
  if (d.getTime() < ref.getTime() - 2 * 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/**
 * OPT-5 (Audit 2026-06-03): Eine Stelle der Wahrheit für die Abschluss-Pfad-
 * Entscheidung. Früher lebte die verschachtelte Bedingungs-Matrix (blockiert /
 * Brand-Wizard / Confirm) verstreut im JSX (disabled-Prop + onClick + style),
 * was einen zukünftigen Edit fehleranfällig machte. Diese reine Funktion bildet
 * das bestehende Verhalten 1:1 ab und ist isoliert testbar.
 *
 *   "blocked" → Button disabled (Schreibschutz / kein Einsatz / busy / offene Fzgber)
 *   "wizard"  → Brand-Einsatz ohne Statistik → erst Brand-Wizard
 *   "confirm" → direkt ins Abschluss-Bestätigungs-Modal
 */
/**
 * #167 (Test 2026-06-03): Leitet die syBOS-Haupttätigkeit aus der gewählten
 * Einsatzart ab — als Vorbelegung im Florian-Editor. Trifft die typischsten
 * Fälle einer FF Eberstalzell; nicht-passende Einsatzarten geben null zurück
 * und der Editor bleibt leer. Reine Funktion, kein Side-Effect.
 *
 * Die Strings rechts MÜSSEN exakt einem Eintrag in HAUPT_TAETIGKEIT_TECHNISCH
 * entsprechen, sonst rendert das Dropdown den Wert nicht.
 */
function ableiteHauptTaetigkeitAusEinsatzart(einsatzart?: string): string | null {
  const a = (einsatzart ?? "").toLowerCase();
  if (!a) return null;
  if (a.includes("ölspur") || a.includes("ölbind")) return "Ölspur / Ölbindung";
  if (a.includes("verkehrsunfall") || a.startsWith("vu"))
    return "Verkehrsunfall (Fahrzeugbergung, Eingeklemmt)";
  if (a.includes("sturm") || a.includes("schnee")) return "Sturm/Schneeschaden";
  if (a.includes("überflut") || a.includes("ueberflut") || a.includes("wasserschad"))
    return "Wassergefahr (Überschwemmung, Wasserschaden)";
  if (a.includes("türöffnung") || a.includes("tueroeffnung")) return "Türöffnung";
  if (a.includes("pump")) return "Pumparbeiten";
  if (a.includes("tierrett") || a.includes("tier")) return "Tierrettung allgemein";
  if (a.includes("aufzug")) return "Aufzugsbergung";
  if (a.includes("personenrett")) return "Personenrettung allgemein";
  if (a.includes("höhenrett") || a.includes("hoehenrett")) return "Höhenrettung";
  if (a.includes("verkehrsabsich") || a.includes("verkehrsregel"))
    return "Verkehrsabsicherung";
  if (a.includes("straßenrein") || a.includes("strassenrein"))
    return "Beseitigung Hindernis Verkehrsraum";
  if (a.includes("gefähr") || a.includes("gefahr"))
    return "Gefährliche Stoffe austretend";
  return null;
}

type AbschlussPfad = "blocked" | "wizard" | "confirm";
function entscheideAbschlussPfad(p: {
  schreibschutz: boolean;
  hatEinsatzId: boolean;
  busy: boolean;
  blockiert: boolean;
  istBrand: boolean;
  hatBrandStatistik: boolean;
}): AbschlussPfad {
  if (p.schreibschutz || !p.hatEinsatzId || p.busy || p.blockiert) return "blocked";
  if (p.istBrand && !p.hatBrandStatistik) return "wizard";
  return "confirm";
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
  // Issue 16 (Einsatz-Test 2026-06-02): Funktionaer-gepflegte Liste fuer
  // "Gefaehrliche Stoffe". Default leer — wird via /api/config/gefaehrliche-
  // stoffe gefuellt. Wenn das Backend keine Liste hat, kann der User nur
  // ueber das Freitext-Feld neue Eintraege hinzufuegen.
  const [gefaehrlicheStoffeAll, setGefaehrlicheStoffeAll] = useState<string[]>([]);
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
      try {
        // Issue 16: Gefaehrliche-Stoffe-Liste vom Backend.
        const r3 = await apiCall<{ data?: { items?: string[] } }>(
          "/api/config/gefaehrliche-stoffe",
        );
        if (!cancelled && Array.isArray(r3.data?.items)) {
          setGefaehrlicheStoffeAll(r3.data!.items.map(String));
        }
      } catch {
        // Leer-Liste bleibt aktiv — User-Freitext bleibt moeglich.
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
  /** U-21: Strg+S Toast. */
  const [savedToastAt, setSavedToastAt] = useState<number | null>(null);
  // ── AUDIT-01 (Audit 2026-06-12): Save-Hardening — Spiegel-Refs ────────────
  // Diese Refs werden bei JEDEM Render aktualisiert, damit Intervalle,
  // Keydown-Handler und Flush-Pfade nie mit veralteten Closures arbeiten.
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const editorDirtyRef = useRef(editorDirty);
  editorDirtyRef.current = editorDirty;
  const saveBusyRef = useRef(saveBusy);
  saveBusyRef.current = saveBusy;
  const aktiverEinsatzIdRef = useRef(aktiverEinsatzId);
  aktiverEinsatzIdRef.current = aktiverEinsatzId;
  const schreibschutzRef = useRef(aktiverEinsatz?.schreibschutz === true);
  schreibschutzRef.current = aktiverEinsatz?.schreibschutz === true;
  /** AUDIT-01 (1): immer die FRISCHESTE saveEditor-Closure — wird nach der
   *  saveEditor-Definition bei jedem Render zugewiesen. Behebt die
   *  Stale-Closure beim Strg+S-Handler und ermoeglicht den 15-s-Retry. */
  const saveEditorRef = useRef<() => Promise<void>>(async () => undefined);
  /** AUDIT-01 (2): Cross-Save-Sperre — fuer WELCHEN Einsatz ist der Editor
   *  dirty? Nur wenn diese ID mit aktiverEinsatzId uebereinstimmt, darf ein
   *  Auto-Save laufen. Damit kann KEIN Pfad mehr Editor-Daten von Einsatz A
   *  per PUT auf Einsatz B schreiben. */
  const dirtyEinsatzIdRef = useRef<string | null>(null);

  // Auto-Save: nach 1,5 s ohne weitere Tipparbeit speichern. Manueller
  // "Speichern"-Button wurde entfernt — der User soll sich nichts merken muessen.
  useEffect(() => {
    const ist_schreibgeschuetzt = aktiverEinsatz?.schreibschutz === true;
    if (!editorDirty || !aktiverEinsatzId || ist_schreibgeschuetzt) return;
    // AUDIT-01 (2): GUARD — der Editor traegt Daten eines ANDEREN Einsatzes
    // (z. B. Poll hat waehrend Tipparbeit umgeschaltet). Kein Save.
    if (dirtyEinsatzIdRef.current !== aktiverEinsatzId) return;
    const handle = setTimeout(() => {
      void saveEditor();
    }, 1500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editorDirty, aktiverEinsatzId, aktiverEinsatz?.schreibschutz]);

  // U-21: Strg+S / Cmd+S triggert sofortiges saveEditor + zeigt Toast.
  // AUDIT-01 (1): via saveEditorRef — der Handler haengt an
  // [aktiverEinsatzId, schreibschutz]; ohne Ref speicherte er nach Minuten
  // Tipparbeit den EDITOR-STAND VOM EFFEKT-ZEITPUNKT (Rollback-Bug).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const ist_schreibgeschuetzt = aktiverEinsatz?.schreibschutz === true;
        if (aktiverEinsatzId && !ist_schreibgeschuetzt) {
          // Cross-Save-Sperre auch hier: dirty fuer einen anderen Einsatz
          // → kein Save (Daten wuerden am falschen Doc landen).
          if (
            editorDirtyRef.current &&
            dirtyEinsatzIdRef.current !== aktiverEinsatzId
          ) {
            return;
          }
          void saveEditorRef.current();
          setSavedToastAt(Date.now());
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiverEinsatzId, aktiverEinsatz?.schreibschutz]);

  // AUDIT-01 (5)/ING-05: Auto-Save-Retry — ein einzelner fehlgeschlagener
  // Save (Funkloch, 12-s-Timeout) blieb frueher haengen bis zur naechsten
  // Tipparbeit. Alle 15 s: wenn dirty und kein Save laeuft → erneut versuchen.
  useEffect(() => {
    const t = setInterval(() => {
      if (
        editorDirtyRef.current &&
        !saveBusyRef.current &&
        !schreibschutzRef.current &&
        dirtyEinsatzIdRef.current === aktiverEinsatzIdRef.current
      ) {
        void saveEditorRef.current();
      }
    }, 15_000);
    return () => clearInterval(t);
  }, []);

  // AUDIT-01 (6)/ING-05: Editor-Draft nach localStorage spiegeln (700 ms
  // debounced, Muster: Draft-Mirror der BerichtPage). Reload/Crash bei
  // saveErr verliert damit keine Florian-Tipparbeit mehr — der Seed-Effekt
  // stellt den Draft wieder her, solange er juenger als der Server-Stand ist.
  useEffect(() => {
    if (!editorDirty || !aktiverEinsatzId) return;
    const id = aktiverEinsatzId;
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(
          `hotdoc.zentrale-draft.${id}`,
          JSON.stringify({ editor: editorRef.current, savedAt: new Date().toISOString() }),
        );
      } catch {
        // Quota/Private-Mode — Draft ist Best-Effort, Auto-Save bleibt Pflichtpfad.
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [editor, editorDirty, aktiverEinsatzId]);

  useEffect(() => {
    if (savedToastAt === null) return;
    const t = setTimeout(() => setSavedToastAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedToastAt]);
  // Abschluss-Workflow: separater State-Slot, damit der Confirm-Dialog
  // unabhängig vom normalen Save funktioniert und der Einsatzleiter eine
  // explizite Bestätigung sehen muss bevor der Schreibschutz aktiviert wird.
  const [abschlussConfirmOpen, setAbschlussConfirmOpen] = useState(false);
  const [abschlussBusy, setAbschlussBusy] = useState(false);
  const [abschlussErr, setAbschlussErr] = useState<string | null>(null);
  const [abschlussOk, setAbschlussOk] = useState<string | null>(null);
  /** U-17: Override-Confirm — wenn der EL trotz noch offener Fahrzeugberichte
   *  abschliessen will, muss er einen Grund (min 10 Zeichen) angeben. Der
   *  Grund wandert ins Audit-Log und auf das PDF. */
  const [abschlussOverrideOpen, setAbschlussOverrideOpen] = useState(false);
  const [abschlussOverrideGrund, setAbschlussOverrideGrund] = useState("");
  /** Issue 8 (Einsatz-Test 2026-06-02): Verrechnungs-Stand beim Abschluss
   *  setzen. Wird vom Backend auf alle Fahrzeugberichte cascadiert. */
  const [abschlussVerrechenbar, setAbschlussVerrechenbar] = useState(false);
  const [abschlussRechnungsadresse, setAbschlussRechnungsadresse] = useState("");
  /** Issue 17 (Einsatz-Test 2026-06-02): Brand-Abschluss-Wizard.
   *  Wird VOR handleAbschluss() bei kategorieFuer(einsatzart)==="brand"
   *  geoeffnet. Cancel mid-flow schreibt NICHTS — der User kann den
   *  klassischen Abschluss-Confirm sofort danach trotzdem benutzen. */
  const [brandWizardOpen, setBrandWizardOpen] = useState(false);
  /** AUDIT-07/EL-13: Brand-Statistik nachtraeglich bearbeiten — im
   *  Edit-Modus oeffnet handleBrandWizardComplete danach NICHT das
   *  Abschluss-Confirm, sondern zeigt nur den Gespeichert-Hinweis. */
  const brandWizardEditModeRef = useRef(false);
  /** AUDIT-07/EL-11a: Persistente Abschluss-Quittung — ueberlebt das
   *  Poll-Wegfallen des abgeschlossenen Einsatzes aus der Tab-Leiste.
   *  Reset bei neuem Abschluss (Overwrite) oder manuellem Schliessen. */
  const [letzterAbschluss, setLetzterAbschluss] = useState<{
    einsatzId: string;
    zeit: string;
    berichtNummer?: string;
  } | null>(null);
  /** AUDIT-07: Tab-X-Pfad wechselt den Einsatz UND seeded das Abschluss-
   *  Confirm im selben Handler — der Reset-Effekt unten darf dieses
   *  Seeding nicht gleich wieder wegwischen. */
  const abschlussSeedGuardRef = useRef(false);
  /** AUDIT-09/EL-06: Lotsendienst-Erfolgsbanner (~12 s sichtbar) — der
   *  Poll-Filter #165 wirft Lotsendienst aus der Florian-Ansicht, ohne
   *  Banner sah die Anlage wie ein stiller Fehlschlag aus. */
  const [lotsendienstHinweis, setLotsendienstHinweis] = useState<string | null>(null);
  /** AUDIT-09/EL-06: Doppel-Anlage-Guard — Button 30 s nach Anlage sperren. */
  const [lotsendienstAngelegtAt, setLotsendienstAngelegtAt] = useState<number | null>(null);
  useEffect(() => {
    if (!lotsendienstHinweis) return;
    const t = setTimeout(() => setLotsendienstHinweis(null), 12_000);
    return () => clearTimeout(t);
  }, [lotsendienstHinweis]);
  useEffect(() => {
    if (lotsendienstAngelegtAt === null) return;
    const t = setTimeout(() => setLotsendienstAngelegtAt(null), 30_000);
    return () => clearTimeout(t);
  }, [lotsendienstAngelegtAt]);
  const lotsendienstGesperrt = lotsendienstAngelegtAt !== null;
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
    // AUDIT-01 (2): merken, FUER WELCHEN Einsatz die Tipparbeit gilt —
    // Grundlage der Cross-Save-Sperre in allen Save-Pfaden.
    dirtyEinsatzIdRef.current = aktiverEinsatzId;
    setEditorDirty(true);
    setSaveOk(null);
  }

  /**
   * AUDIT-01 (3): Einsatz-Wechsel mit Flush — ungespeicherte Tipparbeit wird
   * VOR dem Wechsel gegen den ALTEN Einsatz gespeichert. saveEditorRef haelt
   * zu diesem Zeitpunkt noch die Closure mit dem alten aktiverEinsatz
   * (refIso fuer Zeitmarken, kategorieFuer) — der Save geht also korrekt auf
   * den alten Einsatz. setEditorDirty(false) gibt den Seed-Effekt fuer den
   * neuen Einsatz frei. BEWUSST NICHT: "immer gegen dirtyEinsatzIdRef-ID
   * speichern" — das wuerde A-Daten mit B-Datum/-Kategorie speichern.
   */
  function wechsleAktivenEinsatz(fullId: string): void {
    if (fullId === aktiverEinsatzId) return;
    if (editorDirty) {
      void saveEditorRef.current();
      setEditorDirty(false);
    }
    setAktiverEinsatzId(fullId);
  }

  // AUDIT-07/EL-10: kein Abschluss-State-Leak zwischen Einsaetzen —
  // Verrechenbar/Rechnungsadresse/Override-Grund gehoeren immer genau zu
  // EINEM Einsatz und werden beim Wechsel zurueckgesetzt.
  useEffect(() => {
    if (abschlussSeedGuardRef.current) {
      // Tab-X-Pfad hat soeben gewechselt UND geseedet — Reset ueberspringen.
      abschlussSeedGuardRef.current = false;
      return;
    }
    setAbschlussVerrechenbar(false);
    setAbschlussRechnungsadresse("");
    setAbschlussOverrideGrund("");
  }, [aktiverEinsatzId]);

  // Aktive Einsätze vom Backend laden — der erste aktive wird die Quelle
  // für PDF/Spickzettel/Chronik-Sync. Refresht alle 30 s.
  // Während der User editiert (`editorDirty=true`) wird der Editor-State
  // NICHT überschrieben, sonst verliert er seine Tipparbeit zwischen den
  // Polls. Nur das Backend-Doc selbst wird aktualisiert.
  // AUDIT-01 (8)/ING-10-Teil: laufender Poll → naechsten Tick ueberspringen.
  // Verhindert Request-Stau (12-s-Timeout vs. 10-s-Intervall) und Out-of-
  // Order-Antworten, die den Einsatz-State zuruecksetzen.
  const einsatzPollInFlightRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const load = async (force = false) => {
      // force = forciertes Reload nach onCreated/Reaktivierung — darf einen
      // laufenden Poll ueberholen, der den neuen Einsatz noch nicht kennt.
      if (einsatzPollInFlightRef.current && !force) return;
      einsatzPollInFlightRef.current = true;
      try {
        const r = await apiCall<{ items: EinsatzApiDoc[] }>(
          "/api/einsaetze?status=aktiv",
        );
        if (cancelled) return;
        // #165 (User-Wunsch 2026-06-03): Lotsendienst-Einsätze erscheinen NIE
        // als Hauptbericht in der Florian-Zentrale. Lotsendienst lebt
        // ausschliesslich als Fahrzeugbericht (KDO/TLF). → vor Anzeige filtern.
        const filtered = r.items.filter((e) => e.einsatzTyp !== "lotsendienst");
        setAktiveEinsaetze(filtered);
        // Auto-Select: wenn aktuell ausgewaehlter Einsatz nicht mehr in der Liste
        // (z. B. abgeschlossen oder gewipt) → auf den ersten verbleibenden umschalten.
        setAktiverEinsatzId((prev) => {
          if (prev && filtered.some((e) => e._id === prev)) return prev;
          // Wenn der gerade neu angelegte Einsatz noch nicht in der Liste
          // ist (Backend braucht 5-10 s bis Cache-Refresh), nicht ueberschreiben.
          // Greift maximal 30 s — danach erwarten wir dass er definitiv da ist.
          const justCreated = justCreatedRef.current;
          if (justCreated && Date.now() - justCreated.ts < 30_000) {
            return justCreated.id;
          }
          return filtered[0]?._id ?? null;
        });
        if (filtered.length === 0) {
          setFahrzeugberichte([]);
        }
      } catch {
        // Backend nicht erreichbar — bleibt beim aktuellen Stand (kein
        // ungewollter Reset bei kurzem Netz-Wackler).
      } finally {
        einsatzPollInFlightRef.current = false;
      }
    };
    // Reload-Hook fuer onCreated: ruft direkt load() ohne aufs naechste
    // Polling-Intervall zu warten.
    reloadAktiveEinsaetzeRef.current = () => {
      void load(true);
    };
    void load();
    // Polling alle 10 s (statt 30 s) — damit Multi-Tablet-Updates schneller
    // sichtbar sind. Backend-API ist billig (couchdb _all_docs mit prefix).
    const t = setInterval(() => {
      if (pollingPaused()) return; // Akku-Gate: kein Einsatz-Poll im Standby
      void load();
    }, 10_000);
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
    const t = setInterval(() => {
      if (pollingPaused()) return; // Akku-Gate: keine Fahrzeugbericht-Polls im Standby
      void load();
    }, 15_000);
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
    const t = setInterval(() => {
      if (pollingPaused()) return; // Akku-Gate: kein Positions-Poll im Standby
      void tick();
    }, 3000);
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
        // AUDIT-09/KDT-06: Liste cachen — beim naechsten Funkloch-Boot ist
        // der PersonPicker trotzdem befuellt.
        savePersonenCache(list);
      } catch {
        // AUDIT-09/KDT-06: kein leerer catch mehr — gecachte Personalliste
        // als Fallback (leicht veraltet ist besser als leer/nur IDs).
        const cached = loadPersonenCache();
        if (!cancelled && cached) {
          setPersonen((cur) => (cur.length > 0 ? cur : cached));
        }
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
    // AUDIT-01 (6): Draft-Restore — liegt ein lokaler Editor-Draft vor, der
    // JUENGER ist als der Server-Stand, hat die lokale Tipparbeit Vorrang
    // (z. B. Reload nach Save-Fehler/Crash). setEditorDirty(true) loest den
    // Auto-Save aus; nach erfolgreichem PUT loescht saveEditor den Draft.
    if (aktiverEinsatz.schreibschutz !== true) {
      const draftKey = `hotdoc.zentrale-draft.${aktiverEinsatz._id}`;
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as {
            editor?: Partial<EditorState>;
            savedAt?: string;
          };
          const draftZeit = draft.savedAt ? new Date(draft.savedAt).getTime() : 0;
          const docZeit = aktiverEinsatz.geaendertAm
            ? new Date(aktiverEinsatz.geaendertAm).getTime()
            : 0;
          if (draft.editor && draftZeit > docZeit) {
            // Defensiv ueber EMPTY_EDITOR mergen — ein Draft aus einer
            // aelteren App-Version darf keine Felder fehlen lassen.
            setEditor({ ...EMPTY_EDITOR, ...draft.editor });
            dirtyEinsatzIdRef.current = aktiverEinsatz._id;
            setEditorDirty(true);
            return;
          }
          // Veralteter Draft — Server-Stand gewinnt, Draft aufraeumen.
          localStorage.removeItem(draftKey);
        }
      } catch {
        // Korrupter Draft/Storage-Fehler — ignorieren, Server-Stand seeden.
      }
    }
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
      einsatzort: aktiverEinsatz.einsatzort ?? "",
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
      // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik aus Doc seeden.
      // Wenn `ursache` nicht in URSACHE_TECHNISCH liegt, faellt der Wert in
      // tsUrsacheFreitext, damit der User ihn weiter editieren kann.
      tsPersonAnzahl:
        aktiverEinsatz.technischeStatistik?.personenRettung?.anzahlPersonen ?? 0,
      tsPersonTot: aktiverEinsatz.technischeStatistik?.personenRettung?.tot ?? 0,
      tsPersonVerletzt:
        aktiverEinsatz.technischeStatistik?.personenRettung?.verletzt ?? 0,
      tsPersonUnverletzt:
        aktiverEinsatz.technischeStatistik?.personenRettung?.unverletzt ?? 0,
      tsTierGross: aktiverEinsatz.technischeStatistik?.tierRettung?.gross ?? 0,
      tsTierKlein: aktiverEinsatz.technischeStatistik?.tierRettung?.klein ?? 0,
      tsUrsache:
        aktiverEinsatz.technischeStatistik?.ursache &&
        (URSACHE_TECHNISCH as readonly string[]).includes(
          aktiverEinsatz.technischeStatistik.ursache,
        )
          ? aktiverEinsatz.technischeStatistik.ursache
          : "",
      tsUrsacheFreitext:
        aktiverEinsatz.technischeStatistik?.ursache &&
        !(URSACHE_TECHNISCH as readonly string[]).includes(
          aktiverEinsatz.technischeStatistik.ursache,
        )
          ? aktiverEinsatz.technischeStatistik.ursache
          : "",
      // #167 (Test 2026-06-03): Wenn keine Haupttätigkeit am Doc gespeichert
      // ist, aus der Einsatzart ableiten. Greift nur als VORBELEGUNG —
      // beim ersten Speichern landet der echte Wert am Doc und überschreibt
      // den Default nicht mehr. Bewusst nur die häufigsten Treffer.
      tsHauptTaetigkeit:
        aktiverEinsatz.technischeStatistik?.hauptTaetigkeit ??
        ableiteHauptTaetigkeitAusEinsatzart(aktiverEinsatz.einsatzart) ??
        "",
      tsWeitereTaetigkeiten:
        aktiverEinsatz.technischeStatistik?.weitereTaetigkeiten ?? [],
      tsGefaehrlicheStoffe:
        aktiverEinsatz.technischeStatistik?.gefaehrlicheStoffe ?? [],
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
    // AUDIT-01 (4)/ING-06: Save-Race-Schutz — Snapshot des Editor-Stands,
    // der jetzt gespeichert wird. Tippt der User WAEHREND des PUTs weiter,
    // ist editorRef.current nach dem PUT ein anderes Objekt (patchEditor
    // erzeugt neue Objekte) → dirty bleibt stehen, der Debounce speichert
    // die Nacharbeit 1,5 s spaeter. Nichts verschwindet mehr.
    const snapshot = editor;
    try {
      const refIso = aktiverEinsatz?.alarmierungZeit ?? new Date().toISOString();
      const lage = hhmmToIso(editor.lageUnterKontrolleHHMM, refIso);
      const brand = hhmmToIso(editor.brandAusHHMM, refIso);

      // #1 (Test 2026-06-03): Wenn der EL den Einsatzort korrigiert, die neue
      // Adresse forward-geocoden und die Koordinaten mitschreiben — sonst
      // bleibt die Lagekarte (nutzt koordinaten) auf der alten Position
      // ("kein Match mit der Karte"). Best-effort, blockt den Save nicht.
      let neueKoordinaten: { lat: number; lng: number } | null = null;
      const ortTrim = editor.einsatzort.trim();
      if (
        ortTrim &&
        ortTrim !== (aktiverEinsatz?.einsatzort ?? "") &&
        !/^GPS\s/i.test(ortTrim)
      ) {
        try {
          const ctl = new AbortController();
          const to = setTimeout(() => ctl.abort(), 3000);
          const r = await apiCall<{ items?: Array<{ lat: number; lng: number }> }>(
            `/api/geocode?q=${encodeURIComponent(ortTrim)}`,
            { signal: ctl.signal },
          );
          clearTimeout(to);
          const first = r.items?.[0];
          if (first && typeof first.lat === "number" && typeof first.lng === "number") {
            neueKoordinaten = { lat: first.lat, lng: first.lng };
          }
        } catch {
          // Geocode-Timeout/Fehler → Adresse trotzdem speichern, Karte bleibt.
        }
      }

      const body: Record<string, unknown> = {
        ...(neueKoordinaten ? { koordinaten: neueKoordinaten } : {}),
        // #157: Florian darf den Einsatzort korrigieren (Auto-Übernahme aus
        // BlaulichtSMS liegt manchmal daneben). Nur senden wenn nicht leer
        // — sonst löscht ein versehentlicher Patch die Adresse.
        ...(editor.einsatzort.trim() ? { einsatzort: editor.einsatzort.trim() } : {}),
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

      // Issue 16 (Einsatz-Test 2026-06-02): Technisch-Statistik nur bei
      // Einsatzkategorie "technisch" speichern. Bei "brand" landet der
      // entsprechende Block via BrandAbschlussWizard. Wir loeschen den
      // Block bei reinen technischen Einsaetzen NIE — der Sachbearbeiter
      // editiert die Werte ueber mehrere Saves hinweg.
      const istTechnisch =
        kategorieFuer(aktiverEinsatz?.einsatzart) === "technisch";
      if (istTechnisch) {
        const ursacheFinal =
          editor.tsUrsacheFreitext.trim() || editor.tsUrsache || undefined;
        const ts: Record<string, unknown> = {
          personenRettung: {
            anzahlPersonen: Math.max(0, Math.floor(editor.tsPersonAnzahl)),
            tot: Math.max(0, Math.floor(editor.tsPersonTot)),
            verletzt: Math.max(0, Math.floor(editor.tsPersonVerletzt)),
            unverletzt: Math.max(0, Math.floor(editor.tsPersonUnverletzt)),
          },
          tierRettung: {
            gross: Math.max(0, Math.floor(editor.tsTierGross)),
            klein: Math.max(0, Math.floor(editor.tsTierKlein)),
          },
          weitereTaetigkeiten: editor.tsWeitereTaetigkeiten,
          gefaehrlicheStoffe: editor.tsGefaehrlicheStoffe,
        };
        if (ursacheFinal) ts.ursache = ursacheFinal;
        if (editor.tsHauptTaetigkeit) ts.hauptTaetigkeit = editor.tsHauptTaetigkeit;
        body.technischeStatistik = ts;
      }

      await apiCall(`/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`, {
        method: "PUT",
        body,
      });
      // AUDIT-01 (4): dirty nur loeschen wenn der Editor seit dem Snapshot
      // unveraendert ist (Referenzvergleich genuegt). Sonst bleibt dirty —
      // die Nacharbeit wird vom Debounce/Retry nachgespeichert.
      if (editorRef.current === snapshot) {
        setEditorDirty(false);
        // AUDIT-01 (6): Stand ist am Server — Editor-Draft aufraeumen.
        try {
          localStorage.removeItem(`hotdoc.zentrale-draft.${aktiverEinsatzId}`);
        } catch {
          // egal — Draft wird spaeter ueber den Seed-Effekt ausgemistet.
        }
      }
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
      // AUDIT-05 (ING-12): Klartext + Handlungsanweisung statt HTTP-Code.
      setSaveErr(`Speichern fehlgeschlagen: ${describeApiError(e)}`);
    } finally {
      setSaveBusy(false);
    }
  }
  // AUDIT-01 (1): Zuweisung bei JEDEM Render — saveEditorRef zeigt immer auf
  // die frischeste Closure (aktueller editor + aktiverEinsatz). KEIN useEffect
  // noetig; Strg+S, 15-s-Retry und Tab-Wechsel-Flush greifen darauf zu.
  saveEditorRef.current = saveEditor;

  function toggleArrayItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
  }

  /**
   * AUDIT-07/EL-10: Gemeinsames Seeding fuer das Abschluss-Confirm — aufgerufen
   * vom CTA (Pfad "confirm"), von handleBrandWizardComplete und vom Tab-X-Pfad.
   * Frueher startete das Confirm immer mit verrechenbar=false bzw. dem
   * State-Leak des vorherigen Einsatzes — der im Editor gesetzte Stand wurde
   * beim Abschluss-Cascade stillschweigend ueberschrieben.
   *
   * `zielDoc` wird vom Tab-X-Pfad uebergeben (frisch gewechselter Einsatz —
   * die Closure haelt dort noch editor/aktiverEinsatz des ALTEN Einsatzes).
   */
  function openAbschlussConfirm(zielDoc?: EinsatzApiDoc | null): void {
    const doc = zielDoc ?? aktiverEinsatz;
    const istAktiverEinsatz = !zielDoc || zielDoc._id === aktiverEinsatzId;
    // Beim aktiven Einsatz hat der Editor den frischesten Verrechenbar-Stand
    // (Tipparbeit kann noch vor dem Auto-Save liegen), bei Fremd-Tab das Doc.
    setAbschlussVerrechenbar(
      istAktiverEinsatz
        ? editor.verrechenbar
        : (doc?.verrechnung?.verrechenbar ?? false),
    );
    setAbschlussRechnungsadresse(doc?.verrechnung?.rechnungsadresse ?? "");
    setAbschlussErr(null);
    setAbschlussOk(null);
    setAbschlussConfirmOpen(true);
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
   *
   * AUDIT-07/EL-11b: Rueckgabe `Promise<boolean>` — true bei Erfolg UND beim
   * 409-already_closed-Pfad (Ziel "Einsatz ist zu" erreicht), false bei
   * Fehler. Die Aufrufer (Override-Modal) entscheiden damit synchron, ob sie
   * schliessen — statt das stale abschlussErr aus der Closure zu lesen.
   */
  async function handleAbschluss(overrideGrund?: string): Promise<boolean> {
    if (!aktiverEinsatzId) {
      setAbschlussErr("Kein aktiver Einsatz ausgewählt.");
      return false;
    }
    setAbschlussBusy(true);
    setAbschlussErr(null);
    setAbschlussOk(null);
    try {
      // U-17: bei Override-Pfad den Grund als Body mitschicken — Backend
      // kann ihn in den Audit-Trail/PDF uebernehmen. Der bestehende
      // Endpoint akzeptiert leeren Body, zusaetzliche Felder werden
      // ignoriert wenn das Backend sie noch nicht kennt.
      //
      // Issue 8 (Einsatz-Test 2026-06-02): verrechenbar + rechnungsadresse
      // beim Abschluss mitschicken damit das Backend sie auf alle
      // Fahrzeugberichte cascadiert.
      const body: Record<string, unknown> = {};
      if (overrideGrund) body.abschlussOverrideHinweis = overrideGrund;
      if (abschlussVerrechenbar) {
        body.verrechenbar = true;
        if (abschlussRechnungsadresse.trim()) {
          body.rechnungsadresse = abschlussRechnungsadresse.trim();
        }
      }
      // AUDIT-07/EL-11a: /abschluss liefert seit AUDIT-11 die echte
      // Berichtsnummer mit — Fallback fuer Altstaende: deriveBerichtNrFromId.
      const resp = await apiCall<{
        ok: true;
        id: string;
        rev: string;
        berichtNummer?: string;
      }>(
        `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}/abschluss`,
        Object.keys(body).length > 0 ? { method: "POST", body } : { method: "POST" },
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
      // AUDIT-07/EL-11a: persistente Quittung — bleibt stehen, auch wenn der
      // naechste Poll den abgeschlossenen Einsatz aus der Tab-Leiste nimmt.
      setLetzterAbschluss({
        einsatzId: aktiverEinsatzId,
        zeit: new Date().toISOString(),
        berichtNummer:
          resp.berichtNummer ??
          deriveBerichtNrFromId(
            aktiverEinsatzId,
            aktiverEinsatz?.einsatzart,
            aktiverEinsatz?.alarmierungZeit,
          ),
      });
      return true;
    } catch (e) {
      // AUDIT-07/EL-11b: ApiError-Status statt fragiler String-Matches
      // ("409"/"403" konnten frueher auch zufaellig im Fehlertext stehen).
      if (
        e instanceof ApiError &&
        (e.status === 409 || e.message.includes("already_closed"))
      ) {
        // 409 = bereits abgeschlossen → kein echter Fehler, nur Neu-Laden.
        let nummer: string | undefined;
        try {
          const reloaded = await apiCall<EinsatzApiDoc>(
            `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
          );
          setAktiveEinsaetze((prev) => prev.map((e2) => (e2._id === reloaded._id ? reloaded : e2)));
          nummer = reloaded.berichtNummer;
        } catch {
          // egal
        }
        setAbschlussConfirmOpen(false);
        setAbschlussOk("Einsatz war bereits abgeschlossen.");
        setLetzterAbschluss({
          einsatzId: aktiverEinsatzId,
          zeit: new Date().toISOString(),
          berichtNummer:
            nummer ??
            deriveBerichtNrFromId(
              aktiverEinsatzId,
              aktiverEinsatz?.einsatzart,
              aktiverEinsatz?.alarmierungZeit,
            ),
        });
        return true;
      }
      if (
        e instanceof ApiError &&
        (e.status === 403 || e.message.includes("insufficient_role"))
      ) {
        setAbschlussErr(
          "Sitzung veraltet — diese Anmeldung wurde noch mit der alten Rollen-Zuordnung ausgestellt. Bitte einmal neu anmelden, danach funktioniert der Abschluss.",
        );
        setAbschlussNeedsReauth(true);
        return false;
      }
      if (e instanceof ApiError && e.status === 401) {
        setAbschlussErr(
          "Sitzung abgelaufen — bitte die Seite neu laden und erneut anmelden.",
        );
        return false;
      }
      setAbschlussErr(`Abschluss fehlgeschlagen: ${describeApiError(e)}`);
      return false;
    } finally {
      setAbschlussBusy(false);
    }
  }

  /**
   * Issue 17 (Einsatz-Test 2026-06-02): Brand-Wizard-Complete-Handler.
   * Schreibt brandStatistik via PUT auf das Einsatz-Doc, danach via PUT
   * auf das objekt:<hash>-Doc (Cache fuer Wiederholungs-Einsaetze), dann
   * oeffnet das normale Abschluss-Confirm. Wenn der PUT auf das Einsatz-Doc
   * fehlschlaegt, brechen wir mit Toast ab — der Wizard kann reopened werden.
   * Fehler beim objekt:<hash>-PUT werden NICHT escaliert: der Cache ist
   * eine reine Quality-of-Life-Feature, kein Pflicht-Datenpfad.
   */
  async function handleBrandWizardComplete(bs: BrandStatistik): Promise<void> {
    if (!aktiverEinsatzId) {
      setBrandWizardOpen(false);
      setAbschlussErr("Kein aktiver Einsatz ausgewählt.");
      return;
    }
    try {
      // 1. Brand-Statistik aufs Einsatz-Doc
      await apiCall<{ ok: true; rev: string }>(
        `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
        { method: "PUT", body: { brandStatistik: bs } },
      );
      // 2. Objekt-Cache pflegen — Hash via Lookup-Endpoint holen (Server
      // hat die kanonische Implementierung von normalizeAdresse). Nur
      // wenn eine Adresse am Einsatz ist.
      const adresse = (aktiverEinsatz?.einsatzort ?? "").trim();
      if (adresse.length >= 5) {
        try {
          const lookup = await apiCall<{ ok: true; hash: string }>(
            `/api/objekte/lookup?adresse=${encodeURIComponent(adresse)}`,
          );
          if (lookup.hash) {
            await apiCall<{ ok: true; rev: string }>(
              `/api/objekte/${encodeURIComponent(lookup.hash)}`,
              {
                method: "PUT",
                body: { adresse, data: bs },
              },
            );
          }
        } catch {
          // Nicht-kritisch — Cache ist Bonus, der Einsatz-Save ist die
          // Pflicht-Persistenz. User-flow soll weiterlaufen.
        }
      }
      // 3. Lokal Einsatz-Doc refreshen damit der naechste Abschluss-Confirm
      // den brand-Statistik-Stand kennt (falls der User abbricht).
      try {
        const reloaded = await apiCall<EinsatzApiDoc>(
          `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}`,
        );
        setAktiveEinsaetze((prev) =>
          prev.map((e) => (e._id === reloaded._id ? reloaded : e)),
        );
      } catch {
        // egal
      }
      setBrandWizardOpen(false);
      // AUDIT-07/EL-13: Edit-Modus ("Brand-Statistik bearbeiten") — NUR
      // speichern + Hinweis, KEIN Abschluss-Confirm. Der Sachbearbeiter
      // korrigiert die Statistik, ohne den Abschluss-Flow anzustossen.
      if (brandWizardEditModeRef.current) {
        brandWizardEditModeRef.current = false;
        setSaveOk(
          `Brand-Statistik gespeichert · ${new Date().toLocaleTimeString("de-AT")}`,
        );
        return;
      }
      // Nach erfolgreichem Wizard direkt das normale Abschluss-Confirm
      // anzeigen (User sieht Sanity-Check + verrechenbar-Felder).
      // AUDIT-07/EL-10: via openAbschlussConfirm — seeded Verrechenbar-Stand.
      openAbschlussConfirm();
    } catch (e) {
      // AUDIT-05 (ING-12): Klartext + Handlungsanweisung statt HTTP-Code.
      setAbschlussErr(`Brand-Statistik speichern fehlgeschlagen: ${describeApiError(e)}`);
      // Wizard offen lassen — User kann nochmal probieren oder cancel
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

  // ── AUDIT-09/EL-07: Tablet-Fotos in der Florian-Chronik sichtbar ──────────
  // Die Zentrale hat die Fotos nicht in der lokalen PouchDB (die liegen am
  // aufnehmenden Tablet) — wir laden sie EINMAL pro Einsatz gesammelt via
  // GET /api/einsaetze/:id/fotos und cachen fotoId→dataUrl. Vorbild:
  // BerichtPage nutzt getLocalFotoDataUrl fuer denselben loadFoto-Prop.
  const fotoCacheRef = useRef<Map<string, string | null>>(new Map());
  const fotoLoadPromiseRef = useRef<Promise<void> | null>(null);
  const fotosLoadedForRef = useRef<string | null>(null);

  async function loadFotoFlorian(fotoId: string): Promise<string | null> {
    const einsatzId = aktiverEinsatzIdRef.current;
    if (!einsatzId) return null;
    if (fotosLoadedForRef.current !== einsatzId) {
      // Einsatz-Wechsel → Cache verwerfen und genau EINEN Fetch starten.
      // Das Promise wird gecacht — parallele loadFoto-Aufrufe der Timeline
      // warten alle auf denselben Request statt N-mal /fotos zu treffen.
      fotosLoadedForRef.current = einsatzId;
      fotoCacheRef.current = new Map();
      fotoLoadPromiseRef.current = (async () => {
        try {
          const r = await apiCall<{
            items?: Array<{ _id?: string; dataUrl?: string }>;
          }>(`/api/einsaetze/${encodeURIComponent(einsatzId)}/fotos`);
          const map = new Map<string, string | null>();
          for (const it of r.items ?? []) {
            if (typeof it._id === "string") {
              map.set(it._id, typeof it.dataUrl === "string" ? it.dataUrl : null);
            }
          }
          fotoCacheRef.current = map;
        } catch {
          // Fetch-Fehler → leerer Cache, alle Anfragen liefern null (die
          // Timeline zeigt den Im-Bericht-enthalten-Hinweis, KEIN Endlos-
          // Spinner). Naechster Einsatz-Wechsel versucht es neu.
        }
      })();
    }
    if (fotoLoadPromiseRef.current) await fotoLoadPromiseRef.current;
    return fotoCacheRef.current.get(fotoId) ?? null;
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
    const id = (eDoc._id ?? "").replace(/^einsatz:/, "");
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
  // AUDIT-01 (8): knownIds aus einem Ref statt aus der Effect-Closure — der
  // Effekt haengt nur an [aktiverEinsatzId]; ohne Ref fragte jeder 8-s-Tick
  // mit dem CHRONIK-STAND VOM EFFEKT-START an (immer groesserer Diff).
  const chronikRef = useRef<ChronikEintrag[]>([]);
  useEffect(() => {
    chronikRef.current = chronik;
  }, [chronik]);

  useEffect(() => {
    // Ohne aktiven Einsatz nichts pollen — keine Phantom-Anfragen mit
    // toter `einsatz:`-ID. Chronik bei Wechsel/Wipe ebenfalls leeren.
    if (!aktiverEinsatzId) {
      setChronik([]);
      return;
    }
    // AUDIT-01 (8): beim Einsatz-WECHSEL sofort leeren — sonst stehen die
    // Eintraege des vorigen Einsatzes bis zum ersten Tick (und darueber
    // hinaus, weil der Diff nur ANHAENGT) in der Timeline des neuen.
    setChronik([]);
    chronikRef.current = [];
    let cancelled = false;
    const tick = async () => {
      const knownIds = new Set(chronikRef.current.map((c) => c.id));
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
    const t = setInterval(() => {
      if (pollingPaused()) return; // Akku-Gate: keine Chronik-Sync im Standby
      void tick();
    }, 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiverEinsatzId]);

  return (
    <div>
      {/* HILFE + Fahrzeug-Wechsel + Handoff: Florian Eberstalzell ist
          oft das "geteilte" Tablet im FF-Haus — der Funktionaer muss
          auch hier schnell zwischen Fahrzeugen wechseln koennen (zB
          wenn er das Tablet kurz ans Mannschafts-Fahrzeug uebergibt
          bevor er selbst auf die KDO wechselt). */}
      <Topbar
        funkrufname={fahrzeug.funkrufname}
        einsatzNr={einsatzId}
        geo={geo}
        showHilfe
        onSwitchVehicle={() => setVehicleSwitcherOpen(true)}
        onHandoff={() => setHandoffOpen(true)}
      />

      <EinsatzTabs
        tabs={tabs}
        activeId={einsatzId}
        onSelect={(id) => {
          const fullId = id.startsWith("einsatz:") ? id : `einsatz:${id}`;
          // AUDIT-01 (3): Flush ungespeicherter Tipparbeit VOR dem Wechsel —
          // Tab-Wechsel binnen 1,5 s nach dem Tippen verliert nichts mehr.
          wechsleAktivenEinsatz(fullId);
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
        {/* AUDIT-09/EL-06: Lotsendienst-Erfolgsbanner — der Einsatz erscheint
            hier bewusst NICHT (#165-Filter), ohne Banner sah die Anlage wie
            ein stiller Fehlschlag aus und wurde doppelt angelegt. */}
        {lotsendienstHinweis ? (
          <section
            role="status"
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--ok-tint)",
              border: "1px solid var(--ok-border)",
              color: "var(--ok)",
              fontSize: 16.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ flex: 1 }}>{lotsendienstHinweis}</span>
            <button
              type="button"
              onClick={() => setLotsendienstHinweis(null)}
              aria-label="Hinweis schließen"
              style={{
                background: "transparent",
                border: 0,
                color: "inherit",
                cursor: "pointer",
                padding: 4,
                minHeight: 0,
                display: "inline-flex",
              }}
            >
              <X size={14} />
            </button>
          </section>
        ) : null}

        {/* AUDIT-07/EL-11a: Persistente Abschluss-Quittung — der Einsatz
            verschwindet nach dem Abschluss aus der Tab-Leiste (Poll-Filter),
            diese Karte bleibt als Beleg + PDF-Einstieg stehen. */}
        {letzterAbschluss ? (
          <section
            role="status"
            className="card"
            style={{
              marginBottom: 14,
              borderColor: "var(--ok-border)",
              background: "var(--ok-tint)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <CheckCircle2 size={22} style={{ color: "var(--ok)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 220, fontSize: 16.5, color: "var(--fg)" }}>
              <strong>Einsatz abgeschlossen</strong>
              {letzterAbschluss.berichtNummer ? (
                <>
                  {" · "}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {letzterAbschluss.berichtNummer}
                  </span>
                </>
              ) : null}
              <span style={{ color: "var(--fg-3)" }}>
                {" "}· {formatTime(letzterAbschluss.zeit)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void downloadPdf(letzterAbschluss.einsatzId)}
              disabled={downloadBusy !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--ok-border)",
                background: "var(--surface)",
                color: "var(--ok)",
                fontSize: 15.5,
                fontWeight: 700,
                cursor: downloadBusy !== null ? "wait" : "pointer",
              }}
            >
              <Download size={14} />
              {downloadBusy === "pdf" ? "Lade …" : "PDF-Bericht öffnen"}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLetzterAbschluss(null)}
              aria-label="Quittung schließen"
              title="Quittung schließen"
            >
              <X size={14} />
            </button>
          </section>
        ) : null}

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
                  style={{ background: "var(--ok)", animation: "glow-pulse 2.4s ease-in-out infinite" }}
                >
                  <Activity size={30} color="#fff" strokeWidth={2} />
                </div>
                <div>
                  <div className="alarm-tags">
                    <span className="alarm-tag" style={{ color: "var(--ok)" }}>
                      <span className="dot" style={{ background: "var(--ok)" }} />
                      Bereit
                    </span>
                    <span className="alarm-tag muted">· Florian Eberstalzell</span>
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
                      style={{ width: "auto", padding: "10px 16px", fontSize: 16.5, gap: 6, display: "inline-flex", alignItems: "center" }}
                    >
                      <Siren size={14} /> Einsatz anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setNeuerEinsatzOpen("uebung")}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 16.5, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--ok) 80%, transparent)" }}
                    >
                      <GraduationCap size={14} /> Übung anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setNeuerEinsatzOpen("lotsendienst")}
                      // AUDIT-09/EL-06: 30-s-Doppel-Anlage-Guard — direkt nach
                      // einer Lotsendienst-Anlage gesperrt, weil der Einsatz
                      // hier bewusst NICHT erscheint (#165) und ein zweiter
                      // Klick sonst ein Duplikat anlegt.
                      disabled={lotsendienstGesperrt}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 16.5, gap: 6, display: "inline-flex", alignItems: "center", background: "color-mix(in srgb, var(--warn) 80%, transparent)", ...(lotsendienstGesperrt ? { opacity: 0.55, cursor: "not-allowed" } : {}) }}
                    >
                      <MapPin size={14} /> Lotsendienst anlegen
                    </button>
                    <button
                      type="button"
                      className="cta"
                      onClick={() => setArchivOpenFlorian(true)}
                      style={{ width: "auto", padding: "10px 16px", fontSize: 16.5, gap: 6, display: "inline-flex", alignItems: "center", background: "var(--surface-2)", color: "var(--fg)", border: "1px solid var(--border-strong)" }}
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
              // #164 (Test 2026-06-03): Theme nach Einsatz-Typ.
              //  - Übung → GRÜN (--ok), klar von Alarm unterscheidbar.
              //  - Alarm/manuell → BLAU (--info), wie bisher.
              // D-02: theme-awares Tint, im Dark-Mode wird automatisch dunkler.
              background:
                einsatzTyp === "uebung"
                  ? "linear-gradient(135deg, var(--surface) 0%, var(--ok-tint) 55%, color-mix(in srgb, var(--ok) 16%, transparent) 100%)"
                  : "linear-gradient(135deg, var(--surface) 0%, var(--info-tint) 55%, var(--info-strong) 100%)",
              borderColor:
                einsatzTyp === "uebung" ? "var(--ok-border)" : "var(--blue-border)",
            }}
          >
            {/* #164: Übung-Banner ganz oben, damit der EL sofort sieht, dass es
                eine Übung ist — nie ein Einsatz. */}
            {einsatzTyp === "uebung" && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 12px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--ok)",
                  color: "#fff",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                  marginBottom: 12,
                  boxShadow: "0 4px 12px -4px rgba(4,120,87,0.45)",
                }}
              >
                <GraduationCap size={14} strokeWidth={2.4} />
                Übung
              </div>
            )}
            <div className="alarm-top">
              <div className="alarm-left">
                <div
                  className="alarm-icon"
                  style={{
                    background:
                      einsatzTyp === "uebung" ? "var(--ok)" : "var(--info)",
                  }}
                >
                  {einsatzTyp === "uebung" ? (
                    <GraduationCap size={30} color="#fff" strokeWidth={2} />
                  ) : (
                    <Activity size={30} color="#fff" strokeWidth={2} />
                  )}
                </div>
                <div>
                  <div className="alarm-tags">
                    <span
                      className="alarm-tag"
                      style={{
                        color:
                          einsatzTyp === "uebung" ? "var(--ok)" : "var(--info)",
                      }}
                    >
                      <span
                        className="dot"
                        style={{
                          background:
                            einsatzTyp === "uebung" ? "var(--ok)" : "var(--info)",
                        }}
                      />
                      Florian Eberstalzell
                    </span>
                    <span className="alarm-tag muted">
                      ·{" "}
                      {einsatzTyp === "uebung" ? "Übungsbericht" : "Hauptbericht"}
                    </span>
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
            <input
              className="input"
              value={editor.einsatzort}
              onChange={(e) => patchEditor({ einsatzort: e.target.value })}
              placeholder="Adresse (z. B. Hauptstraße 12, 4653 Eberstalzell)"
              disabled={schreibschutz}
              spellCheck
              lang="de-AT"
            />
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
                      fontSize: 17.5,
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
                      fontSize: 14,
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
                  fontSize: 17.5,
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

        {/* U-18: Pflicht-Sektion default geoeffnet — wird im jedem zweiten
            Einsatz gebraucht (Rettung, andere FF). Schluss mit "wo war der
            Tab nochmal" beim Anklicken. */}
        <SectionHead
          title="Beteiligte Stellen & Sonstige FF"
          collapsible
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
                fontSize: 12.5,
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
                fontSize: 12.5,
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
          // U-18: Oelbindemittel ist Pflichtfeld bei Verkehrsunfaellen — default offen.
          title="Ölbindemittel"
          collapsible
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
            <p style={{ margin: 0, fontSize: 16.5, color: "var(--fg-3)", flex: 1 }}>
              Aktuell <strong>{editor.oelSaecke}</strong> Säcke ausgewiesen.
              Beim PDF-Export erscheint die Markierung „Ölbindemittel verwendet" automatisch
              wenn die Anzahl &gt; 0 ist.
            </p>
          </div>
        </section>

        {/* Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik.
            Nur sichtbar bei Kategorie "technisch" — bei Brand-Einsaetzen
            uebernimmt der BrandAbschlussWizard (Issue 17) die Statistik-
            Erfassung beim Abschluss. Default-Closed weil viele Einsaetze
            nur kurze syBOS-Eintraege brauchen und der Sachbearbeiter sich
            die Bloecke nur bei Bedarf aufklappt. */}
        {kategorieFuer(aktiverEinsatz?.einsatzart) === "technisch" && (
          <>
            <SectionHead
              title="syBOS Technisch-Statistik"
              collapsible
              storageKey="ts-tech-statistik"
            />
            <section className="card">
              <div className="card-head">
                <div className="card-title">Personen- & Tierrettung · Ursache</div>
                <span className="card-meta">Übertrag in syBOS-Maske · alle Felder optional</span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="caption">Personenrettung</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                  }}
                >
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Anzahl</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsPersonAnzahl}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsPersonAnzahl: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Tot</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsPersonTot}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsPersonTot: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Verletzt</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsPersonVerletzt}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsPersonVerletzt: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Unverletzt</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsPersonUnverletzt}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsPersonUnverletzt: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="caption">Tierrettung</label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 10,
                  }}
                >
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Groß</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsTierGross}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsTierGross: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label className="caption" style={{ fontSize: 14 }}>Klein</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input num"
                      value={editor.tsTierKlein}
                      disabled={schreibschutz}
                      onChange={(e) =>
                        patchEditor({
                          tsTierKlein: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="caption">Ursache</label>
                <select
                  className="input"
                  value={editor.tsUrsache}
                  disabled={schreibschutz}
                  onChange={(e) =>
                    patchEditor({ tsUrsache: e.target.value, tsUrsacheFreitext: "" })
                  }
                >
                  <option value="">— bitte wählen —</option>
                  {URSACHE_TECHNISCH.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ marginTop: 6 }}
                  placeholder="oder Freitext (überschreibt Auswahl)"
                  value={editor.tsUrsacheFreitext}
                  disabled={schreibschutz}
                  onChange={(e) =>
                    patchEditor({ tsUrsacheFreitext: e.target.value })
                  }
                />
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="caption">Haupt-Tätigkeit</label>
                <select
                  className="input"
                  value={editor.tsHauptTaetigkeit}
                  disabled={schreibschutz}
                  onChange={(e) =>
                    patchEditor({ tsHauptTaetigkeit: e.target.value })
                  }
                >
                  <option value="">— bitte wählen —</option>
                  {HAUPT_TAETIGKEIT_TECHNISCH.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label className="caption">Weitere Tätigkeiten</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {WEITERE_TAETIGKEITEN_TECHNISCH.map((w) => {
                    const on = editor.tsWeitereTaetigkeiten.includes(w);
                    return (
                      <button
                        type="button"
                        key={w}
                        disabled={schreibschutz}
                        aria-pressed={on}
                        onClick={() =>
                          patchEditor({
                            tsWeitereTaetigkeiten: toggleArrayItem(
                              editor.tsWeitereTaetigkeiten,
                              w,
                            ),
                          })
                        }
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                          background: on ? "var(--accent)" : "transparent",
                          color: on ? "#fff" : "var(--fg)",
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: schreibschutz ? "not-allowed" : "pointer",
                          opacity: schreibschutz ? 0.55 : 1,
                          minHeight: 32,
                        }}
                      >
                        {w}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field">
                <label className="caption">Gefährliche Stoffe</label>
                {gefaehrlicheStoffeAll.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {gefaehrlicheStoffeAll.map((g) => {
                      const on = editor.tsGefaehrlicheStoffe.includes(g);
                      return (
                        <button
                          type="button"
                          key={g}
                          disabled={schreibschutz}
                          aria-pressed={on}
                          onClick={() =>
                            patchEditor({
                              tsGefaehrlicheStoffe: toggleArrayItem(
                                editor.tsGefaehrlicheStoffe,
                                g,
                              ),
                            })
                          }
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: `1px solid ${on ? "var(--warn)" : "var(--border-strong)"}`,
                            background: on ? "var(--warn)" : "transparent",
                            color: on ? "#fff" : "var(--fg)",
                            fontSize: 15,
                            fontWeight: 600,
                            cursor: schreibschutz ? "not-allowed" : "pointer",
                            opacity: schreibschutz ? 0.55 : 1,
                            minHeight: 32,
                          }}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    style={{
                      margin: "0 0 8px",
                      fontSize: 14,
                      color: "var(--fg-3)",
                      fontStyle: "italic",
                    }}
                  >
                    (Liste leer — Funktionär pflegt sie im Backoffice unter „Gefährliche Stoffe".
                    Bis dahin Freitext-Add unten verwenden.)
                  </p>
                )}
                {/* Frei-Eintrag fuer ad-hoc Stoffe die noch nicht in der Liste sind. */}
                <FreitextAddRow
                  placeholder="z. B. Diesel, Heizöl, …"
                  disabled={schreibschutz}
                  onAdd={(t) => {
                    const trim = t.trim();
                    if (!trim) return;
                    if (editor.tsGefaehrlicheStoffe.includes(trim)) return;
                    patchEditor({
                      tsGefaehrlicheStoffe: [...editor.tsGefaehrlicheStoffe, trim],
                    });
                  }}
                />
                {editor.tsGefaehrlicheStoffe.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {editor.tsGefaehrlicheStoffe.map((g) => (
                      <span
                        key={`sel-${g}`}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: "var(--warn-tint)",
                          color: "var(--warn)",
                          fontSize: 14,
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {g}
                        {!schreibschutz && (
                          <button
                            type="button"
                            aria-label={`${g} entfernen`}
                            onClick={() =>
                              patchEditor({
                                tsGefaehrlicheStoffe:
                                  editor.tsGefaehrlicheStoffe.filter((x) => x !== g),
                              })
                            }
                            style={{
                              background: "transparent",
                              border: 0,
                              color: "inherit",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 16.5,
                              lineHeight: 1,
                              minHeight: 0,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* AUDIT-07/EL-13: Brand-Statistik nachtraeglich editierbar — vor dem
            Abschluss erfasste Werte (Wizard durchlaufen, dann Tippfehler
            bemerkt) waren bisher nur durch erneutes Abschliessen erreichbar.
            Analog zur Technisch-Statistik-Sektion, aber als Wizard-Einstieg. */}
        {kategorieFuer(aktiverEinsatz?.einsatzart) === "brand" &&
          !schreibschutz &&
          aktiverEinsatz?.brandStatistik && (
            <>
              <SectionHead title="syBOS Brand-Statistik" />
              <section className="card">
                <div className="card-head">
                  <div className="card-title">Brand-Statistik erfasst</div>
                  <span className="card-meta">
                    Übertrag in syBOS-Maske · via Abschluss-Assistent
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    brandWizardEditModeRef.current = true;
                    setBrandWizardOpen(true);
                  }}
                  style={{
                    padding: "10px 16px",
                    fontSize: 16.5,
                    fontWeight: 600,
                    background: "var(--surface-2)",
                    color: "var(--fg)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 10,
                    cursor: "pointer",
                    minHeight: 44,
                  }}
                >
                  Brand-Statistik bearbeiten
                </button>
              </section>
            </>
          )}

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
              fontSize: 15,
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
                      fontSize: 12.5,
                      fontWeight: 600,
                      letterSpacing: "var(--tracking-caps)",
                      textTransform: "uppercase",
                      color: "var(--fg-3)",
                    }}
                  >
                    Sachbearbeiter Florian Eberstalzell
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
                  fontSize: 15.5,
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

          <p style={{ fontSize: 16.5, color: "var(--fg-2)", lineHeight: 1.55, margin: "0 0 14px" }}>
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
                    fontSize: 16.5,
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
                        fontSize: 14,
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
                        fontSize: 15.5,
                        animation:
                          "glass-reveal 180ms var(--ease-decel) both",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 12.5,
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
                          fontSize: 12.5,
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
                          fontSize: 12.5,
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
                              fontSize: 12.5,
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
          {/* Issue 6 (Einsatz-Test 2026-06-02): Florianstation darf ALLE
              Eintraege bearbeiten (zentrale Korrekturstelle — Funktionaer
              tippt am PC schneller als der Kdt am Tablet). Sperre: nur
              wenn der Einsatz nicht abgeschlossen ist (Schreibschutz
              kommt sonst vom Backend mit 423 zurueck). */}
          <ChronikTimeline
            eintraege={chronik}
            // AUDIT-09/EL-07: Tablet-Fotos auch in der Zentrale anzeigen —
            // laedt GET /fotos einmal pro Einsatz (Cache, siehe loadFotoFlorian).
            loadFoto={loadFotoFlorian}
            canEdit={() => !aktiverEinsatz?.schreibschutz}
            onSaveEdit={async (entryId, newText) => {
              if (!aktiverEinsatzId) return false;
              try {
                await apiCall(
                  `/api/einsaetze/${encodeURIComponent(aktiverEinsatzId)}/chronik/${encodeURIComponent(entryId)}`,
                  { method: "PUT", body: { text: newText } },
                );
                const now = new Date().toISOString();
                setChronik((prev) =>
                  prev.map((c) =>
                    c.id === entryId
                      ? {
                          ...c,
                          text: newText,
                          editiertAm: now,
                          editiertVon: "Florian Eberstalzell",
                        }
                      : c,
                  ),
                );
                return true;
              } catch {
                return false;
              }
            }}
          />
          <FlorianChronikInput
            einsatzId={aktiverEinsatzId}
            // AUDIT-09/EL-03-UI: bei Schreibschutz gesperrt + Hinweis statt
            // Eingaben, die der Server ohnehin mit 423 ablehnt.
            schreibschutz={schreibschutz}
            onAdded={(eintrag) =>
              setChronik((prev) =>
                [...prev, eintrag].sort(
                  (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
                ),
              )
            }
            // AUDIT-09/EL-03-UI: Server hat den Eintrag endgueltig abgelehnt
            // (404/423) → optimistischen Eintrag wieder entfernen.
            onRejected={(entryId) =>
              setChronik((prev) => prev.filter((c) => c.id !== entryId))
            }
          />
        </section>

        {/* AUDIT-12/EL-04: Sektion heisst jetzt "Abschluss & PDF" und startet
            OFFEN (kein defaultClosed mehr) — der rote Abschluss-CTA und der
            PDF-Button waren auf frischen Geraeten unsichtbar ("kein
            Abschluss-Knopf gefunden", echtes Testfeedback). storageKey bleibt:
            wer bewusst zugeklappt hat, behaelt seine Wahl. */}
        <SectionHead
          title="Abschluss & PDF"
          collapsible
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
                fontSize: 16.5,
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
                fontSize: 15,
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
                fontSize: 15,
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
                    fontSize: 15,
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
            // OPT-5 (Audit 2026-06-03): EINE Pfad-Entscheidung, von disabled +
            // onClick gemeinsam genutzt.
            const abschlussPfad = entscheideAbschlussPfad({
              schreibschutz,
              hatEinsatzId: !!aktiverEinsatzId,
              busy: abschlussBusy,
              blockiert,
              istBrand: kategorieFuer(aktiverEinsatz?.einsatzart) === "brand",
              hatBrandStatistik: !!aktiverEinsatz?.brandStatistik,
            });
            const abschlussBlocked = abschlussPfad === "blocked";
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
                    // OPT-5 (Audit 2026-06-03): Pfad-Wahl aus entscheideAbschlussPfad.
                    // Issue 17: Bei Brand-Einsaetzen erst den syBOS-Statistik-Wizard,
                    // dann das Confirm (handleBrandWizardComplete öffnet es danach).
                    if (abschlussPfad === "wizard") {
                      setBrandWizardOpen(true);
                      return;
                    }
                    if (abschlussPfad === "confirm") {
                      // AUDIT-07/EL-10: Confirm mit Verrechenbar-Seeding
                      // aus dem Editor-Stand oeffnen.
                      openAbschlussConfirm();
                    }
                  }}
                  disabled={abschlussBlocked}
                  style={
                    abschlussBlocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined
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
                      {/* U-17: Override-Link — fuer den seltenen Fall, dass der EL
                          den Einsatz trotz offener Fahrzeugberichte schliessen muss
                          (Tablet kaputt, Kdt im Krankenstand). Mit Grund-Pflicht. */}
                      <button
                        type="button"
                        onClick={() => {
                          setAbschlussOverrideGrund("");
                          setAbschlussErr(null);
                          setAbschlussOverrideOpen(true);
                        }}
                        style={{
                          display: "block",
                          marginTop: 8,
                          background: "transparent",
                          border: 0,
                          color: "var(--warn)",
                          fontSize: 15,
                          fontWeight: 600,
                          textDecoration: "underline",
                          cursor: "pointer",
                          padding: 0,
                          minHeight: 0,
                        }}
                      >
                        Trotzdem abschliessen (mit Grund)
                      </button>
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

      {/* U-12: Fusszeile reduziert auf {Version, Funkrufname, FX-Toggle}.
          Handoff, Fahrzeug wechseln, Setup wandern in Topbar/About-Modal. */}
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
          title="Über HotDoc · Entwickler · Lizenz · Release-Notes · Tablet-Reset"
        >
          {APP_VERSION} · {APP_BUILD}
        </button>
        <span className="sep">·</span>
        {fahrzeug.funkrufname}
        <span className="sep">·</span>
        <FxToggle />
      </div>

      {/* U-21: Strg+S Save-Toast — kurzes Banner unten rechts, 3s sichtbar. */}
      {savedToastAt !== null && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: 28,
            right: 28,
            zIndex: 3000,
            padding: "10px 14px",
            background: "var(--ok)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 16.5,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <CheckCircle2 size={14} /> Gespeichert
        </div>
      )}

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

      {/* ─── Tab-Schließen-Dialog (X im Browser-Tab-Reiter) ───
          AUDIT-07/EL-14: das X POSTet NICHT mehr roh /abschluss. Es laeuft
          durch DENSELBEN Trichter wie der CTA (entscheideAbschlussPfad):
          Brand ohne Statistik → Wizard, offene Fahrzeugberichte → Override
          mit Grund-Pflicht, sonst → Abschluss-Confirm mit Verrechenbar-
          Seeding. Vorher konnte das X den Brand-Wizard, den Override-Grund
          und die Verrechnungs-Abfrage komplett umgehen. */}
      <CloseTabConfirmModal
        open={tabToClose !== null}
        tabLabel={tabToClose?.label ?? ""}
        warnText="Achtung: Schliesst den gesamten Einsatz fuer ALLE Fahrzeuge."
        onClose={() => setTabToClose(null)}
        onConfirmAbschluss={async () => {
          if (!tabToClose) return;
          const zielId = tabToClose.id;
          setTabToClose(null);
          const zielDoc = aktiveEinsaetze.find((e2) => e2._id === zielId) ?? null;
          // Ziel-Einsatz aktivieren — die gesamte Abschluss-Maschinerie
          // (Wizard/Override/Confirm/handleAbschluss) arbeitet auf
          // aktiverEinsatzId. Der Reset-Effekt wird per Guard uebersprungen,
          // damit das folgende Confirm-Seeding stehen bleibt.
          if (zielId !== aktiverEinsatzId) {
            abschlussSeedGuardRef.current = true;
            wechsleAktivenEinsatz(zielId);
          }
          // Frische Fahrzeugbericht-Lage des ZIEL-Einsatzes holen — der
          // 15-s-Poll haelt noch den Stand des vorher aktiven Einsatzes.
          let berichte: FahrzeugberichtApiDoc[] = [];
          try {
            const r = await apiCall<{ items: FahrzeugberichtApiDoc[] }>(
              `/api/einsaetze/${encodeURIComponent(zielId)}/fahrzeugberichte`,
            );
            berichte = r.items;
          } catch {
            // Kein frischer Stand (Netz) — Fallback: leere Liste, der
            // Backend-Check beim POST /abschluss bleibt die letzte Instanz.
          }
          const offeneBerichte = berichte.filter(
            (b) => b.status !== "abgeschlossen",
          );
          const istManuell =
            zielDoc?.einsatzTyp === "manuell" ||
            zielDoc?.einsatzTyp === "uebung" ||
            zielDoc?.einsatzTyp === "lotsendienst";
          const pfad = entscheideAbschlussPfad({
            schreibschutz: zielDoc?.schreibschutz === true,
            hatEinsatzId: true,
            busy: abschlussBusy,
            blockiert: !istManuell && offeneBerichte.length > 0,
            istBrand: kategorieFuer(zielDoc?.einsatzart) === "brand",
            hatBrandStatistik: !!zielDoc?.brandStatistik,
          });
          setAbschlussErr(null);
          setAbschlussOk(null);
          if (pfad !== "confirm") {
            // Der Reset-Effekt wurde per Guard uebersprungen — fuer Wizard-/
            // Override-Pfad den Verrechnungs-State trotzdem frisch vom
            // ZIEL-Doc seeden (kein Leak des vorherigen Einsatzes).
            setAbschlussVerrechenbar(zielDoc?.verrechnung?.verrechenbar ?? false);
            setAbschlussRechnungsadresse(
              zielDoc?.verrechnung?.rechnungsadresse ?? "",
            );
          }
          if (pfad === "wizard") {
            setBrandWizardOpen(true);
            return;
          }
          if (pfad === "blocked") {
            if (zielDoc?.schreibschutz === true) {
              // Bereits abgeschlossen — nichts zu tun, Liste auffrischen.
              setAbschlussOk("Einsatz war bereits abgeschlossen.");
              reloadAktiveEinsaetzeRef.current();
              return;
            }
            if (abschlussBusy) return;
            // Offene Fahrzeugberichte → Override-Pfad mit Grund-Pflicht.
            setAbschlussOverrideGrund("");
            setAbschlussOverrideOpen(true);
            return;
          }
          openAbschlussConfirm(zielDoc);
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
                    fontSize: 21.5,
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
                    fontSize: 12.5,
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
                fontSize: 16.5,
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

            {/* Issue 8 (Einsatz-Test 2026-06-02): Verrechnungs-Toggle. */}
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: abschlussVerrechenbar ? "var(--info-tint)" : "var(--surface-2)",
                border: `1px solid ${abschlussVerrechenbar ? "var(--info-border)" : "var(--border)"}`,
                display:
                  // #171 (Test 2026-06-03): Bei Übung KEINE "verrechenbar"-Abfrage —
                  // eine Übung ist nie verrechenbar. Block einfach ausblenden.
                  einsatzTyp === "uebung" ? "none" : "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={abschlussVerrechenbar}
                  onChange={(e) => setAbschlussVerrechenbar(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: "var(--info)" }}
                />
                <span style={{ fontSize: 17.5, fontWeight: 600, color: "var(--fg)" }}>
                  Einsatz ist verrechenbar
                </span>
              </label>
              {abschlussVerrechenbar ? (
                <input
                  type="text"
                  className="input"
                  value={abschlussRechnungsadresse}
                  onChange={(e) => setAbschlussRechnungsadresse(e.target.value)}
                  placeholder="Rechnungsadresse (optional)"
                  style={{ fontSize: 16.5 }}
                />
              ) : null}
            </div>

            {abschlussErr ? (
              <div
                role="alert"
                style={{
                  fontSize: 15,
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

      {/* U-17: Abschluss-Override-Modal — Grund-Pflicht-Input, min 10 Zeichen.
          Beim Bestaetigen ruft handleAbschluss mit Grund auf, der ins
          Audit-Log wandert und (sofern Backend mitkann) am PDF erscheint. */}
      {abschlussOverrideOpen && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => !abschlussBusy && setAbschlussOverrideOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2400,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(540px, 100%)",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={20} style={{ color: "var(--warn)" }} />
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                Trotzdem abschliessen
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 16.5, color: "var(--fg-2)", lineHeight: 1.55 }}>
              Es sind noch Fahrzeugberichte offen. Du kannst den Hauptbericht
              trotzdem schliessen — bitte einen Grund angeben (mind. 10 Zeichen).
              Der Grund wandert ins Audit-Log und auf das PDF.
            </p>
            <textarea
              rows={3}
              value={abschlussOverrideGrund}
              onChange={(e) => setAbschlussOverrideGrund(e.target.value)}
              placeholder="z. B. Tablet LFA-B defekt, Kdt im Krankenstand …"
              autoFocus
              disabled={abschlussBusy}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: 17.5,
                color: "var(--fg)",
                resize: "vertical",
              }}
            />
            {abschlussErr && (
              <div
                style={{
                  fontSize: 15,
                  padding: "6px 8px",
                  background: "var(--red-tint)",
                  color: "var(--red)",
                  border: "1px solid var(--red-border)",
                  borderRadius: 6,
                }}
              >
                {abschlussErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setAbschlussOverrideOpen(false)}
                disabled={abschlussBusy}
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  color: "var(--fg)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 10,
                  fontSize: 16.5,
                  fontWeight: 600,
                  cursor: abschlussBusy ? "not-allowed" : "pointer",
                  minHeight: 44,
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={abschlussBusy || abschlussOverrideGrund.trim().length < 10}
                onClick={async () => {
                  // AUDIT-07/EL-11b: Erfolg kommt jetzt als Rueckgabewert —
                  // frueher wurde das STALE abschlussErr aus der Render-
                  // Closure gelesen: nach einem Fehlversuch schloss der
                  // Dialog beim zweiten (erfolgreichen) Klick nicht bzw.
                  // schloss faelschlich trotz frischem Fehler.
                  const ok = await handleAbschluss(abschlussOverrideGrund.trim());
                  if (ok) setAbschlussOverrideOpen(false);
                }}
                style={{
                  padding: "10px 18px",
                  background: "var(--warn)",
                  border: 0,
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 16.5,
                  fontWeight: 700,
                  cursor:
                    abschlussBusy || abschlussOverrideGrund.trim().length < 10
                      ? "not-allowed"
                      : "pointer",
                  opacity: abschlussOverrideGrund.trim().length < 10 ? 0.5 : 1,
                  minHeight: 44,
                }}
              >
                {abschlussBusy ? "Schliesst ab …" : "Trotzdem abschliessen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NeuerEinsatzTabletModal
        open={neuerEinsatzOpen !== null}
        initialTyp={neuerEinsatzOpen ?? "manuell"}
        onClose={() => setNeuerEinsatzOpen(null)}
        onCreated={(einsatzId, typ) => {
          setNeuerEinsatzOpen(null);
          // AUDIT-09/EL-06: Lotsendienst erscheint hier bewusst NIE als
          // Hauptbericht (#165-Filter) — statt Auto-Switch ins Leere ein
          // Erfolgsbanner + 30-s-Doppel-Anlage-Guard. KEIN justCreatedRef/
          // setAktiverEinsatzId, der Poll wuerde den Einsatz ohnehin filtern.
          if (typ === "lotsendienst") {
            setLotsendienstHinweis(
              "Lotsendienst angelegt — Dokumentation läuft am Fahrzeug-Tablet (KDO/TLF). Der Bericht erscheint später im Archiv.",
            );
            setLotsendienstAngelegtAt(Date.now());
            return;
          }
          // Auto-Switch auf den neu angelegten Einsatz — robust gegen den
          // naechsten Poll-Tick der ihn noch nicht in items[] hat.
          justCreatedRef.current = { id: einsatzId, ts: Date.now() };
          // AUDIT-01 (3): via wechsleAktivenEinsatz — flusht ungespeicherte
          // Tipparbeit des vorher aktiven Einsatzes.
          wechsleAktivenEinsatz(einsatzId);
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
        // AUDIT-09/EL-12: reaktivierter Einsatz SOFORT als aktiver Tab
        // sichtbar (exakt das bewaehrte onCreated-Muster) — vorher wartete
        // der EL bis zu 10 s auf den naechsten Poll und reaktivierte im
        // Zweifel ein zweites Mal.
        onReaktiviert={(id) => {
          justCreatedRef.current = { id, ts: Date.now() };
          wechsleAktivenEinsatz(id);
          reloadAktiveEinsaetzeRef.current();
          setArchivOpenFlorian(false);
        }}
      />

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onResetSetup={onResetSetup}
      />

      {/* Issue 17 (Einsatz-Test 2026-06-02): Brand-Abschluss-Wizard.
          Lookup-Adresse = einsatzort (Server normalisiert + hashed). Initial
          = bestehende brandStatistik (z. B. wenn der User schon einmal
          durchgelaufen ist und nochmal aufruft). Cancel-Pfad schreibt nichts. */}
      <BrandAbschlussWizard
        open={brandWizardOpen}
        {...(aktiverEinsatz?.einsatzort
          ? { lookupAdresse: aktiverEinsatz.einsatzort }
          : {})}
        initial={
          aktiverEinsatz?.brandStatistik
            ? (aktiverEinsatz.brandStatistik as Partial<BrandStatistik>)
            : null
        }
        onCancel={() => {
          setBrandWizardOpen(false);
          // AUDIT-07/EL-13: Edit-Modus auch beim Abbruch zuruecksetzen —
          // sonst wuerde der NAECHSTE regulaere Abschluss-Wizard-Durchlauf
          // faelschlich ohne Abschluss-Confirm enden.
          brandWizardEditModeRef.current = false;
        }}
        onComplete={(bs) => {
          void handleBrandWizardComplete(bs);
        }}
      />
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
          fontSize: 15,
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
 * Issue 16 (Einsatz-Test 2026-06-02): Kleines Inline-Input-Plus-Button-Pair
 * fuer ad-hoc Chips (z. B. Gefaehrliche Stoffe die noch nicht in der
 * Funktionaer-Liste sind). Enter im Input triggert ebenfalls onAdd.
 */
function FreitextAddRow({
  placeholder,
  disabled,
  onAdd,
}: {
  placeholder: string;
  disabled: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");
  function commit() {
    if (!text.trim() || disabled) return;
    onAdd(text);
    setText("");
  }
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        className="input"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        onClick={commit}
        disabled={disabled || !text.trim()}
        style={{
          padding: "8px 14px",
          background: "var(--accent)",
          border: 0,
          color: "#fff",
          borderRadius: 8,
          fontSize: 16.5,
          fontWeight: 700,
          cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
          opacity: disabled || !text.trim() ? 0.55 : 1,
          minHeight: 38,
        }}
      >
        +
      </button>
    </div>
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
                fontSize: 17.5,
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
              fontSize: 14,
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
  schreibschutz,
  onAdded,
  onRejected,
}: {
  einsatzId: string | null;
  /** AUDIT-09/EL-03-UI: bei abgeschlossenem Einsatz ist die Eingabe gesperrt
   *  — der Server wuerde den POST ohnehin mit 423 ablehnen. */
  schreibschutz: boolean;
  onAdded: (entry: ChronikEintrag) => void;
  /** AUDIT-09/EL-03-UI: Server hat den Eintrag ENDGUELTIG abgelehnt (404/423)
   *  — der Aufrufer entfernt den optimistischen Eintrag wieder. */
  onRejected: (entryId: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (schreibschutz) return;
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
    // AUDIT-09/EL-03: Broadcast-Ergebnis auswerten — 'queued' ist KEIN Fehler
    // (Offline-Outbox reicht nach, optimistischer Eintrag bleibt stehen);
    // nur bei 'rejected' (404/423) Eintrag entfernen + User informieren.
    const result = await broadcastChronikEntry(einsatzId, {
      id,
      zeitstempel,
      funkrufname: "Florian Eberstalzell",
      fahrzeugId: "zentrale",
      source: "manuell",
      text: cleaned,
    });
    if (result === "rejected") {
      onRejected(id);
      setErr("Eintrag NICHT gespeichert — Bericht ist abgeschlossen.");
    }
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
            fontSize: 15,
            border: "1px solid var(--red-border)",
          }}
        >
          {err}
        </div>
      ) : null}
      <div className="freeform">
        {/* Issue 5 (Einsatz-Test 2026-06-02): Browser-Spellcheck de-AT
            damit Tippfehler im Live-Eintrag sofort sichtbar sind. */}
        <input
          className="input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={
            schreibschutz
              ? "Bericht abgeschlossen — Eingabe gesperrt"
              : "Eintrag von Florian Eberstalzell · z. B. Nachalarmierung BFKDT angefordert …"
          }
          disabled={!einsatzId || schreibschutz}
          spellCheck
          lang="de-AT"
        />
        <button
          type="button"
          className="add-btn"
          onClick={() => void submit()}
          disabled={busy || !text.trim() || !einsatzId || schreibschutz}
          aria-label="Chronik-Eintrag hinzufügen"
        >
          +
        </button>
      </div>
      <p
        style={{
          marginTop: 8,
          fontSize: 14,
          fontFamily: "var(--font-mono)",
          color: schreibschutz ? "var(--warn)" : "var(--fg-3)",
          letterSpacing: "0.06em",
        }}
      >
        {schreibschutz
          ? "Bericht abgeschlossen — erst reaktivieren."
          : "Eintrag erscheint binnen 8 s in der Chronik aller Fahrzeug-Tablets."}
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
