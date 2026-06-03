import { EINSATZARTEN } from "@hotdoc/shared";
import { Flame, GraduationCap, MapPin, Plus, Users, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiCall, ApiError } from "../lib/api";
import { enqueueEinsatz } from "../lib/einsatz-outbox";
import { AddressAutocomplete, type GeocodeMatch } from "./AddressAutocomplete";
import { PersonPickerModal, type PickPerson } from "./PersonPickerModal";

export type EinsatzTyp = "manuell" | "lotsendienst" | "uebung";

interface ManuellAnlageBody {
  einsatzTyp: EinsatzTyp;
  einsatzort: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  /** Aus Geocoder — wird auf der Florian-Karte als Marker dargestellt. */
  koordinaten?: { lat: number; lng: number };
  grund?: string;
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  verrechenbar?: boolean;
  rechnungsadresse?: string;
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: string;
  /** Auto-Pflichtbereich-Erkennung — wird gesetzt wenn der Einsatzort im
   *  Gemeindegebiet Eberstalzell liegt (siehe Backend isInEberstalzell). */
  pflichtbereich?: boolean;
  einsatzzoneEzell?: boolean;
  /** UUID — Idempotenz-Schutz fuer Retry bei Netz-Wackler / Offline-Outbox. */
  idempotencyKey: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nach erfolgreicher Anlage wird die neue Einsatz-ID zurückgeliefert.
   *  `extras` trägt die Übungs-Vorauswahl (Übungsleiter-Person + Übungstyp)
   *  damit das Fahrzeug-Tablet sie als Kdt + Auftrag vorbelegen kann (#155/#162). */
  onCreated: (
    einsatzId: string,
    typ: EinsatzTyp,
    extras?: { uebungsleiterPerson?: PickPerson | null; uebungsTyp?: string },
  ) => void;
  /** Initial-Typ-Auswahl (wenn der User von einer Quick-Action kommt). */
  initialTyp?: EinsatzTyp;
}

const UEBUNGS_TYPEN = [
  "Atemschutz",
  "Technische Hilfeleistung",
  "Höhenrettung",
  "Sanitätsdienst",
  "Funk",
  "Allgemeine Übung",
  "Bewerb",
  "Sonstige",
] as const;

// U-06: einfachere Labels. "Manuell" ist Tech-Jargon — "Einsatz ohne Alarm"
// trifft, was es wirklich ist (im Gegensatz zum BlaulichtSMS-Alarm).
const TYP_META: Record<
  EinsatzTyp,
  { label: string; sub: string; icon: typeof Wrench; color: string; glow: string }
> = {
  manuell: {
    label: "Einsatz ohne Alarm",
    sub: "Bericht ohne BlaulichtSMS-Alarm",
    icon: Wrench,
    color: "var(--info)",
    glow: "var(--glow-info)",
  },
  lotsendienst: {
    label: "Lotsendienst",
    sub: "Polizei / Rettung · meist verrechenbar",
    icon: MapPin,
    color: "var(--warn)",
    glow: "var(--glow-warn)",
  },
  uebung: {
    label: "Übung",
    sub: "Training · zählt für AS-Stunden",
    icon: GraduationCap,
    color: "var(--ok)",
    glow: "var(--glow-ok)",
  },
};

// U-08: localStorage-Key fuer haeufig verwendete Einsatzarten. Wir behalten
// die letzten 5 zur schnelleren Auswahl.
const RECENT_KEY = "hotdoc.einsatzart.recent";
const RECENT_MAX = 5;

function loadRecentEinsatzarten(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecentEinsatzart(art: string): void {
  if (!art) return;
  try {
    const cur = loadRecentEinsatzarten().filter((x) => x !== art);
    const next = [art, ...cur].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage gesperrt — egal, kein UX-Block.
  }
}

/**
 * Einsatzarten — alphabetisch sortiert (User-Wunsch). Frueher waren
 * "haeufige" Einsatzarten vorgezogen, aber das war fuer neue Mitarbeiter
 * verwirrend (anderer Stack wenn sie etwas suchen). Reine A-Z-Sortierung
 * mit Locale-Compare (Umlaute korrekt).
 */
function sortedEinsatzarten(): string[] {
  return [...EINSATZARTEN].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Schlanke Tablet-Variante des Manueller-Bericht-Anlage-Modals.
 * Statt eines mehrstufigen Wizards eine flache Form mit Type-Selector
 * oben — Touch-tauglich, ohne unnötiges Scrollen.
 *
 * Wird sowohl vom Fahrzeug-Tablet (BerichtPage) als auch von der
 * Florianstation (ZentralePage) verwendet — der Anlage-Endpoint ist
 * derselbe (`POST /api/einsaetze/manuell`, requireAuth("einsatzleiter")).
 *
 * **Wichtig:** auf Fahrzeug-Tablets mit Rolle "mannschaft" wird der
 * Endpoint 403 zurückgeben. Wir behandeln das als klare Fehlermeldung.
 */
export function NeuerEinsatzTabletModal({ open, onClose, onCreated, initialTyp }: Props) {
  const [typ, setTyp] = useState<EinsatzTyp>(initialTyp ?? "manuell");
  /** U-08: Suchfilter ueber die Einsatzart-Pillen. */
  const [einsatzartSuche, setEinsatzartSuche] = useState("");
  /** U-08: zuletzt verwendete Einsatzarten (aus localStorage). */
  const [recentEinsatzarten, setRecentEinsatzarten] = useState<string[]>(() => loadRecentEinsatzarten());
  const [einsatzort, setEinsatzort] = useState("");
  /** Koordinaten aus dem Geocoder (falls der User einen Treffer geklickt hat).
   *  Wird beim Submit mit ans Backend geschickt — die Florian-Karte zeigt
   *  dann sofort den Einsatzort-Marker. */
  const [koord, setKoord] = useState<{ lat: number; lng: number } | null>(null);
  /** Gewählte Einsatzart aus der Pillen-Liste (nur bei typ="manuell" relevant). */
  const [einsatzart, setEinsatzart] = useState<string>("");
  const [einsatzartFreitext, setEinsatzartFreitext] = useState("");
  const [grund, setGrund] = useState("");
  // Lotsendienst-Felder
  const [auftraggeber, setAuftraggeber] = useState("");
  const [route, setRoute] = useState("");
  const [verrechenbar, setVerrechenbar] = useState(true);
  const [rechnungsadresse, setRechnungsadresse] = useState("");
  // Übungs-Felder
  const [uebungThema, setUebungThema] = useState("");
  /** Person aus der syBOS-Liste, die die Übung leitet. */
  const [uebungsleiterPerson, setUebungsleiterPerson] = useState<PickPerson | null>(null);
  const [uebungsTyp, setUebungsTyp] = useState<string>("");
  /** Person-Picker für Übungsleiter — offen/zu. */
  const [pickerOpen, setPickerOpen] = useState(false);
  // Submit-State
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** syBOS-Personalliste (für PickerModal). Wird einmalig beim Öffnen geladen.
   *  Muss VOR den useEffect-Hooks deklariert sein, damit der Loader-Effekt
   *  darauf zugreifen kann (block-scoped variable order). */
  const [personen, setPersonen] = useState<PickPerson[]>([]);

  // ─── State-Sync: bei jedem Öffnen den Initial-Typ frisch setzen ───
  // Bug-Fix: useState(initialTyp ?? "manuell") läuft NUR beim ersten Mount.
  // Wenn das Modal geschlossen wird und mit anderem initialTyp wieder
  // geöffnet wird, behielt es den alten State. → useEffect.
  useEffect(() => {
    if (open) {
      setTyp(initialTyp ?? "manuell");
      // U-08: Recent-Liste beim Oeffnen frisch laden + Suche leeren.
      setRecentEinsatzarten(loadRecentEinsatzarten());
      setEinsatzartSuche("");
    }
  }, [open, initialTyp]);

  // U-06: bei Wechsel des Einsatz-Typs typ-spezifische Felder zuruecksetzen.
  // Damit verirren sich keine Lotsendienst-Werte in einer Uebung etc.
  function changeTyp(nextTyp: EinsatzTyp): void {
    if (nextTyp === typ) return;
    setTyp(nextTyp);
    // Lotsendienst-Felder
    setAuftraggeber("");
    setRoute("");
    setVerrechenbar(true);
    setRechnungsadresse("");
    // Uebungs-Felder
    setUebungThema("");
    setUebungsleiterPerson(null);
    setUebungsTyp("");
    // manuell-Felder
    setGrund("");
    // Einsatzart bei Wechsel weg von "manuell" loeschen — bei "lotsendienst"
    // und "uebung" wird sie nicht angezeigt, sollte aber auch nicht alt
    // weiterleben.
    if (nextTyp !== "manuell") {
      setEinsatzart("");
    }
    setErr(null);
  }

  // ─── Personalliste laden (für Übungsleiter-Picker) ───
  // Wird nur beim ersten Öffnen geholt — die Liste ist seitens Backend
  // cached. Bei Backend-Ausfall bleibt der Picker leer und der User
  // sieht "keine Personen gefunden" im Picker.
  useEffect(() => {
    if (!open || personen.length > 0) return;
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
          .sort((a, b) =>
            `${a.nachname} ${a.vorname}`.localeCompare(`${b.nachname} ${b.vorname}`),
          );
        setPersonen(list);
      } catch {
        // Backend nicht erreichbar — Picker bleibt leer, kein blockierender Fehler.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, personen.length]);

  if (!open) return null;

  function resetAll() {
    setEinsatzort("");
    setKoord(null);
    setEinsatzart("");
    setEinsatzartFreitext("");
    setGrund("");
    setAuftraggeber("");
    setRoute("");
    setVerrechenbar(true);
    setRechnungsadresse("");
    setUebungThema("");
    setUebungsleiterPerson(null);
    setUebungsTyp("");
    setErr(null);
  }

  async function submit() {
    // #153 + #172 (Test 2026-06-03): Pflicht-Validierung beim ANLEGEN deutlich
    // entschärft — die App soll sofort einen leeren Rahmen erlauben, damit das
    // Personal sofort erfasst wird; Details (Thema, Adresse, Übungsleiter)
    // ergänzt der Kdt am Einsatzort. Vollständigkeits-Check kommt beim ABSCHLUSS.
    //   • Übung: Thema NICHT mehr Pflicht.
    //   • Lotsendienst: Auftraggeber NICHT mehr Pflicht.
    //   • Adresse: leerer Start erlaubt (war "weder Adresse noch GPS" → Fehler).
    // Wenn Adresse + GPS leer sind, setzen wir einen Platzhalter — Backend
    // braucht aktuell min. 3 Zeichen.
    setBusy(true);
    setErr(null);
    // Idempotency-Key — derselbe Key, falls Retry oder Outbox-Replay.
    const idempotencyKey = crypto.randomUUID();
    // Fallback-Einsatzort wenn nur GPS gesetzt ist:
    //   1. Versuche Reverse-Geocoding (Photon) — wenn Adresse → nutze die
    //   2. Sonst (z.B. Autobahn, freies Feld) → "GPS lat, lng"
    // Backend braucht min 3 Zeichen einsatzort.
    let ortString = einsatzort.trim();
    let autoPflicht: { pflichtbereich?: boolean; einsatzzoneEzell?: boolean } = {};
    if (!ortString && koord) {
      // Reverse-Geocoding mit knappem 2.5-s-Timeout — wenn Photon laenger
      // braucht, fallen wir auf GPS-String zurueck. User-Wartezeit > 3 s
      // ist beim Einsatz-Anlegen nicht akzeptabel ("ca. 20 sekunden"-Bug).
      // Backend macht den Geocode-Lookup trotzdem im Hintergrund + cached,
      // beim naechsten Mal in der Umgebung ist's instant.
      try {
        const ctl = new AbortController();
        const timeoutId = setTimeout(() => ctl.abort(), 2_500);
        const geo = await apiCall<{
          ok: true;
          address: string | null;
          inEberstalzell: boolean;
          pflichtbereich?: boolean;
          einsatzzoneEzell?: boolean;
        }>(
          `/api/geocoding/reverse?lat=${encodeURIComponent(String(koord.lat))}&lng=${encodeURIComponent(String(koord.lng))}`,
          { signal: ctl.signal },
        );
        clearTimeout(timeoutId);
        if (geo.address) {
          ortString = geo.address;
        } else {
          ortString = `GPS ${koord.lat.toFixed(5)}, ${koord.lng.toFixed(5)}`;
        }
        if (geo.pflichtbereich) autoPflicht.pflichtbereich = true;
        if (geo.einsatzzoneEzell) autoPflicht.einsatzzoneEzell = true;
      } catch {
        // Geocoding-Timeout oder Fehler → GPS-Fallback. Pflichtbereich
        // wird trotzdem clientseitig via Bbox erkannt: Eberstalzell-Box
        // liegt zwischen 48.00-48.08 lat / 13.93-14.04 lng.
        ortString = `GPS ${koord.lat.toFixed(5)}, ${koord.lng.toFixed(5)}`;
        const inE =
          koord.lat >= 48.0 &&
          koord.lat <= 48.08 &&
          koord.lng >= 13.93 &&
          koord.lng <= 14.04;
        if (inE) {
          autoPflicht.pflichtbereich = true;
          autoPflicht.einsatzzoneEzell = true;
        }
      }
    }
    // Wenn weiterhin nichts da ist (kein Eingabe, kein GPS) → Platzhalter
    // setzen. Der Kdt ergänzt die Adresse später per GPS-Button am Tablet.
    // Backend braucht min. 3 Zeichen.
    if (!ortString)
      ortString = typ === "uebung" ? "Übungsort folgt" : "Ort noch nicht erfasst";
    const body: ManuellAnlageBody = {
      einsatzTyp: typ,
      einsatzort: ortString,
      ...(einsatzart ? { einsatzart } : {}),
      ...(einsatzartFreitext.trim()
        ? { einsatzartFreitext: einsatzartFreitext.trim() }
        : {}),
      ...(koord ? { koordinaten: koord } : {}),
      ...(grund.trim() ? { grund: grund.trim() } : {}),
      // Auto-Pflichtbereich-Erkennung bei Eberstalzell (siehe Backend
      // routes/geocoding.ts:isInEberstalzell). Wird vom Reverse-Geocode-
      // Call oben mitgeliefert wenn der Punkt in der Gemeinde-Bbox liegt.
      ...autoPflicht,
      idempotencyKey,
    };
    if (typ === "lotsendienst") {
      body.lotsendienstAuftraggeber = auftraggeber.trim();
      if (route.trim()) body.lotsendienstRoute = route.trim();
      body.verrechenbar = verrechenbar;
      if (rechnungsadresse.trim()) body.rechnungsadresse = rechnungsadresse.trim();
    }
    if (typ === "uebung") {
      body.uebungThema = uebungThema.trim();
      if (uebungsleiterPerson) {
        body.uebungsleiter = `${uebungsleiterPerson.nachname} ${uebungsleiterPerson.vorname}`.trim();
      }
      if (uebungsTyp) body.uebungsTyp = uebungsTyp;
    }
    try {
      const result = await apiCall<{ ok: true; id: string }>(
        "/api/einsaetze/manuell",
        { method: "POST", body },
      );
      // U-08: Einsatzart in die "Haeufig"-Liste persistieren — nur bei
      // erfolgreichem Submit, damit nicht jeder Probe-Klick reingerutscht.
      if (typ === "manuell" && einsatzart) {
        pushRecentEinsatzart(einsatzart);
      }
      // Vorauswahl VOR resetAll sichern, damit das Fahrzeug-Tablet sie
      // als Kdt + Auftrag vorbelegen kann (#155/#162).
      const extras =
        typ === "uebung"
          ? { uebungsleiterPerson, uebungsTyp }
          : undefined;
      resetAll();
      onCreated(result.id, typ, extras);
    } catch (e) {
      // Schema-Fehler / 4xx → kein Outbox-Eintrag, Bug zeigen
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setErr(`Anlage fehlgeschlagen: HTTP ${e.status} ${e.message}`);
        setBusy(false);
        return;
      }
      // Netz-Fehler / 5xx → in die Outbox, nicht stoeren
      try {
        await enqueueEinsatz(idempotencyKey, body as unknown as Record<string, unknown>);
        resetAll();
        // Wir signalisieren Erfolg mit Hinweis dass der Sync laeuft. Auto-Open
        // kommt sobald der Outbox-Worker im Hintergrund den Einsatz beim
        // Backend angelegt hat (max 30 s + naechster Bericht-Poll).
        onCreated(`outbox:einsatz:${idempotencyKey}`, typ);
      } catch (outboxErr) {
        const msg = outboxErr instanceof Error ? outboxErr.message : String(outboxErr);
        setErr(`Anlage UND lokale Speicherung fehlgeschlagen: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const ActiveIcon = TYP_META[typ].icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="neuer-einsatz-title"
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
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
          // Breiter (720 statt 560), damit die Hochkant-Android-Tastatur
          // dem Formular nicht den Atem nimmt. 100dvh statt 100vh, damit
          // bei eingeblendeter Tastatur trotzdem scrollbar bleibt.
          // D-18: Modal-Width Stufe md (720px) — Standard-Editor.
          width: "min(var(--modal-w-md), calc(100% - 24px))",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "auto",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: `var(--glass-shadow-1), ${TYP_META[typ].glow}`,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: 14,
              background:
                `linear-gradient(135deg, ${TYP_META[typ].color}, color-mix(in srgb, ${TYP_META[typ].color} 60%, #000))`,
              color: "#fff",
              boxShadow: TYP_META[typ].glow,
            }}
          >
            <ActiveIcon size={22} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <h2
              id="neuer-einsatz-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "var(--tracking-tight)",
              }}
            >
              Neuen Bericht anlegen
            </h2>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginTop: 2,
              }}
            >
              {TYP_META[typ].sub}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        {/* Type-Selector */}
        <div className="grid-3" style={{ gap: 8 }}>
          {(["manuell", "lotsendienst", "uebung"] as EinsatzTyp[]).map((t) => {
            const Icon = TYP_META[t].icon;
            const active = t === typ;
            return (
              <button
                key={t}
                type="button"
                onClick={() => changeTyp(t)}
                className="vehicle-chip"
                style={{
                  ...(active
                    ? {
                        borderColor: TYP_META[t].color,
                        background: `color-mix(in srgb, ${TYP_META[t].color} 18%, var(--glass-2))`,
                        boxShadow: TYP_META[t].glow,
                      }
                    : {}),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 8px",
                }}
              >
                <Icon size={20} strokeWidth={2.2} color={active ? TYP_META[t].color : "var(--fg-2)"} />
                <div className="code" style={{ fontSize: 12 }}>
                  {TYP_META[t].label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Einsatzart-Pillen — NUR bei "Neuer Einsatz" (manuell) sichtbar.
            U-08: Such-Input + "Haeufig"-Sektion mit den letzten 5 Auswahlen. */}
        {typ === "manuell" ? (
          <div className="field">
            <label className="caption">Einsatzart</label>
            <div className="input-row filled" style={{ paddingLeft: 14, marginBottom: 8 }}>
              <Wrench size={14} color="var(--fg-3)" />
              <input
                type="search"
                value={einsatzartSuche}
                onChange={(e) => setEinsatzartSuche(e.target.value)}
                placeholder="Stichwort suchen …"
                autoFocus
              />
              {einsatzartSuche && (
                <button
                  type="button"
                  onClick={() => setEinsatzartSuche("")}
                  aria-label="Suche loeschen"
                  className="icon-btn"
                  style={{ width: 30, height: 30, minHeight: 30 }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Haeufig-Sektion — nur ohne aktive Suche und nur wenn es Eintraege gibt */}
            {!einsatzartSuche.trim() && recentEinsatzarten.length > 0 ? (
              <>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "var(--tracking-caps)",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                    marginBottom: 6,
                  }}
                >
                  Haeufig
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px dashed var(--border)",
                  }}
                >
                  {recentEinsatzarten.map((art) => {
                    const active = einsatzart === art;
                    return (
                      <button
                        key={`recent:${art}`}
                        type="button"
                        onClick={() => setEinsatzart(active ? "" : art)}
                        className={`chip${active ? " selected" : ""}`}
                        style={{
                          fontSize: 12,
                          padding: "6px 10px",
                          minHeight: 32,
                          lineHeight: 1.2,
                          gap: 4,
                          ...(active
                            ? {
                                background: "var(--info-tint)",
                                color: "var(--info)",
                                borderColor: "var(--blue-border)",
                                boxShadow: "var(--glow-info)",
                              }
                            : {}),
                        }}
                      >
                        {active ? (
                          <Flame size={10} strokeWidth={2.4} style={{ color: "var(--info)" }} />
                        ) : null}
                        {art}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                maxHeight: 180,
                overflowY: "auto",
                padding: 2,
              }}
            >
              {(() => {
                const q = einsatzartSuche.trim().toLowerCase();
                const all = sortedEinsatzarten();
                const list = q ? all.filter((a) => a.toLowerCase().includes(q)) : all;
                if (list.length === 0) {
                  return (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-3)",
                        padding: "10px 4px",
                      }}
                    >
                      Kein Treffer · nimm den Stichwort-Freitext unten.
                    </div>
                  );
                }
                return list.map((art) => {
                  const active = einsatzart === art;
                  return (
                    <button
                      key={art}
                      type="button"
                      onClick={() => setEinsatzart(active ? "" : art)}
                      className={`chip${active ? " selected" : ""}`}
                      style={{
                        // D-07: 11.5 → var(--font-sm) (12px) — eine Stufe groesser
                        // im Type-Scale. Praktisch identisch, aber token-treu.
                        fontSize: "var(--font-sm)",
                        padding: "5px 9px",
                        minHeight: 28,
                        lineHeight: 1.2,
                        gap: 4,
                        ...(active
                          ? {
                              background: "var(--info-tint)",
                              color: "var(--info)",
                              borderColor: "var(--blue-border)",
                              boxShadow: "var(--glow-info)",
                            }
                          : {}),
                      }}
                    >
                      {active ? (
                        <Flame size={10} strokeWidth={2.4} style={{ color: "var(--info)" }} />
                      ) : null}
                      {art}
                    </button>
                  );
                });
              })()}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--fg-3)",
                letterSpacing: "0.06em",
                marginTop: 6,
              }}
            >
              Optional · falls keine passt, einfach im Stichwort-Feld unten frei tippen.
            </div>
          </div>
        ) : null}

        {/* Gemeinsame Felder */}
        <div className="field">
          <label className="caption">
            {typ === "uebung" ? "Übungsort" : typ === "lotsendienst" ? "Treffpunkt / Strecken-Anfang" : "Einsatzort / Ortsangabe"}
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <div style={{ flex: 1 }}>
              <AddressAutocomplete
                value={einsatzort}
                onChange={(text) => {
                  setEinsatzort(text);
                  if (koord !== null) setKoord(null);
                }}
                onPick={(m: GeocodeMatch) => {
                  setEinsatzort(m.label);
                  setKoord({ lat: m.lat, lng: m.lng });
                }}
                autoFocus
                placeholder="z. B. Solarstraße 5, 4653 Eberstalzell — oder leer lassen für GPS"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!navigator.geolocation) {
                  setErr("Browser unterstützt keine Geolocation.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setKoord({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    if (!einsatzort.trim()) {
                      setEinsatzort(`GPS ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                    }
                  },
                  (gpsErr) => {
                    setErr(`GPS nicht verfügbar: ${gpsErr.message}`);
                  },
                  { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 },
                );
              }}
              title="Aktuelle GPS-Position als Adresse übernehmen"
              style={{
                padding: "0 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--info-tint)",
                color: "var(--info)",
                border: "1px solid var(--blue-border)",
                borderRadius: 10,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
              }}
            >
              <MapPin size={14} /> GPS
            </button>
          </div>
          {koord ? (
            <div
              style={{
                marginTop: 6,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "var(--ok)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MapPin size={10} />
              {koord.lat.toFixed(5)}, {koord.lng.toFixed(5)} · Florian-Karte zeigt Marker direkt an
            </div>
          ) : null}
        </div>
        <div className="field">
          <label className="caption">
            {typ === "uebung"
              ? "Beschreibung (optional)"
              : typ === "manuell"
                ? "Stichwort / Freitext (falls oben nichts passt)"
                : "Stichwort / Freitext"}
          </label>
          <input
            className="input"
            value={einsatzartFreitext}
            onChange={(e) => setEinsatzartFreitext(e.target.value)}
            placeholder={
              typ === "uebung" ? "z. B. Innenangriff Übungshaus" : "z. B. Türöffnung Wohnung"
            }
          />
        </div>

        {/* Typ-spezifische Felder */}
        {typ === "lotsendienst" ? (
          <>
            <div className="field">
              <label className="caption">Auftraggeber</label>
              <input
                className="input"
                value={auftraggeber}
                onChange={(e) => setAuftraggeber(e.target.value)}
                placeholder="z. B. Polizei Wels-Land"
              />
            </div>
            <div className="field">
              <label className="caption">Route (optional)</label>
              <input
                className="input"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="z. B. Anfang → Schwertransport-Etappe → Ende"
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--glass-3)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-s)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={verrechenbar}
                onChange={(e) => setVerrechenbar(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Verrechenbar</span>
            </label>
            {verrechenbar ? (
              <div className="field">
                <label className="caption">Rechnungsadresse</label>
                <input
                  className="input"
                  value={rechnungsadresse}
                  onChange={(e) => setRechnungsadresse(e.target.value)}
                  placeholder="z. B. Polizei OÖ, Landeskommando"
                />
              </div>
            ) : null}
          </>
        ) : null}

        {typ === "uebung" ? (
          <>
            <div className="field">
              <label className="caption">Thema · kann auch später ergänzt werden</label>
              <input
                className="input"
                value={uebungThema}
                onChange={(e) => setUebungThema(e.target.value)}
                placeholder="z. B. Innenangriff unter Atemschutz"
              />
            </div>
            <div className="field">
              <label className="caption">Übungsleiter</label>
              {uebungsleiterPerson ? (
                <div
                  className="person filled"
                  style={{ cursor: "default", gap: 12 }}
                >
                  <span
                    className="avatar"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--ok-tint), var(--glass-2))",
                      color: "var(--ok)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  >
                    {initials(uebungsleiterPerson)}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
                      {uebungsleiterPerson.nachname} {uebungsleiterPerson.vorname}
                    </span>
                    {uebungsleiterPerson.dienstgrad ? (
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
                        {uebungsleiterPerson.dienstgrad}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setPickerOpen(true)}
                    aria-label="Übungsleiter ändern"
                    title="Übungsleiter ändern"
                  >
                    <Users size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => setUebungsleiterPerson(null)}
                    aria-label="Übungsleiter entfernen"
                    title="Übungsleiter entfernen"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="crew-row empty"
                  onClick={() => setPickerOpen(true)}
                  style={{ cursor: "pointer", width: "100%" }}
                >
                  <span className="crew-num">
                    <Users size={13} />
                  </span>
                  <span className="crew-name placeholder">
                    Übungsleiter aus Personalliste wählen …
                  </span>
                </button>
              )}
            </div>
            <div className="field">
              <label className="caption">Übungstyp</label>
              <select
                className="input"
                value={uebungsTyp}
                onChange={(e) => setUebungsTyp(e.target.value)}
              >
                <option value="">— bitte wählen —</option>
                {UEBUNGS_TYPEN.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {typ === "manuell" ? (
          <div className="field">
            <label className="caption">Grund / Notiz (optional)</label>
            <input
              className="input"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="z. B. Tierrettung Solar-Gasse"
            />
          </div>
        ) : null}

        {err ? (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-s)",
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--red-border)",
              boxShadow: "var(--glow-red-soft)",
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            style={{
              width: "auto",
              padding: "0 16px",
              gap: 8,
              display: "flex",
              alignItems: "center",
              minHeight: 56,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="cta"
            onClick={() => void submit()}
            disabled={busy}
            style={{ flex: 1, padding: "16px 18px", fontSize: 15 }}
          >
            <Plus size={20} />
            {busy ? "Lege an …" : "Bericht anlegen"}
          </button>
        </div>
      </div>

      {/* ─── Person-Picker für Übungsleiter ─── */}
      <PersonPickerModal
        open={pickerOpen}
        title="Übungsleiter wählen"
        subtitle="Aktive Mitglieder aus der syBOS-Personalliste"
        personen={personen}
        bereitsGewaehlt={new Set<number>()}
        onSelect={(p) => {
          setUebungsleiterPerson(p);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

/** Leitet "VN" aus "Nachname Vorname" ab — Avatar-Initialen. */
function initials(p: PickPerson): string {
  const a = p.nachname.charAt(0).toUpperCase();
  const b = p.vorname.charAt(0).toUpperCase();
  return `${a}${b}` || "??";
}
