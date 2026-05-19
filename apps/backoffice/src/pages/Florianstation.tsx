/**
 * Florianstation — Querformat-Layout für PC, FR-17.
 * 3 Spalten: Karte (links) · Hauptbericht (Mitte) · Live-Fahrzeugberichte (rechts)
 * Kein Diktat, nur Tastatureingabe.
 */

import { BETEILIGTE_STELLEN, EINSATZARTEN, SONSTIGE_FF } from "@hotdoc/shared";
import { Activity, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listEinsaetze, type EinsatzListItem } from "../api/einsaetze";

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
      // silent — Status-LED wird rot zeigen
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
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.1fr_1.4fr_1fr]">
      {/* ─── Aktive Einsätze + Karten-Platzhalter ─── */}
      <div className="flex flex-col gap-3">
        <header className="flex items-center justify-between rounded-m border border-border bg-surface-1 px-4 py-3">
          <h3 className="m-0 text-base font-semibold">Aktive Einsätze ({aktive.length})</h3>
          <span className="inline-flex items-center gap-1.5 rounded border border-emerald/30 bg-emerald/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald">
            <Activity size={11} /> Live · {busy ? "syncing" : "ready"}
          </span>
        </header>

        <ul className="m-0 flex list-none flex-col gap-1 rounded-m border border-border bg-surface-1 p-1">
          {aktive.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-text-3">
              Aktuell keine aktiven Einsätze. Triggere im „Berichte"-Tab einen Mock-Alarm.
            </li>
          ) : (
            aktive.map((e) => (
              <li key={e._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(e._id)}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition hover:bg-surface-2 ${
                    e._id === selectedId ? "bg-surface-3" : ""
                  }`}
                >
                  <span className="text-sm font-semibold">{e.einsatzart ?? e.einsatzartFreitext ?? "—"}</span>
                  <span className="text-xs text-text-2">{e.einsatzort}</span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="flex h-[420px] flex-col rounded-m border border-dashed border-border p-3 text-xs text-text-3">
          <header className="mb-2 flex items-center justify-between">
            <span className="font-mono uppercase tracking-[0.18em]">Karte · Live-Positionen</span>
            <span className="font-mono uppercase tracking-[0.14em] text-text-3">
              folgt in Phase 8 (Leaflet portiert)
            </span>
          </header>
          <div className="grid flex-1 place-items-center text-text-3">
            Leaflet-Karte mit eigenen Fahrzeugen + Einsatzort + Hydranten
          </div>
        </div>
      </div>

      {/* ─── Hauptbericht-Formular (Tastatur, kein Diktat) ─── */}
      <article className="rounded-m border border-border bg-surface-1 p-4">
        <header className="mb-4 flex items-baseline justify-between">
          <div>
            <h3 className="m-0 text-lg font-semibold">Hauptbericht</h3>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
              Florian Eberstalzell · Querformat-Modus · FR-17
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-m bg-emerald px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
            disabled
            title="Speichern wird in nächster Iteration aktiviert"
          >
            <Save size={14} /> Speichern
          </button>
        </header>

        {!selected ? (
          <p className="text-sm text-text-3">Kein aktiver Einsatz ausgewählt.</p>
        ) : (
          <form className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Einsatzort" full>
              <input
                defaultValue={selected.einsatzort}
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2 focus:border-border-strong focus:outline-none"
              />
            </Field>

            <Field label="Einsatzart">
              <select
                defaultValue={selected.einsatzart ?? ""}
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2 focus:border-border-strong focus:outline-none"
              >
                <option value="">—</option>
                {EINSATZARTEN.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Andere Einsätze (Freitext)">
              <input
                defaultValue={selected.einsatzartFreitext ?? ""}
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2 focus:border-border-strong focus:outline-none"
              />
            </Field>

            <Field label="Alarmierung">
              <input
                type="datetime-local"
                defaultValue={toLocalDt(selected.alarmierungZeit)}
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2 focus:border-border-strong focus:outline-none"
              />
            </Field>

            <Field label="Alarmierungsquelle">
              <div className="flex gap-3 pt-1.5 text-sm">
                <Radio name="alarmiertDurch" value="BWST" label="BWST" />
                <Radio name="alarmiertDurch" value="LWZ" label="LWZ" />
              </div>
            </Field>

            <Field label="Beteiligte Stellen" full>
              <div className="flex flex-wrap gap-2 pt-1">
                {BETEILIGTE_STELLEN.map((s) => (
                  <Checkbox key={s} label={s} />
                ))}
              </div>
            </Field>

            <Field label="Sonstige Feuerwehren" full>
              <div className="flex flex-wrap gap-2 pt-1">
                {SONSTIGE_FF.map((s) => (
                  <Checkbox key={s} label={s} />
                ))}
              </div>
            </Field>

            <Field label="Lage unter Kontrolle">
              <input
                type="time"
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2"
              />
            </Field>
            <Field label="Brand AUS">
              <input
                type="time"
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2"
              />
            </Field>

            <Field label="Meldung von der Einsatzleitung" full>
              <textarea
                rows={6}
                placeholder="Freitext, Tastatur-Eingabe (kein Diktat in der Florianstation)"
                className="w-full rounded-s border border-border bg-surface-2 px-3 py-2 focus:border-border-strong focus:outline-none"
              />
            </Field>
          </form>
        )}
      </article>

      {/* ─── Live-Fahrzeugberichte (read-only) ─── */}
      <aside className="rounded-m border border-border bg-surface-1 p-4">
        <header className="mb-3 flex items-baseline justify-between">
          <h3 className="m-0 text-base font-semibold">Live-Fahrzeugberichte</h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
            via CouchDB-Sync
          </span>
        </header>
        <ul className="m-0 list-none space-y-2">
          {["Tank Eberstalzell", "Pumpe Eberstalzell", "Kommando Eberstalzell", "MTF Eberstalzell"].map(
            (rn) => (
              <li key={rn} className="rounded-s border border-border bg-surface-2 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono uppercase tracking-[0.14em] text-text-2">{rn}</span>
                  <span className="rounded border border-text-3/30 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-text-3">
                    standby
                  </span>
                </div>
                <p className="mt-1 text-text-3">
                  Mannschaft, KM, Geräte, Chronik — werden hier live angezeigt sobald
                  ein Fahrzeug-Tablet einen Fahrzeugbericht startet.
                </p>
              </li>
            ),
          )}
        </ul>

        <footer className="mt-4 rounded-s border border-border bg-surface-2 p-3 font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
          Mannschafts-Aggregation aus allen Fzg.-Berichten erscheint in Echtzeit hier:
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded border border-border bg-surface-3 p-1.5">
              <div className="font-mono text-[9px] tracking-wider text-text-3">EINGESETZT</div>
              <div className="font-mono text-base font-bold text-text-1">0</div>
            </div>
            <div className="rounded border border-border bg-surface-3 p-1.5">
              <div className="font-mono text-[9px] tracking-wider text-text-3">AS</div>
              <div className="font-mono text-base font-bold text-amber">0</div>
            </div>
            <div className="rounded border border-border bg-surface-3 p-1.5">
              <div className="font-mono text-[9px] tracking-wider text-text-3">ÖL (€)</div>
              <div className="font-mono text-base font-bold text-amber">0</div>
            </div>
          </div>
        </footer>
      </aside>
    </section>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Radio({ name, value, label }: { name: string; value: string; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-text-1">
      <input type="radio" name={name} value={value} className="accent-red" />
      {label}
    </label>
  );
}

function Checkbox({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-border bg-surface-2 px-2 py-1 text-xs text-text-2">
      <input type="checkbox" className="accent-red" />
      {label}
    </label>
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
