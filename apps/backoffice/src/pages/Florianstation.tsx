/**
 * Florianstation — Querformat-Layout für PC, FR-17.
 * Dreispaltig: Karte/Aktive Einsätze (links) · Hauptbericht + Chronik (Mitte) · Live-Fahrzeugberichte (rechts).
 * Kein Diktat, nur Tastatureingabe.
 *
 * Save-Pipeline: Controlled-State + 1.5s-Debounce-Auto-Save analog ZentralePage,
 * PUT /api/einsaetze/:id. Backend-Allowlist siehe einsaetze.ts (F-08-Fix).
 *
 * D-04 (Audit R3):
 *  (a) Modus "aktiv | abgeschlossen (letzte 30 Tage)" — abgeschlossene sind
 *      read-only mit Reaktivieren-Button.
 *  (b) Einsatzleiter (Personen-Select) + Einsatzende (datetime-local -> ISO)
 *      im Hauptbericht.
 *  (c) Mini-Formular je Fahrzeugbericht (Kdt/Fahrer/EL-Flag/km/von-bis/
 *      Mannschafts-Slots) -> PUT fzgber mit NUR den geaenderten Keys.
 *  (d) Chronik-Lektorat: Inline-Edit + Soft-Delete mit Bestaetigung.
 */

import {
  BETEILIGTE_STELLEN,
  EINSATZARTEN,
  FAHRZEUGE,
  FLORIAN_POSITION,
  SONSTIGE_FF,
  type FahrzeugId,
} from "@hotdoc/shared";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  Lock,
  Map as MapIcon,
  Pencil,
  Save,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiCall } from "../api/client";
import {
  chronikText,
  deleteChronikEintrag,
  editChronikEintrag,
  getChronik,
  listEinsaetze,
  listFahrzeugberichte,
  putFahrzeugbericht,
  reaktivieren,
  type ChronikEintrag,
  type EinsatzListItem,
  type FahrzeugberichtItem,
  type FahrzeugberichtMannschaft,
  type FahrzeugberichtPatch,
} from "../api/einsaetze";
import { listPersonen, personLabel, sortPersonen, type PersonItem } from "../api/personen";
import { FlorianMap, type FahrzeugPos } from "../components/FlorianMap";

/** Feuerwehrhaus FF Eberstalzell — Solarstraße 1, 4653 Eberstalzell.
 *  Quelle: @hotdoc/shared constants/florian.ts. */
const HOME = FLORIAN_POSITION;

/** D-04a: Listen-Modus. "abgeschlossen" zeigt nur die letzten 30 Tage —
 *  der Server filtert nicht nach Datum, das passiert clientseitig. */
type Modus = "aktiv" | "abgeschlossen";
const ABGESCHLOSSEN_FENSTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Florianstation-Pin (fix am Geraetehaus) als Map-Basis. Andere Fahrzeuge
 *  werden via /api/positions live eingespeist. */
function zentraleMarker(): FahrzeugPos[] {
  return [
    {
      fahrzeugId: "zentrale",
      funkrufname: "Florian Eberstalzell",
      abk: "FLORIAN",
      status: "wartend",
      lat: HOME.lat,
      lng: HOME.lng,
      isZentrale: true,
    },
  ];
}

/** Editierbare Felder, die per PUT /api/einsaetze/:id geschrieben werden.
 *  Schlanker Sub-Type damit der Editor-State nicht das ganze EinsatzListItem
 *  mit Audit-Feldern + Lifecycle-Markern mitfuehren muss. */
interface FormState {
  einsatzort: string;
  einsatzart: string;
  einsatzartFreitext: string;
  /** alarmierungZeit als datetime-local-String (YYYY-MM-DDTHH:mm). */
  alarmierungZeit: string;
  alarmiertDurch: string;
  /** Beteiligte Stellen — string[] gespeichert als Set fuer Toggle-Logik. */
  beteiligteStellen: string[];
  sonstigeAnwesendeFF: string[];
  /** AUDIT-08-Kuer: sichtbares Freitext-Feld fuer sonstige FF — fuehrt
   *  sonstigeAnwesendeFF.sonstigeFreitext, damit der Autosave das in der
   *  PWA erfasste Feld nicht mehr unsichtbar ueberschreibt. */
  sonstigeFreitext: string;
  /** "Lage unter Kontrolle" + "Brand aus" sind Time-Strings (HH:mm). */
  lageUnterKontrolle: string;
  brandAus: string;
  meldungEinsatzleitung: string;
  /** D-04b: Einsatzleiter (syBosId); null = nicht gesetzt. */
  einsatzleiterPersonId: number | null;
  /** D-04b: Einsatzende als datetime-local-String; "" = nicht gesetzt. */
  einsatzende: string;
}

/** Initialer State aus einem EinsatzListItem (plus geladenes Detail-Doc).
 *  Das Detail-Doc wird per GET /api/einsaetze/:id geholt, weil die Liste
 *  nur die Stamm-Felder liefert. */
function buildFormFromDoc(doc: Record<string, unknown>): FormState {
  return {
    einsatzort: typeof doc.einsatzort === "string" ? doc.einsatzort : "",
    einsatzart: typeof doc.einsatzart === "string" ? doc.einsatzart : "",
    einsatzartFreitext: typeof doc.einsatzartFreitext === "string" ? doc.einsatzartFreitext : "",
    alarmierungZeit: typeof doc.alarmierungZeit === "string" ? toLocalDt(doc.alarmierungZeit) : "",
    alarmiertDurch: typeof doc.alarmiertDurch === "string" ? doc.alarmiertDurch : "",
    beteiligteStellen: Array.isArray(doc.beteiligteStellen)
      ? (doc.beteiligteStellen as string[])
      : [],
    // sonstigeAnwesendeFF im Schema = { aktive: string[], sonstigeFreitext?: string }
    // Wir flatten fuer die UI auf ein simples string[] (Chip-Toggle), kapseln das
    // dann beim PUT wieder in das Object-Format. Backwards-Compat: alte Daten
    // koennten ein nacktes Array sein → akzeptieren.
    sonstigeAnwesendeFF: (() => {
      const v = doc.sonstigeAnwesendeFF;
      if (Array.isArray(v)) return v as string[];
      if (v && typeof v === "object" && Array.isArray((v as { aktive?: unknown }).aktive)) {
        return (v as { aktive: string[] }).aktive;
      }
      return [];
    })(),
    sonstigeFreitext: (() => {
      const v = doc.sonstigeAnwesendeFF;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const f = (v as { sonstigeFreitext?: unknown }).sonstigeFreitext;
        if (typeof f === "string") return f;
      }
      return "";
    })(),
    lageUnterKontrolle:
      typeof doc.zeitmarken === "object" && doc.zeitmarken
        ? toTime((doc.zeitmarken as Record<string, unknown>).lageUnterKontrolle)
        : "",
    brandAus:
      typeof doc.zeitmarken === "object" && doc.zeitmarken
        ? toTime((doc.zeitmarken as Record<string, unknown>).brandAus)
        : "",
    meldungEinsatzleitung:
      typeof doc.meldungEinsatzleitung === "string" ? doc.meldungEinsatzleitung : "",
    einsatzleiterPersonId:
      typeof doc.einsatzleiterPersonId === "number" ? doc.einsatzleiterPersonId : null,
    einsatzende: typeof doc.einsatzende === "string" ? toLocalDt(doc.einsatzende) : "",
  };
}

// ─── D-04c: Fahrzeugbericht-Mini-Formular ────────────────────

/** Editor-Zustand eines Fahrzeugberichts — flache Form der PUT-Felder. */
interface FzgEdit {
  fahrerPersonId: number | null;
  fahrzeugKdtPersonId: number | null;
  kdtIstEinsatzleiter: boolean;
  /** km.gefahrenKm als Input-String ("" = 0). */
  gefahrenKm: string;
  /** zeit.von / zeit.bis als "HH:mm" ("" = nicht gesetzt). */
  von: string;
  bis: string;
  /** Mannschafts-Slots 1..N (Index 0 = Slot 1): personId oder null = leer. */
  slots: Array<number | null>;
}

/**
 * basis = Stand beim ersten Tastendruck, edit = aktueller Stand. Der Patch
 * vergleicht edit gegen basis (= was der Benutzer WIRKLICH geaendert hat),
 * nicht gegen das Doc — das wird alle 15 s vom Tablet-Poll aktualisiert und
 * darf fremde Aenderungen nicht als "unsere" in den Body ziehen.
 */
interface FzgEditState {
  basis: FzgEdit;
  edit: FzgEdit;
}

/** Schema erlaubt Slot 1..7. */
const SLOT_MAX = 7;

/** Fahrzeug-Config aus @hotdoc/shared; undefined fuer unbekannte IDs. */
function fzgConfig(fahrzeugId: string | undefined) {
  return fahrzeugId && fahrzeugId in FAHRZEUGE ? FAHRZEUGE[fahrzeugId as FahrzeugId] : undefined;
}

/** Fahrzeug-ID aus dem Doc; Fallback letztes ID-Segment "fzgber:<einsatz>:<fzg>". */
function fzgIdVon(b: FahrzeugberichtItem): string {
  if (typeof b.fahrzeugId === "string" && b.fahrzeugId) return b.fahrzeugId;
  return b._id.split(":").pop() ?? b._id;
}

/** Anzahl Mannschafts-Slots: Fahrzeug-Config, mindestens aber der hoechste
 *  bereits belegte Slot (Altdaten), gedeckelt auf das Schema-Maximum. */
function slotAnzahl(b: FahrzeugberichtItem): number {
  const cfg = fzgConfig(fzgIdVon(b));
  const ausConfig = cfg?.besatzung.mannschaftsplaetzeZusaetzlich ?? SLOT_MAX;
  const belegt = (b.mannschaft ?? []).reduce((max, m) => Math.max(max, m.slot), 0);
  return Math.min(SLOT_MAX, Math.max(ausConfig, belegt));
}

function editFromDoc(b: FahrzeugberichtItem): FzgEdit {
  const n = slotAnzahl(b);
  const slots: Array<number | null> = Array.from({ length: n }, () => null);
  for (const m of b.mannschaft ?? []) {
    if (m.slot >= 1 && m.slot <= n && typeof m.personId === "number" && m.personId > 0) {
      slots[m.slot - 1] = m.personId;
    }
  }
  return {
    fahrerPersonId: typeof b.fahrerPersonId === "number" ? b.fahrerPersonId : null,
    fahrzeugKdtPersonId: typeof b.fahrzeugKdtPersonId === "number" ? b.fahrzeugKdtPersonId : null,
    kdtIstEinsatzleiter: b.kdtIstEinsatzleiter === true,
    gefahrenKm: typeof b.km?.gefahrenKm === "number" ? String(b.km.gefahrenKm) : "",
    von: toTime(b.zeit?.von),
    bis: toTime(b.zeit?.bis),
    slots,
  };
}

function parseKm(s: string): number {
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Patch mit NUR den gegenueber basis geaenderten Keys. Objekt-Felder (zeit,
 * km) und das mannschaft-Array ersetzt der Server komplett — sie werden aus
 * dem FRISCHEN Doc `b` plus der Benutzer-Aenderung zusammengebaut, damit
 * parallel vom Tablet geschriebene Werte (Abfahrts-km, AS-Flags, andere
 * Slots) erhalten bleiben.
 * Personen-Felder koennen serverseitig nicht geleert werden (Schema
 * number|undefined, Shallow-Merge) — null-Werte werden daher ausgelassen.
 */
function buildFzgPatch(
  b: FahrzeugberichtItem,
  basis: FzgEdit,
  edit: FzgEdit,
  refIso: string | undefined,
): FahrzeugberichtPatch {
  const patch: FahrzeugberichtPatch = {};
  if (edit.fahrerPersonId !== basis.fahrerPersonId && edit.fahrerPersonId !== null) {
    patch.fahrerPersonId = edit.fahrerPersonId;
  }
  if (edit.fahrzeugKdtPersonId !== basis.fahrzeugKdtPersonId && edit.fahrzeugKdtPersonId !== null) {
    patch.fahrzeugKdtPersonId = edit.fahrzeugKdtPersonId;
  }
  if (edit.kdtIstEinsatzleiter !== basis.kdtIstEinsatzleiter) {
    patch.kdtIstEinsatzleiter = edit.kdtIstEinsatzleiter;
  }
  if (parseKm(edit.gefahrenKm) !== parseKm(basis.gefahrenKm)) {
    patch.km = {
      ...(typeof b.km?.abfahrt === "number" ? { abfahrt: b.km.abfahrt } : {}),
      gefahrenKm: parseKm(edit.gefahrenKm),
      ...(typeof b.km?.rueckkehr === "number" ? { rueckkehr: b.km.rueckkehr } : {}),
    };
  }
  if (edit.von !== basis.von || edit.bis !== basis.bis) {
    // Unveraenderte Haelfte aus dem frischen Doc (ISO bleibt exakt), die
    // geaenderte aus HH:mm + Einsatzdatum. "bis" referenziert "von", damit
    // eine Rueckkehr nach Mitternacht auf den Folgetag faellt.
    const vonIso = edit.von === basis.von ? b.zeit?.von : fromTime(edit.von, refIso);
    const bisIso = edit.bis === basis.bis ? b.zeit?.bis : fromTime(edit.bis, vonIso ?? refIso);
    patch.zeit = {
      ...(vonIso ? { von: vonIso } : {}),
      ...(bisIso ? { bis: bisIso } : {}),
    };
  }
  const slotsGeaendert =
    edit.slots.length !== basis.slots.length || edit.slots.some((p, i) => p !== basis.slots[i]);
  if (slotsGeaendert) {
    // Frische Eintraege uebernehmen, nur die vom Benutzer beruehrten Slots
    // setzen/leeren. Unveraenderte Person → Original-Eintrag inkl. AS-Flags.
    const frisch = new Map<number, FahrzeugberichtMannschaft>();
    for (const m of b.mannschaft ?? []) frisch.set(m.slot, m);
    edit.slots.forEach((pid, i) => {
      const slot = i + 1;
      if (pid === basis.slots[i]) return;
      if (pid === null) frisch.delete(slot);
      else frisch.set(slot, { slot, personId: pid });
    });
    patch.mannschaft = [...frisch.values()].sort((x, y) => x.slot - y.slot);
  }
  return patch;
}

/** Fehlertext fuer fzgber-/Chronik-Aktionen — HTTP-Codes in Klartext. */
function apiFehlerText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 423) return "Bericht ist abgeschlossen — zum Bearbeiten reaktivieren.";
    if (e.status === 403) return "Keine Berechtigung (Einsatzleiter oder höher nötig).";
    if (e.status === 409) return "Zwischenzeitlich anderweitig geändert — bitte neu laden und erneut versuchen.";
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function Florianstation() {
  const [modus, setModus] = useState<Modus>("aktiv");
  const [liste, setListe] = useState<EinsatzListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editor-State + Save-Pipeline
  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);
  /** D-04b: Stand beim Laden — entscheidet, ob "—" beim EL-Select erlaubt ist
   *  (der Server kann einen gesetzten Einsatzleiter nicht leeren). */
  const formBasisRef = useRef<FormState | null>(null);

  // Rechte Spalte: echte Fahrzeugberichte des ausgewaehlten Einsatzes
  const [fzgBerichte, setFzgBerichte] = useState<FahrzeugberichtItem[]>([]);
  const [fzgEdits, setFzgEdits] = useState<Record<string, FzgEditState>>({});
  const [fzgSaving, setFzgSaving] = useState<string | null>(null);
  const [fzgErr, setFzgErr] = useState<Record<string, string>>({});

  // D-04 (b/c): Personen-Stammdaten fuer alle Personen-Selects.
  const [personen, setPersonen] = useState<PersonItem[]>([]);
  const [personenErr, setPersonenErr] = useState<string | null>(null);

  // D-04d: Chronik-Lektorat
  const [chronik, setChronik] = useState<ChronikEintrag[]>([]);
  const [zeigeGeloeschte, setZeigeGeloeschte] = useState(false);
  const [chronikEdit, setChronikEdit] = useState<{ id: string; text: string } | null>(null);
  const [chronikLoeschId, setChronikLoeschId] = useState<string | null>(null);
  const [chronikBusy, setChronikBusy] = useState(false);
  const [chronikErr, setChronikErr] = useState<string | null>(null);

  // D-04a: Reaktivieren-Dialog (optionaler Grund, analog BerichtDetail)
  const [reaktivModal, setReaktivModal] = useState(false);
  const [reaktivGrund, setReaktivGrund] = useState("");
  const [reaktivErr, setReaktivErr] = useState<string | null>(null);

  // Issue #159 (v0.1.12): Sonstige-FF-Liste vom Backend laden statt aus
  // dem hartkodierten SONSTIGE_FF-Constant zu rendern. Der Funktionaer
  // pflegt die echte Nachbarwehren-Liste (TMB Sattledt, Kran Sattledt,
  // FF Lambach, ...) im Backoffice unter Stammdaten -> "Sonstige FF".
  // Fallback: solange das Backend noch nicht geantwortet hat, zeigen wir
  // die hartkodierte Constant aus @hotdoc/shared an — so wird die UI nie
  // leer und beim Offline-Modus passiert auch nichts kaputtes.
  const [sonstigeFfAll, setSonstigeFfAll] = useState<string[]>(
    SONSTIGE_FF as unknown as string[],
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiCall<{ data?: { items?: string[] } }>(
          "/api/config/sonstige-ff",
        );
        if (!cancelled && Array.isArray(r.data?.items)) {
          setSonstigeFfAll(r.data!.items.map(String));
        }
      } catch {
        // Fallback bleibt aktiv — kein Toast / Fehler hier, Offline ist OK.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Personen einmalig laden (sortiert). Fehler sichtbar, aber nicht blockierend:
  // die Selects zeigen dann nur die bereits gesetzten IDs als "#123".
  useEffect(() => {
    let cancelled = false;
    void listPersonen()
      .then((r) => {
        if (!cancelled) setPersonen(sortPersonen(r.items));
      })
      .catch((e: unknown) => {
        if (!cancelled) setPersonenErr(apiFehlerText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      let list = await listEinsaetze(modus);
      if (modus === "abgeschlossen") {
        // D-04a: nur die letzten 30 Tage — der Server liefert das ganze Archiv.
        const grenze = Date.now() - ABGESCHLOSSEN_FENSTER_MS;
        list = list.filter((e) => {
          const t = new Date(e.alarmierungZeit).getTime();
          return Number.isNaN(t) || t >= grenze;
        });
      }
      setListe(list);
      // Auswahl nachziehen, wenn nichts oder etwas nicht mehr Gelistetes
      // gewaehlt ist (Modus-Wechsel, Auto-Abschluss durch den Worker).
      if (!selectedId || !list.some((e) => e._id === selectedId)) {
        setSelectedId(list[0]?._id ?? null);
      }
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }, [selectedId, modus]);

  useEffect(() => {
    void reload();
    const id = setInterval(reload, 15_000);
    return () => clearInterval(id);
  }, [reload]);

  // Detail laden + Form befuellen wenn sich die Auswahl aendert.
  useEffect(() => {
    if (!selectedId) {
      setForm(null);
      loadedIdRef.current = null;
      formBasisRef.current = null;
      return;
    }
    if (loadedIdRef.current === selectedId) return;
    void (async () => {
      try {
        const doc = await apiCall<Record<string, unknown>>(
          `/api/einsaetze/${encodeURIComponent(selectedId)}`,
        );
        const f = buildFormFromDoc(doc);
        setForm(f);
        formBasisRef.current = f;
        setDirty(false);
        setSaveErr(null);
        loadedIdRef.current = selectedId;
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [selectedId]);

  // Fahrzeugberichte + Chronik fuer den gewaehlten Einsatz laden
  // (Polling 15s analog Aktive-Liste). Editor-Zustaende (fzgEdits,
  // chronikEdit) leben getrennt davon und werden vom Poll nicht ueberschrieben.
  const loadDetails = useCallback(async () => {
    if (!selectedId) return;
    const [fz, ch] = await Promise.allSettled([
      listFahrzeugberichte(selectedId),
      getChronik(selectedId),
    ]);
    if (fz.status === "fulfilled") setFzgBerichte(fz.value);
    if (ch.status === "fulfilled") setChronik(ch.value);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setFzgBerichte([]);
      setChronik([]);
      return;
    }
    // Auswahl gewechselt → offene Editor-Zustaende des alten Einsatzes verwerfen.
    setFzgEdits({});
    setFzgErr({});
    setChronikEdit(null);
    setChronikLoeschId(null);
    setChronikErr(null);
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      await loadDetails();
    }
    void tick();
    const t = setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId, loadDetails]);

  const selected = liste.find((e) => e._id === selectedId) ?? liste[0];
  /** D-04a: abgeschlossene Berichte sind read-only — alle Editoren gesperrt. */
  const gesperrt = selected?.status === "abgeschlossen" || selected?.schreibschutz === true;

  // Save-Funktion (manuell + via Auto-Save-Debounce)
  const save = useCallback(async () => {
    if (!selectedId || !form) return;
    setSaving(true);
    setSaveErr(null);
    try {
      // AUDIT-08: Der Backend-PUT ersetzt Objekt-Felder komplett (shallow-
      // merge in einsaetze.ts) — ein Body ohne die fremden Felder wuerde
      // also in der PWA erfasste Werte (z. B. zeitmarken.alst2/alst3)
      // loeschen. Darum: Original-Doc aus der aktiven Liste mergen.
      // ACHTUNG: orig kann zwischen 15s-Poll und Save veraltet sein —
      // akzeptiertes Restrisiko, deutlich besser als das Voll-Ersetzen.
      const orig = liste.find((e) => e._id === selectedId) as
        | (EinsatzListItem & Record<string, unknown>)
        | undefined;
      const refIso = orig?.alarmierungZeit;
      const lageIso = fromTime(form.lageUnterKontrolle, refIso);
      const brandIso = fromTime(form.brandAus, refIso);
      const freitext = form.sonstigeFreitext.trim();
      const endeIso = fromLocalDt(form.einsatzende);
      const body: Record<string, unknown> = {
        einsatzort: form.einsatzort,
        einsatzart: form.einsatzart || undefined,
        einsatzartFreitext: form.einsatzartFreitext || undefined,
        alarmiertDurch: form.alarmiertDurch || undefined,
        beteiligteStellen: form.beteiligteStellen,
        // Schema erwartet { aktive: string[] }, NICHT ein nacktes Array.
        // Vorher: Backoffice schickte string[] → 400 schema_invalid.
        // sonstigeFreitext fuehrt das sichtbare Formularfeld (AUDIT-08) —
        // leer → Feld weglassen, undefined NIE in den Body spreaden.
        sonstigeAnwesendeFF: {
          aktive: form.sonstigeAnwesendeFF,
          ...(freitext ? { sonstigeFreitext: freitext } : {}),
        },
        meldungEinsatzleitung: form.meldungEinsatzleitung || undefined,
        // AUDIT-08: GANZES zeitmarken-Objekt aus dem Original uebernehmen
        // und nur die hier gefuehrten Felder ueberschreiben. Leere Inputs
        // (fromTime → undefined) loeschen keine vorhandenen Zeiten.
        zeitmarken: {
          ...((orig?.zeitmarken as object | undefined) ?? {}),
          ...(lageIso ? { lageUnterKontrolle: lageIso } : {}),
          ...(brandIso ? { brandAus: brandIso } : {}),
        },
        // D-04b: beide nur wenn gesetzt — der Server kann sie nicht leeren
        // (Schema optional, kein null), ein fehlender Key laesst den Stand.
        ...(typeof form.einsatzleiterPersonId === "number"
          ? { einsatzleiterPersonId: form.einsatzleiterPersonId }
          : {}),
        ...(endeIso ? { einsatzende: endeIso } : {}),
      };
      await apiCall(`/api/einsaetze/${encodeURIComponent(selectedId)}`, {
        method: "PUT",
        body,
      });
      setDirty(false);
      setSavedAt(new Date().toISOString());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e) {
      setSaveErr(apiFehlerText(e));
    } finally {
      setSaving(false);
    }
  }, [selectedId, form, liste]);

  // Auto-Save mit 1.5s-Debounce (analog ZentralePage in der PWA).
  // Gesperrte (abgeschlossene) Berichte werden nie automatisch geschrieben.
  useEffect(() => {
    if (!dirty || !selectedId || gesperrt) return;
    const handle = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(handle);
  }, [form, dirty, selectedId, save, gesperrt]);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirty(true);
  }

  function toggleListItem(key: "beteiligteStellen" | "sonstigeAnwesendeFF", item: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const cur = prev[key] ?? [];
      const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
      return { ...prev, [key]: next };
    });
    setDirty(true);
  }

  function wechsleModus(m: Modus) {
    if (m === modus) return;
    setModus(m);
    // Auswahl leeren → reload waehlt das erste Element der neuen Liste.
    setSelectedId(null);
  }

  // ─── D-04a: Reaktivieren ───
  async function onReaktivieren() {
    if (!selectedId) return;
    setBusy(true);
    setReaktivErr(null);
    try {
      await reaktivieren(selectedId, reaktivGrund.trim());
      setReaktivModal(false);
      setReaktivGrund("");
      // Form neu laden (Status/Schreibschutz) und in den Aktiv-Modus wechseln,
      // wo der Bericht jetzt gelistet wird — Auswahl bleibt erhalten.
      loadedIdRef.current = null;
      setModus("aktiv");
    } catch (e) {
      setReaktivErr(apiFehlerText(e));
    } finally {
      setBusy(false);
    }
  }

  // ─── D-04c: Fahrzeugbericht-Editor ───
  function fzgPatchEdit(b: FahrzeugberichtItem, mut: (e: FzgEdit) => FzgEdit) {
    setFzgEdits((prev) => {
      const cur = prev[b._id] ?? { basis: editFromDoc(b), edit: editFromDoc(b) };
      const edit = mut(cur.edit);
      // Zurueck auf den Ausgangsstand → Editor-Zustand verwerfen, damit die
      // Karte wieder live dem Tablet-Poll folgt (kein "geändert"-Badge).
      if (Object.keys(buildFzgPatch(b, cur.basis, edit, undefined)).length === 0) {
        const next = { ...prev };
        delete next[b._id];
        return next;
      }
      return { ...prev, [b._id]: { basis: cur.basis, edit } };
    });
  }

  function fzgVerwerfen(id: string) {
    setFzgEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFzgErr((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function fzgSpeichern(b: FahrzeugberichtItem) {
    const st = fzgEdits[b._id];
    if (!st || !selectedId) return;
    const body = buildFzgPatch(b, st.basis, st.edit, selected?.alarmierungZeit);
    if (Object.keys(body).length === 0) {
      fzgVerwerfen(b._id);
      return;
    }
    setFzgSaving(b._id);
    setFzgErr((prev) => {
      const next = { ...prev };
      delete next[b._id];
      return next;
    });
    try {
      await putFahrzeugbericht(selectedId, fzgIdVon(b), body);
      fzgVerwerfen(b._id);
      await loadDetails();
    } catch (e) {
      setFzgErr((prev) => ({ ...prev, [b._id]: apiFehlerText(e) }));
    } finally {
      setFzgSaving(null);
    }
  }

  // ─── D-04d: Chronik-Lektorat ───
  async function chronikSpeichern() {
    if (!chronikEdit || !selectedId) return;
    const text = chronikEdit.text.trim();
    if (!text) {
      setChronikErr("Text darf nicht leer sein — zum Entfernen bitte löschen.");
      return;
    }
    setChronikBusy(true);
    setChronikErr(null);
    try {
      await editChronikEintrag(selectedId, chronikEdit.id, text);
      setChronikEdit(null);
      await loadDetails();
    } catch (e) {
      setChronikErr(apiFehlerText(e));
    } finally {
      setChronikBusy(false);
    }
  }

  async function chronikLoeschen(entryId: string) {
    if (!selectedId) return;
    setChronikBusy(true);
    setChronikErr(null);
    try {
      await deleteChronikEintrag(selectedId, entryId);
      setChronikLoeschId(null);
      await loadDetails();
    } catch (e) {
      setChronikErr(apiFehlerText(e));
    } finally {
      setChronikBusy(false);
    }
  }

  // Aggregation der AS-Traeger im aktiven Einsatz aus den Fahrzeugberichten
  const aggregation = useMemo(() => {
    let mannschaftGesamt = 0;
    let asTraegerVerfuegbar = 0;
    let oelSaecke = 0;
    for (const b of fzgBerichte) {
      const slots = (b.mannschaft ?? []).filter(
        (m) => typeof m.personId === "number" && m.personId > 0,
      );
      mannschaftGesamt +=
        slots.length + (b.fahrerPersonId ? 1 : 0) + (b.fahrzeugKdtPersonId ? 1 : 0);
      asTraegerVerfuegbar += slots.filter((m) => m.atemschutzAktiv === true).length;
      oelSaecke += b.oelbindemittelSaecke ?? 0;
    }
    return { mannschaftGesamt, asTraegerVerfuegbar, oelSaecke };
  }, [fzgBerichte]);

  const chronikGeloescht = chronik.filter((e) => e.geloescht === true).length;
  const chronikSichtbar = zeigeGeloeschte ? chronik : chronik.filter((e) => e.geloescht !== true);

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) minmax(380px, 1.5fr) minmax(280px, 1fr)",
        gap: 16,
      }}
    >
      {/* ─── Linke Spalte: Einsatz-Liste + Karte ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              {modus === "aktiv" ? "Aktive Einsätze" : "Abgeschlossen (30 Tage)"} ({liste.length})
            </div>
            <span className="badge ok" style={{ gap: 5 }}>
              <Activity size={11} /> Live · {busy ? "syncing" : "ready"}
            </span>
          </div>
          {/* D-04a: Modus-Umschalter */}
          <div className="chips" style={{ marginBottom: 10 }}>
            <ModusChip label="Aktiv" active={modus === "aktiv"} onClick={() => wechsleModus("aktiv")} />
            <ModusChip
              label="Abgeschlossen (letzte 30 Tage)"
              active={modus === "abgeschlossen"}
              onClick={() => wechsleModus("abgeschlossen")}
            />
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {liste.length === 0 ? (
              <li
                style={{
                  padding: "20px 8px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--fg-3)",
                }}
              >
                {modus === "aktiv"
                  ? "Keine aktiven Einsätze. Lege im „Berichte“-Tab einen Bericht (Übung / Lotsendienst / sonst.) an oder warte auf einen BlaulichtSMS-Alarm."
                  : "Keine abgeschlossenen Berichte in den letzten 30 Tagen."}
              </li>
            ) : (
              liste.map((e) => (
                <li key={e._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e._id)}
                    className={`person${e._id === selectedId ? " filled" : ""}`}
                    style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}
                  >
                    <span className="name" style={{ fontSize: 14, display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>{e.einsatzart ?? e.einsatzartFreitext ?? "—"}</span>
                      {modus === "abgeschlossen" && (
                        <span className="badge neutral" style={{ gap: 4 }}>
                          <Lock size={9} /> {e.berichtNummer ?? "geschützt"}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--fg-2)", textAlign: "left" }}>
                      {modus === "abgeschlossen" ? `${formatDateTime(e.alarmierungZeit)} · ` : ""}
                      {e.einsatzort}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <MapIcon size={18} />
              Karte · Live-Positionen
            </div>
            <span className="card-meta">
              {selected ? "Auto-Center auf Einsatzort" : "Standort Eberstalzell"}
            </span>
          </div>
          <FlorianMap
            {...(selected?.koordinaten
              ? {
                  einsatzort: {
                    lat: selected.koordinaten.lat,
                    lng: selected.koordinaten.lng,
                    label: selected.einsatzort,
                  },
                }
              : {})}
            fahrzeuge={zentraleMarker()}
            zoom={selected ? 16 : 14}
          />
        </section>
      </div>

      {/* ─── Mitte: Hauptbericht-Formular (Tastatur, kein Diktat) + Chronik ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <article className="card">
        <div className="card-head">
          <div className="card-title">Hauptbericht</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {savedAt ? (
              <span className="badge ok" style={{ gap: 4 }}>
                <CheckCircle2 size={11} /> gespeichert
              </span>
            ) : dirty ? (
              <span className="badge neutral" style={{ gap: 4 }}>
                {saving ? "speichert …" : "ungespeicherte Änderungen"}
              </span>
            ) : null}
            <button
              type="button"
              className="cta"
              disabled={!form || !selectedId || saving || !dirty || gesperrt}
              onClick={() => void save()}
              style={{
                width: "auto",
                padding: "10px 16px",
                fontSize: 14,
                background:
                  "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)",
                opacity: !dirty || saving || gesperrt ? 0.6 : 1,
                cursor: !dirty || saving || gesperrt ? "not-allowed" : "pointer",
              }}
              title="Bericht jetzt speichern"
            >
              <Save size={14} /> Speichern
            </button>
          </div>
        </div>
        <p
          style={{
            margin: "0 0 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          Florian Eberstalzell · Querformat · Tastatur-Eingabe · FR-17
        </p>

        {saveErr ? <FehlerBox text={`Speichern fehlgeschlagen: ${saveErr}`} /> : null}
        {personenErr ? (
          <FehlerBox text={`Personenliste konnte nicht geladen werden: ${personenErr}`} />
        ) : null}

        {/* D-04a: Sperr-Hinweis + Reaktivieren fuer abgeschlossene Berichte */}
        {selected && gesperrt ? (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--warn-tint)",
              border: "1px solid var(--amber-border)",
              color: "var(--fg)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Lock size={14} style={{ color: "var(--warn)" }} />
              Bericht ist abgeschlossen — zum Bearbeiten reaktivieren.
            </span>
            <button
              type="button"
              className="cta"
              disabled={busy}
              onClick={() => {
                setReaktivErr(null);
                setReaktivModal(true);
              }}
              style={{
                width: "auto",
                padding: "8px 14px",
                fontSize: 13,
                background:
                  "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)",
              }}
            >
              <Unlock size={13} /> Reaktivieren …
            </button>
          </div>
        ) : null}

        {!selected || !form ? (
          <p style={{ color: "var(--fg-3)", fontSize: 14 }}>
            {selected ? "Lade Bericht …" : "Kein Einsatz ausgewählt."}
          </p>
        ) : (
          <form style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <fieldset
              disabled={gesperrt}
              style={{ display: "contents", border: 0, margin: 0, padding: 0, minWidth: 0 }}
            >
            <Field label="Einsatzort" full>
              <input
                className="input"
                value={form.einsatzort}
                onChange={(e) => patch("einsatzort", e.target.value)}
              />
            </Field>

            <Field label="Einsatzart">
              <select
                className="input"
                value={form.einsatzart}
                onChange={(e) => patch("einsatzart", e.target.value)}
              >
                <option value="">—</option>
                {EINSATZARTEN.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Andere (Freitext)">
              <input
                className="input"
                value={form.einsatzartFreitext}
                onChange={(e) => patch("einsatzartFreitext", e.target.value)}
              />
            </Field>

            <Field label="Alarmierung">
              <input
                className="input num"
                type="datetime-local"
                value={form.alarmierungZeit}
                readOnly
                title="Alarmierungszeit wird vom Alarm-Eingang gesetzt und ist nicht editierbar."
              />
            </Field>

            {/* D-04b: Einsatzende — datetime-local, beim Speichern als ISO. */}
            <Field label="Einsatzende">
              <input
                className="input num"
                type="datetime-local"
                value={form.einsatzende}
                onChange={(e) => patch("einsatzende", e.target.value)}
                title="Leer = wird beim Abschluss automatisch aus den Fahrzeug-Rückkehrzeiten gesetzt."
              />
            </Field>

            <Field label="Alarmiert von">
              <div style={{ display: "flex", gap: 16, paddingTop: 8 }}>
                <Radio
                  name="alarmiertDurch"
                  value="BWST"
                  label="BWST"
                  checked={form.alarmiertDurch === "BWST"}
                  onChange={(v) => patch("alarmiertDurch", v)}
                />
                <Radio
                  name="alarmiertDurch"
                  value="LWZ"
                  label="LWZ"
                  checked={form.alarmiertDurch === "LWZ"}
                  onChange={(v) => patch("alarmiertDurch", v)}
                />
              </div>
            </Field>

            {/* D-04b: Einsatzleiter aus den Personen-Stammdaten (Name + Rang). */}
            <Field label="Einsatzleiter">
              <PersonSelect
                value={form.einsatzleiterPersonId}
                personen={personen}
                allowEmpty={formBasisRef.current?.einsatzleiterPersonId === null}
                onChange={(v) => patch("einsatzleiterPersonId", v)}
              />
            </Field>

            <Field label="Beteiligte Stellen" full>
              <div className="chips" style={{ paddingTop: 4 }}>
                {BETEILIGTE_STELLEN.map((s) => (
                  <Toggle
                    key={s}
                    label={s}
                    checked={form.beteiligteStellen.includes(s)}
                    onChange={() => toggleListItem("beteiligteStellen", s)}
                  />
                ))}
              </div>
            </Field>

            <Field label="Sonstige Feuerwehren" full>
              <div className="chips" style={{ paddingTop: 4 }}>
                {sonstigeFfAll.map((s) => (
                  <Toggle
                    key={s}
                    label={s}
                    checked={form.sonstigeAnwesendeFF.includes(s)}
                    onChange={() => toggleListItem("sonstigeAnwesendeFF", s)}
                  />
                ))}
              </div>
            </Field>

            <Field label="Sonstige FF (Freitext)" full>
              <input
                className="input"
                value={form.sonstigeFreitext}
                onChange={(e) => patch("sonstigeFreitext", e.target.value)}
                placeholder="z. B. FF Lambach mit Kran"
              />
            </Field>

            <Field label="Lage unter Kontrolle">
              <input
                className="input num"
                type="time"
                value={form.lageUnterKontrolle}
                onChange={(e) => patch("lageUnterKontrolle", e.target.value)}
              />
            </Field>
            <Field label="Brand aus">
              <input
                className="input num"
                type="time"
                value={form.brandAus}
                onChange={(e) => patch("brandAus", e.target.value)}
              />
            </Field>

            <Field label="Meldung von der Einsatzleitung" full>
              <textarea
                rows={6}
                placeholder="Freitext (kein Diktat bei Florian Eberstalzell)"
                className="input"
                style={{ resize: "vertical" }}
                value={form.meldungEinsatzleitung}
                onChange={(e) => patch("meldungEinsatzleitung", e.target.value)}
              />
            </Field>
            </fieldset>
          </form>
        )}
      </article>

      {/* ─── D-04d: Einsatzchronik — Lektorat (Inline-Edit + Soft-Delete) ─── */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">Einsatzchronik ({chronikSichtbar.length})</div>
          {chronikGeloescht > 0 ? (
            <button
              type="button"
              className="chip"
              onClick={() => setZeigeGeloeschte((v) => !v)}
              style={{ padding: "5px 10px", fontSize: 12 }}
            >
              {zeigeGeloeschte ? "gelöschte ausblenden" : `${chronikGeloescht} gelöschte anzeigen`}
            </button>
          ) : (
            <span className="card-meta">{selectedId ? "Auto-Sync" : "kein Einsatz"}</span>
          )}
        </div>
        {chronikErr ? <FehlerBox text={chronikErr} /> : null}
        {!selectedId ? (
          <p style={{ padding: "12px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Kein Einsatz ausgewählt.
          </p>
        ) : chronikSichtbar.length === 0 ? (
          <p style={{ padding: "12px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Noch keine Chronik-Einträge.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {chronikSichtbar.map((e) => {
              const istGeloescht = e.geloescht === true;
              const inEdit = chronikEdit?.id === e.id;
              const inLoesch = chronikLoeschId === e.id;
              const text = chronikText(e);
              const quelle = e.funkrufname ?? e.fahrzeugId ?? e.source ?? e.typ ?? "";
              return (
                <li
                  key={e.id}
                  className="crew-row"
                  style={{
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 4,
                    padding: "8px 10px",
                    opacity: istGeloescht ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: "var(--fg-2)",
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      {formatDateTime(e.zeitstempel)}
                      {quelle ? <span className="badge neutral">{quelle}</span> : null}
                      {e.pending ? <span className="badge warn">pending</span> : null}
                      {e.editiertAm ? (
                        <span className="badge neutral" title={`bearbeitet ${formatDateTime(e.editiertAm)}${e.editiertVon ? ` von ${e.editiertVon}` : ""}`}>
                          bearbeitet
                        </span>
                      ) : null}
                      {istGeloescht ? (
                        <span className="badge red" title={`gelöscht ${e.geloeschtAm ? formatDateTime(e.geloeschtAm) : ""}${e.geloeschtVon ? ` von ${e.geloeschtVon}` : ""}`}>
                          gelöscht
                        </span>
                      ) : null}
                    </span>
                    {!istGeloescht && !gesperrt && !inEdit && !inLoesch ? (
                      <span style={{ display: "flex", gap: 4 }}>
                        <IconBtn
                          title="Text bearbeiten"
                          disabled={chronikBusy}
                          onClick={() => {
                            setChronikErr(null);
                            setChronikLoeschId(null);
                            setChronikEdit({ id: e.id, text });
                          }}
                        >
                          <Pencil size={13} />
                        </IconBtn>
                        <IconBtn
                          title="Eintrag löschen"
                          tone="red"
                          disabled={chronikBusy}
                          onClick={() => {
                            setChronikErr(null);
                            setChronikEdit(null);
                            setChronikLoeschId(e.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </IconBtn>
                      </span>
                    ) : null}
                  </div>

                  {inEdit && chronikEdit ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        className="input"
                        rows={3}
                        maxLength={2000}
                        autoFocus
                        value={chronikEdit.text}
                        onChange={(ev) => setChronikEdit({ id: e.id, text: ev.target.value })}
                        onKeyDown={(ev) => {
                          if (ev.key === "Escape") setChronikEdit(null);
                          if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) void chronikSpeichern();
                        }}
                        style={{ resize: "vertical", fontSize: 13 }}
                      />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          type="button"
                          className="chip"
                          disabled={chronikBusy}
                          onClick={() => setChronikEdit(null)}
                          style={{ padding: "6px 10px", fontSize: 12 }}
                        >
                          <X size={12} /> Abbrechen
                        </button>
                        <button
                          type="button"
                          className="chip selected"
                          disabled={chronikBusy || !chronikEdit.text.trim()}
                          onClick={() => void chronikSpeichern()}
                          style={{ padding: "6px 10px", fontSize: 12 }}
                          title="Strg+Enter"
                        >
                          <Check size={12} /> {chronikBusy ? "speichert …" : "Speichern"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "var(--fg)",
                        whiteSpace: "pre-wrap",
                        textDecoration: istGeloescht ? "line-through" : "none",
                      }}
                    >
                      {text || (e.fotoId ? "(Foto)" : "—")}
                    </p>
                  )}

                  {inLoesch ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 8,
                        background: "var(--red-tint)",
                        border: "1px solid var(--red-border)",
                        fontSize: 12,
                        color: "var(--red)",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <AlertTriangle size={13} /> Eintrag wirklich löschen? Er bleibt im Audit-Trail, erscheint aber nicht mehr im PDF.
                      </span>
                      <span style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className="chip"
                          disabled={chronikBusy}
                          onClick={() => setChronikLoeschId(null)}
                          style={{ padding: "5px 10px", fontSize: 12 }}
                        >
                          Nein
                        </button>
                        <button
                          type="button"
                          className="chip"
                          disabled={chronikBusy}
                          onClick={() => void chronikLoeschen(e.id)}
                          style={{
                            padding: "5px 10px",
                            fontSize: 12,
                            background: "var(--red)",
                            color: "#fff",
                            borderColor: "var(--red)",
                          }}
                        >
                          <Trash2 size={12} /> {chronikBusy ? "löscht …" : "Ja, löschen"}
                        </button>
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      {/* ─── Rechts: Live-Fahrzeugberichte (D-04c: editierbar) ─── */}
      <aside className="card">
        <div className="card-head">
          <div className="card-title">Live-Fahrzeugberichte</div>
          <span className="card-meta">
            {selectedId ? `${fzgBerichte.length} Berichte · Auto-Sync` : "kein Einsatz"}
          </span>
        </div>
        {!selectedId ? (
          <p style={{ padding: "20px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Wähle einen Einsatz links um die Fahrzeugberichte zu sehen.
          </p>
        ) : fzgBerichte.length === 0 ? (
          <p style={{ padding: "20px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Noch keine Fahrzeugberichte. Sobald ein Tablet im Fahrzeug startet, erscheinen die Daten hier.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {fzgBerichte.map((b) => {
              const st = fzgEdits[b._id];
              const edit = st?.edit ?? editFromDoc(b);
              const patchKeys = st
                ? Object.keys(buildFzgPatch(b, st.basis, st.edit, selected?.alarmierungZeit))
                : [];
              const fzgDirty = patchKeys.length > 0;
              const slots = (b.mannschaft ?? []).filter(
                (m) => typeof m.personId === "number" && m.personId > 0,
              );
              const headcount =
                slots.length + (b.fahrerPersonId ? 1 : 0) + (b.fahrzeugKdtPersonId ? 1 : 0);
              const asAktiv = slots.filter((m) => m.atemschutzAktiv === true).length;
              const stat = b.status ?? "in_arbeit";
              const cfg = fzgConfig(fzgIdVon(b));
              const rufName = cfg?.abk ?? b.funkrufname ?? fzgIdVon(b);
              const speichert = fzgSaving === b._id;
              const err = fzgErr[b._id];
              return (
                <li
                  key={b._id}
                  className={`crew-row${fzgDirty ? " filled" : ""}`}
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 12px" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--fg-2)",
                      }}
                      title={cfg?.funkrufname ?? fzgIdVon(b)}
                    >
                      {rufName}
                    </span>
                    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {fzgDirty ? (
                        <span className="badge warn" title={`geändert: ${patchKeys.join(", ")}`}>
                          geändert
                        </span>
                      ) : null}
                      <span className={stat === "abgeschlossen" ? "badge ok" : "badge warn"}>
                        {stat === "abgeschlossen" ? "fertig" : "läuft"}
                      </span>
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>
                    {headcount} Pers. · {asAktiv} AS aktiv · {b.oelbindemittelSaecke ?? 0} Öl-Säcke
                  </p>

                  {/* D-04c: Mini-Formular — Kdt / Fahrer / EL-Flag / Zeiten / km / Mannschaft */}
                  <fieldset
                    disabled={gesperrt || speichert}
                    style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "grid", gap: 6 }}
                  >
                    <MiniField label="Fahrzeug-Kdt">
                      <PersonSelect
                        value={edit.fahrzeugKdtPersonId}
                        personen={personen}
                        allowEmpty={(st?.basis ?? edit).fahrzeugKdtPersonId === null}
                        compact
                        onChange={(v) => fzgPatchEdit(b, (e) => ({ ...e, fahrzeugKdtPersonId: v }))}
                      />
                    </MiniField>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg)" }}>
                      <input
                        type="checkbox"
                        checked={edit.kdtIstEinsatzleiter}
                        onChange={(ev) =>
                          fzgPatchEdit(b, (e) => ({ ...e, kdtIstEinsatzleiter: ev.target.checked }))
                        }
                        style={{ accentColor: "var(--ok)", margin: 0 }}
                      />
                      Kdt ist Einsatzleiter
                    </label>
                    <MiniField label="Fahrer">
                      <PersonSelect
                        value={edit.fahrerPersonId}
                        personen={personen}
                        allowEmpty={(st?.basis ?? edit).fahrerPersonId === null}
                        compact
                        onChange={(v) => fzgPatchEdit(b, (e) => ({ ...e, fahrerPersonId: v }))}
                      />
                    </MiniField>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <MiniField label="von">
                        <input
                          className="input num"
                          type="time"
                          value={edit.von}
                          onChange={(ev) => fzgPatchEdit(b, (e) => ({ ...e, von: ev.target.value }))}
                          style={miniInput}
                          title="Abfahrt (HH:MM, Datum = Einsatztag)"
                        />
                      </MiniField>
                      <MiniField label="bis">
                        <input
                          className="input num"
                          type="time"
                          value={edit.bis}
                          onChange={(ev) => fzgPatchEdit(b, (e) => ({ ...e, bis: ev.target.value }))}
                          style={miniInput}
                          title="Rückkehr (HH:MM, Datum = Einsatztag bzw. Folgetag nach Mitternacht)"
                        />
                      </MiniField>
                      <MiniField label="km">
                        <input
                          className="input num"
                          type="number"
                          min={0}
                          step={0.1}
                          inputMode="decimal"
                          value={edit.gefahrenKm}
                          onChange={(ev) => fzgPatchEdit(b, (e) => ({ ...e, gefahrenKm: ev.target.value }))}
                          style={miniInput}
                          title="Gefahrene km"
                        />
                      </MiniField>
                    </div>
                    <MiniField label={`Mannschaft (${edit.slots.filter((p) => p !== null).length}/${edit.slots.length})`}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                        {edit.slots.map((pid, i) => (
                          <PersonSelect
                            key={i}
                            value={pid}
                            personen={personen}
                            allowEmpty
                            compact
                            placeholder={`Slot ${i + 1}`}
                            onChange={(v) =>
                              fzgPatchEdit(b, (e) => {
                                const next = [...e.slots];
                                next[i] = v;
                                return { ...e, slots: next };
                              })
                            }
                          />
                        ))}
                      </div>
                    </MiniField>
                  </fieldset>

                  {err ? <FehlerBox text={err} compact /> : null}

                  {fzgDirty || err ? (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="chip"
                        disabled={speichert}
                        onClick={() => fzgVerwerfen(b._id)}
                        style={{ padding: "6px 10px", fontSize: 12 }}
                      >
                        <X size={12} /> Verwerfen
                      </button>
                      <button
                        type="button"
                        className="chip selected"
                        disabled={speichert || gesperrt || !fzgDirty}
                        onClick={() => void fzgSpeichern(b)}
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        title={`Schreibt nur: ${patchKeys.join(", ") || "—"}`}
                      >
                        <Save size={12} /> {speichert ? "speichert …" : "Speichern"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: 8,
            }}
          >
            Aggregation (Live)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Stat
              label="Eingesetzt"
              value={selectedId && fzgBerichte.length > 0 ? String(aggregation.mannschaftGesamt) : "—"}
            />
            <Stat
              label="AS-Träger am Fz"
              value={selectedId && fzgBerichte.length > 0 ? String(aggregation.asTraegerVerfuegbar) : "—"}
              tone="as"
            />
            <Stat
              label="Öl Säcke"
              value={selectedId && fzgBerichte.length > 0 ? String(aggregation.oelSaecke) : "—"}
              tone="warn"
            />
          </div>
        </div>
      </aside>

      {/* D-04a: Reaktivieren-Dialog — Grund optional (analog BerichtDetail). */}
      {reaktivModal && selected ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            background: "rgba(0, 0, 0, 0.55)",
            padding: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setReaktivModal(false);
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480 }}>
            <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
              Bericht reaktivieren
            </h4>
            <p style={{ marginTop: 6, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
              <strong>{selected.einsatzart ?? selected.einsatzartFreitext ?? selected._id}</strong> ·{" "}
              {selected.einsatzort}
              <br />
              Der Schreibschutz wird aufgehoben, der Bericht erscheint wieder unter „Aktiv" und muss danach
              erneut abgeschlossen werden. Die Reaktivierung wird im Audit-Trail protokolliert.
            </p>
            {reaktivErr ? <FehlerBox text={reaktivErr} /> : null}
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">Grund (optional, für Audit)</label>
              <textarea
                className="input"
                rows={2}
                value={reaktivGrund}
                onChange={(e) => setReaktivGrund(e.target.value)}
                placeholder="z. B. Nachtrag Fahrzeugbericht TANK"
                style={{ resize: "vertical" }}
                autoFocus
              />
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => setReaktivModal(false)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="cta"
                disabled={busy}
                onClick={() => void onReaktivieren()}
                style={{
                  width: "auto",
                  padding: "10px 16px",
                  fontSize: 14,
                  background:
                    "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)",
                }}
              >
                <Unlock size={14} /> {busy ? "reaktiviert …" : "Reaktivieren"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const miniInput: React.CSSProperties = { padding: "6px 8px", fontSize: 12 };

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="field" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label className="caption">{label}</label>
      <div>{children}</div>
    </div>
  );
}

/** Kompaktes Label+Input fuer die Fahrzeugbericht-Karten (rechte Spalte). */
function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * D-04: Personen-Select (Name + Rang). Eine gesetzte, aber in den Stammdaten
 * unbekannte ID (ausgeschieden / Stammdaten nicht geladen) bleibt als
 * "#id"-Option erhalten, damit der Wert nicht stillschweigend verloren geht.
 * allowEmpty=false blendet "—" aus, wenn der Server das Feld nicht leeren
 * kann (Personen-Felder am Einsatz/Fahrzeugbericht).
 */
function PersonSelect({
  value,
  personen,
  onChange,
  allowEmpty,
  compact,
  placeholder,
}: {
  value: number | null;
  personen: PersonItem[];
  onChange: (v: number | null) => void;
  allowEmpty?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const inListe = value !== null && personen.some((p) => p.syBosId === value);
  return (
    <select
      className="input"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      style={compact ? miniInput : undefined}
    >
      {allowEmpty || value === null ? <option value="">{placeholder ?? "—"}</option> : null}
      {value !== null && !inListe ? (
        <option value={value}>#{value} (nicht in Stammdaten)</option>
      ) : null}
      {personen.map((p) => (
        <option key={p.syBosId} value={p.syBosId}>
          {personLabel(p)}
        </option>
      ))}
    </select>
  );
}

function ModusChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      style={{
        padding: "6px 12px",
        fontSize: 12,
        ...(active ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" } : {}),
      }}
    >
      {label}
    </button>
  );
}

function IconBtn({
  title,
  onClick,
  disabled,
  tone,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "red";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled ?? false}
      className="chip"
      style={{
        padding: "4px 6px",
        ...(tone === "red" ? { color: "var(--red)" } : {}),
      }}
    >
      {children}
    </button>
  );
}

/** Fehler-Box (rot) — gleiche Optik wie ErrorBanner in Verwaltung.tsx. */
function FehlerBox({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div
      style={{
        marginBottom: compact ? 0 : 12,
        padding: compact ? "6px 8px" : "8px 12px",
        borderRadius: 8,
        background: "var(--red-tint)",
        color: "var(--red)",
        fontSize: 12,
        border: "1px solid var(--red-border)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <AlertTriangle size={13} /> {text}
    </div>
  );
}

function Radio({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked?: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <label
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg)" }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked ?? false}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ accentColor: "var(--red)" }}
      />
      {label}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked?: boolean;
  onChange?: () => void;
}) {
  return (
    <label className="chip">
      <input
        type="checkbox"
        checked={checked ?? false}
        onChange={() => onChange?.()}
        style={{ accentColor: "var(--info)", margin: 0 }}
      />
      {label}
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "as" | "warn" }) {
  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 16,
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          color: tone === "as" ? "var(--as)" : tone === "warn" ? "var(--warn)" : "var(--fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function toLocalDt(iso: string): string {
  try {
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

/** datetime-local-String (lokale Zeit) → ISO. Leer/unparsbar → undefined. */
function fromLocalDt(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}. ${hh}:${mi}`;
}

/** ISO-Timestamp → "HH:mm" fuer time-Input. Akzeptiert auch leere/undefined Werte. */
function toTime(v: unknown): string {
  if (typeof v !== "string" || !v) return "";
  // Wenn schon HH:mm: zurueckgeben
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return "";
  }
}

/** "HH:mm" → ISO-Timestamp. Leer → undefined (PUT laesst Feld weg).
 *  AUDIT-08: Datum aus refIso (= Alarmierungszeit) statt "heute" — sonst
 *  bekaeme ein am Folgetag nachgetragener Wert das falsche Datum. Liegt das
 *  Ergebnis mehr als 2 min VOR der Referenz, war der Einsatz ueber
 *  Mitternacht → +1 Tag (Logik-Vorbild: hhmmToISOAt in
 *  apps/pwa/src/pages/BerichtPage.tsx). */
function fromTime(hhmm: string, refIso?: string): string | undefined {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  const refParsed = refIso ? new Date(refIso) : new Date();
  const ref = Number.isNaN(refParsed.getTime()) ? new Date() : refParsed;
  const d = new Date(ref);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  // Einsatz ueber Mitternacht: "Brand aus 00:30" bei Alarm 23:40 → Folgetag.
  if (d.getTime() < ref.getTime() - 2 * 60_000) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
