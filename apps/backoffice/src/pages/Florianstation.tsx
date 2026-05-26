/**
 * Florianstation — Querformat-Layout für PC, FR-17.
 * Dreispaltig: Karte/Aktive Einsätze (links) · Hauptbericht (Mitte) · Live-Fahrzeugberichte (rechts).
 * Kein Diktat, nur Tastatureingabe.
 */

import { BETEILIGTE_STELLEN, EINSATZARTEN, SONSTIGE_FF } from "@hotdoc/shared";
import { Activity, Map as MapIcon, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listEinsaetze, type EinsatzListItem } from "../api/einsaetze";
import { FlorianMap, type FahrzeugPos } from "../components/FlorianMap";

const HOME = { lat: 48.0884, lng: 13.9586 };

/**
 * Mock-Fahrzeugpositionen — kommen in Phase 4 vom SSE-Endpoint
 * `/api/positions/stream`. Bis dahin platzieren wir die Fahrzeuge
 * leicht um das Gerätehaus + Einsatzort.
 */
function mockFleet(einsatzLat?: number, einsatzLng?: number): FahrzeugPos[] {
  const E = einsatzLat && einsatzLng ? { lat: einsatzLat, lng: einsatzLng } : HOME;
  return [
    { fahrzeugId: "kdo",        funkrufname: "Kommando Eberstalzell", abk: "KDO",   status: "im_einsatz",     lat: E.lat - 0.0009, lng: E.lng + 0.0007 },
    { fahrzeugId: "tlf",        funkrufname: "Tank Eberstalzell",     abk: "TANK",  status: "im_einsatz",     lat: E.lat + 0.0006, lng: E.lng - 0.0006 },
    { fahrzeugId: "lfa-b",      funkrufname: "Pumpe Eberstalzell",    abk: "LFA-B", status: "abgeschlossen",  lat: HOME.lat + 0.0003, lng: HOME.lng + 0.0001 },
    { fahrzeugId: "mtf",        funkrufname: "MTF Eberstalzell",      abk: "MTF",   status: "wartend",        lat: HOME.lat,          lng: HOME.lng - 0.0003 },
  ];
}

export function Florianstation() {
  const [aktive, setAktive] = useState<EinsatzListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const selected = aktive.find((e) => e._id === selectedId) ?? aktive[0];

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
                Keine aktiven Einsätze. Triggere im „Berichte"-Tab einen Mock-Alarm.
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
            fahrzeuge={mockFleet(selected?.koordinaten?.lat, selected?.koordinaten?.lng)}
            zoom={selected ? 16 : 14}
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
            Live-Position-Sharing via SSE folgt mit Phase 4 — aktuell Demo-Positionen.
          </p>
        </section>
      </div>

      {/* ─── Mitte: Hauptbericht-Formular (Tastatur, kein Diktat) ─── */}
      <article className="card">
        <div className="card-head">
          <div className="card-title">Hauptbericht</div>
          <button
            type="button"
            className="cta"
            disabled
            style={{
              width: "auto",
              padding: "10px 16px",
              fontSize: 14,
              background: "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)",
              opacity: 0.5,
              cursor: "not-allowed",
            }}
            title="Speichern in nächster Iteration aktiviert"
          >
            <Save size={14} /> Speichern
          </button>
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

        {!selected ? (
          <p style={{ color: "var(--fg-3)", fontSize: 14 }}>Kein aktiver Einsatz ausgewählt.</p>
        ) : (
          <form style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Einsatzort" full>
              <input className="input" defaultValue={selected.einsatzort} />
            </Field>

            <Field label="Einsatzart">
              <select className="input" defaultValue={selected.einsatzart ?? ""}>
                <option value="">—</option>
                {EINSATZARTEN.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Andere (Freitext)">
              <input className="input" defaultValue={selected.einsatzartFreitext ?? ""} />
            </Field>

            <Field label="Alarmierung">
              <input className="input num" type="datetime-local" defaultValue={toLocalDt(selected.alarmierungZeit)} />
            </Field>

            <Field label="Alarmiert von">
              <div style={{ display: "flex", gap: 16, paddingTop: 8 }}>
                <Radio name="alarmiertDurch" value="BWST" label="BWST" />
                <Radio name="alarmiertDurch" value="LWZ" label="LWZ" />
              </div>
            </Field>

            <Field label="Beteiligte Stellen" full>
              <div className="chips" style={{ paddingTop: 4 }}>
                {BETEILIGTE_STELLEN.map((s) => (
                  <Toggle key={s} label={s} />
                ))}
              </div>
            </Field>

            <Field label="Sonstige Feuerwehren" full>
              <div className="chips" style={{ paddingTop: 4 }}>
                {SONSTIGE_FF.map((s) => (
                  <Toggle key={s} label={s} />
                ))}
              </div>
            </Field>

            <Field label="Lage unter Kontrolle">
              <input className="input num" type="time" />
            </Field>
            <Field label="Brand aus">
              <input className="input num" type="time" />
            </Field>

            <Field label="Meldung von der Einsatzleitung" full>
              <textarea
                rows={6}
                placeholder="Freitext (kein Diktat in der Florianstation)"
                className="input"
                style={{ resize: "vertical" }}
              />
            </Field>
          </form>
        )}
      </article>

      {/* ─── Rechts: Live-Fahrzeugberichte ─── */}
      <aside className="card">
        <div className="card-head">
          <div className="card-title">Live-Fahrzeugberichte</div>
          <span className="card-meta">via CouchDB-Sync</span>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {["Tank Eberstalzell", "Pumpe Eberstalzell", "Kommando Eberstalzell", "MTF Eberstalzell"].map((rn) => (
            <li key={rn} className="crew-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
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
                  {rn}
                </span>
                <span className="badge neutral">standby</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--fg-3)" }}>
                Mannschaft, Geräte, Chronik erscheinen live sobald ein Tablet startet.
              </p>
            </li>
          ))}
        </ul>

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
            <Stat label="Eingesetzt" value="0" />
            <Stat label="AS aktiv" value="0" tone="as" />
            <Stat label="Öl Säcke" value="0" tone="warn" />
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

function Radio({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label
      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg)" }}
    >
      <input type="radio" name={name} value={value} style={{ accentColor: "var(--red)" }} />
      {label}
    </label>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <label className="chip">
      <input type="checkbox" style={{ accentColor: "var(--info)", margin: 0 }} />
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
