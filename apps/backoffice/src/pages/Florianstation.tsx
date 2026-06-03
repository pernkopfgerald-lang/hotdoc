/**
 * Florianstation — Querformat-Layout für PC, FR-17.
 * Dreispaltig: Karte/Aktive Einsätze (links) · Hauptbericht (Mitte) · Live-Fahrzeugberichte (rechts).
 * Kein Diktat, nur Tastatureingabe.
 *
 * Save-Pipeline: Controlled-State + 1.5s-Debounce-Auto-Save analog ZentralePage,
 * PUT /api/einsaetze/:id. Backend-Allowlist siehe einsaetze.ts (F-08-Fix).
 */

import { BETEILIGTE_STELLEN, EINSATZARTEN, FLORIAN_POSITION, SONSTIGE_FF } from "@hotdoc/shared";
import { Activity, CheckCircle2, Map as MapIcon, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiCall } from "../api/client";
import { listEinsaetze, type EinsatzListItem } from "../api/einsaetze";
import { FlorianMap, type FahrzeugPos } from "../components/FlorianMap";

/** Feuerwehrhaus FF Eberstalzell — Solarstraße 1, 4653 Eberstalzell.
 *  Quelle: @hotdoc/shared constants/florian.ts. */
const HOME = FLORIAN_POSITION;

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
  /** "Lage unter Kontrolle" + "Brand aus" sind Time-Strings (HH:mm). */
  lageUnterKontrolle: string;
  brandAus: string;
  meldungEinsatzleitung: string;
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
  };
}

/** Live-Fahrzeugbericht-Listen-Item shape (was die Aggregation und Anzeige braucht). */
interface FahrzeugberichtItem {
  _id: string;
  fahrzeugId?: string;
  funkrufname?: string;
  status?: string;
  mannschaft?: Array<{ personId?: number; atemschutzAktiv?: boolean }>;
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  oelbindemittelSaecke?: number;
}

export function Florianstation() {
  const [aktive, setAktive] = useState<EinsatzListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Editor-State + Save-Pipeline
  const [form, setForm] = useState<FormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  // Rechte Spalte: echte Fahrzeugberichte des ausgewaehlten Einsatzes
  const [fzgBerichte, setFzgBerichte] = useState<FahrzeugberichtItem[]>([]);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const list = await listEinsaetze("aktiv");
      setAktive(list);
      if (!selectedId && list[0]) setSelectedId(list[0]._id);
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

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
      return;
    }
    if (loadedIdRef.current === selectedId) return;
    void (async () => {
      try {
        const doc = await apiCall<Record<string, unknown>>(
          `/api/einsaetze/${encodeURIComponent(selectedId)}`,
        );
        setForm(buildFormFromDoc(doc));
        setDirty(false);
        setSaveErr(null);
        loadedIdRef.current = selectedId;
      } catch (e) {
        setSaveErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [selectedId]);

  // Fahrzeugberichte fuer rechte Spalte laden (Polling 15s analog Aktive-Liste)
  useEffect(() => {
    if (!selectedId) {
      setFzgBerichte([]);
      return;
    }
    let cancelled = false;
    async function loadFzgBerichte() {
      try {
        const r = await apiCall<{ items: FahrzeugberichtItem[] }>(
          `/api/einsaetze/${encodeURIComponent(selectedId!)}/fahrzeugberichte`,
        );
        if (!cancelled) setFzgBerichte(r.items ?? []);
      } catch {
        // silent — leere Liste ist gueltig
      }
    }
    void loadFzgBerichte();
    const t = setInterval(loadFzgBerichte, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId]);

  // Save-Funktion (manuell + via Auto-Save-Debounce)
  const save = useCallback(async () => {
    if (!selectedId || !form) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const body: Record<string, unknown> = {
        einsatzort: form.einsatzort,
        einsatzart: form.einsatzart || undefined,
        einsatzartFreitext: form.einsatzartFreitext || undefined,
        alarmiertDurch: form.alarmiertDurch || undefined,
        beteiligteStellen: form.beteiligteStellen,
        // Schema erwartet { aktive: string[] }, NICHT ein nacktes Array.
        // Vorher: Backoffice schickte string[] → 400 schema_invalid.
        sonstigeAnwesendeFF: { aktive: form.sonstigeAnwesendeFF },
        meldungEinsatzleitung: form.meldungEinsatzleitung || undefined,
        zeitmarken: {
          lageUnterKontrolle: fromTime(form.lageUnterKontrolle),
          brandAus: fromTime(form.brandAus),
        },
      };
      await apiCall(`/api/einsaetze/${encodeURIComponent(selectedId)}`, {
        method: "PUT",
        body,
      });
      setDirty(false);
      setSavedAt(new Date().toISOString());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [selectedId, form]);

  // Auto-Save mit 1.5s-Debounce (analog ZentralePage in der PWA)
  useEffect(() => {
    if (!dirty || !selectedId) return;
    const handle = setTimeout(() => {
      void save();
    }, 1500);
    return () => clearTimeout(handle);
  }, [form, dirty, selectedId, save]);

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

  const selected = aktive.find((e) => e._id === selectedId) ?? aktive[0];

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

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 1fr) minmax(380px, 1.5fr) minmax(280px, 1fr)",
        gap: 16,
      }}
    >
      {/* ─── Linke Spalte: Aktive Einsätze + Karten-Platzhalter ─── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">Aktive Einsätze ({aktive.length})</div>
            <span className="badge ok" style={{ gap: 5 }}>
              <Activity size={11} /> Live · {busy ? "syncing" : "ready"}
            </span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {aktive.length === 0 ? (
              <li
                style={{
                  padding: "20px 8px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--fg-3)",
                }}
              >
                Keine aktiven Einsätze. Lege im „Berichte"-Tab einen Bericht (Übung / Lotsendienst / sonst.) an oder warte auf einen BlaulichtSMS-Alarm.
              </li>
            ) : (
              aktive.map((e) => (
                <li key={e._id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e._id)}
                    className={`person${e._id === selectedId ? " filled" : ""}`}
                    style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}
                  >
                    <span className="name" style={{ fontSize: 14 }}>
                      {e.einsatzart ?? e.einsatzartFreitext ?? "—"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--fg-2)", textAlign: "left" }}>
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

      {/* ─── Mitte: Hauptbericht-Formular (Tastatur, kein Diktat) ─── */}
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
              disabled={!form || !selectedId || saving || !dirty}
              onClick={() => void save()}
              style={{
                width: "auto",
                padding: "10px 16px",
                fontSize: 14,
                background:
                  "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)",
                opacity: !dirty || saving ? 0.6 : 1,
                cursor: !dirty || saving ? "not-allowed" : "pointer",
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

        {saveErr ? (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 12,
              border: "1px solid var(--red-border)",
            }}
          >
            Speichern fehlgeschlagen: {saveErr}
          </div>
        ) : null}

        {!selected || !form ? (
          <p style={{ color: "var(--fg-3)", fontSize: 14 }}>
            {selected ? "Lade Bericht …" : "Kein aktiver Einsatz ausgewählt."}
          </p>
        ) : (
          <form style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
                {SONSTIGE_FF.map((s) => (
                  <Toggle
                    key={s}
                    label={s}
                    checked={form.sonstigeAnwesendeFF.includes(s)}
                    onChange={() => toggleListItem("sonstigeAnwesendeFF", s)}
                  />
                ))}
              </div>
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
          </form>
        )}
      </article>

      {/* ─── Rechts: Live-Fahrzeugberichte ─── */}
      <aside className="card">
        <div className="card-head">
          <div className="card-title">Live-Fahrzeugberichte</div>
          <span className="card-meta">
            {selectedId ? `${fzgBerichte.length} Berichte · Auto-Sync` : "kein Einsatz"}
          </span>
        </div>
        {!selectedId ? (
          <p style={{ padding: "20px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Wähle einen aktiven Einsatz links um die Fahrzeugberichte zu sehen.
          </p>
        ) : fzgBerichte.length === 0 ? (
          <p style={{ padding: "20px 8px", fontSize: 13, color: "var(--fg-3)", textAlign: "center" }}>
            Noch keine Fahrzeugberichte. Sobald ein Tablet im Fahrzeug startet, erscheinen die Daten hier.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {fzgBerichte.map((b) => {
              const slots = (b.mannschaft ?? []).filter(
                (m) => typeof m.personId === "number" && m.personId > 0,
              );
              const headcount =
                slots.length + (b.fahrerPersonId ? 1 : 0) + (b.fahrzeugKdtPersonId ? 1 : 0);
              const asAktiv = slots.filter((m) => m.atemschutzAktiv === true).length;
              const stat = (b.status as string | undefined) ?? "im_einsatz";
              const statBadgeCls =
                stat === "abgeschlossen" ? "badge ok" : stat === "im_einsatz" ? "badge warn" : "badge neutral";
              const rufName = b.funkrufname ?? b.fahrzeugId ?? "Fahrzeug";
              return (
                <li
                  key={b._id}
                  className="crew-row"
                  style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--fg-2)",
                      }}
                    >
                      {rufName}
                    </span>
                    <span className={statBadgeCls}>{stat === "abgeschlossen" ? "fertig" : stat === "im_einsatz" ? "läuft" : stat}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>
                    {headcount} Pers. · {asAktiv} AS aktiv · {b.oelbindemittelSaecke ?? 0} Öl-Säcke
                  </p>
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
    </section>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="field" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label className="caption">{label}</label>
      <div>{children}</div>
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

/** "HH:mm" → ISO-Timestamp (heutiges Datum). Leer → undefined (PUT laesst Feld weg). */
function fromTime(hhmm: string): string | undefined {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}
