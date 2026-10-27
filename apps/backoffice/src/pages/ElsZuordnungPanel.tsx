import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiCall } from "../api/client";
import { getConfig, putConfig } from "../api/config";

/**
 * ELS-Schnittstelle: Welche Einheit der Leitstelle ist welches unserer
 * Fahrzeuge? Die automatische Zuordnung ueber Rufname/Kuerzel steht in der
 * Spalte "automatisch"; hier laesst sie sich pro Fahrzeug festlegen.
 */

const FAHRZEUGE: Array<{ id: string; label: string }> = [
  { id: "kdo", label: "KDO" },
  { id: "tlf-a-4000", label: "TANK (TLF-A 4000)" },
  { id: "lfa-b", label: "PUMPE (LFA-B)" },
  { id: "mtf", label: "MTF" },
];

interface DiagnoseUnit {
  unid: string;
  callname: string;
  unidLong: string;
  sName: string;
  unityp: string;
  unitStatus: string;
  status: string;
  statusText: string;
  since: string | null;
  hatPosition: boolean;
  fahrzeugId: string | null;
}

interface Diagnose {
  enabled: boolean;
  fetchedAt: string | null;
  zuordnung: Record<string, string>;
  units: DiagnoseUnit[];
}

function zeit(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ElsZuordnungPanel() {
  const [diag, setDiag] = useState<Diagnose | null>(null);
  const [werte, setWerte] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const laden = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const d = await apiCall<Diagnose>("/api/els/diagnose");
      setDiag(d);
      const cfg = await getConfig<{ fahrzeuge?: Record<string, string> }>("els-zuordnung");
      setWerte(cfg.data?.fahrzeuge ?? {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  async function speichern() {
    setBusy(true);
    setErr(null);
    try {
      const fahrzeuge: Record<string, string> = {};
      for (const [k, v] of Object.entries(werte)) if (v) fahrzeuge[k] = v;
      await putConfig("els-zuordnung", { fahrzeuge });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await laden();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!diag?.enabled) {
    return err ? (
      <p style={{ color: "var(--red)", fontSize: 14 }}>{err}</p>
    ) : null;
  }

  const bezeichnung = (u: DiagnoseUnit) => u.callname || u.sName || u.unid;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div className="card-title">ELS-Einheiten den Fahrzeugen zuordnen</div>
        <button
          type="button"
          className="themetoggle"
          onClick={() => void laden()}
          disabled={busy}
          style={{ width: "auto", padding: "0 14px", gap: 6 }}
        >
          <RefreshCw size={14} className={busy ? "spin" : undefined} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Neu laden</span>
        </button>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", margin: "0 0 12px" }}>
        Stand der Einheiten: {zeit(diag.fetchedAt)}. Ohne Auswahl wird automatisch über Rufname/Kürzel zugeordnet
        (Spalte „automatisch“). Funkstatus und Fahrzeugposition erscheinen nur für zugeordnete Fahrzeuge.
      </p>
      {err ? (
        <p role="alert" style={{ color: "var(--red)", fontSize: 14 }}>
          {err}
        </p>
      ) : null}
      {diag.units.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--fg-3)" }}>Noch keine Einheiten von ELS erhalten.</p>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--fg-3)" }}>
                  <th style={{ padding: "6px 8px" }}>Einheit (ELS)</th>
                  <th style={{ padding: "6px 8px" }}>Funkstatus</th>
                  <th style={{ padding: "6px 8px" }}>automatisch</th>
                </tr>
              </thead>
              <tbody>
                {diag.units.map((u) => (
                  <tr key={u.unid || u.callname} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px" }}>
                      <strong>{bezeichnung(u)}</strong>
                      <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                        {[u.unidLong, u.unityp, u.unid].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {u.status || "—"}
                      {u.statusText ? ` (${u.statusText})` : ""}
                      <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                        {u.hatPosition ? "mit Position" : "ohne Position"} · {zeit(u.since)}
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {u.fahrzeugId ? (FAHRZEUGE.find((f) => f.id === u.fahrzeugId)?.label ?? u.fahrzeugId) : "nicht zugeordnet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Feste Zuordnung (überschreibt die automatische)</h3>
          <div style={{ display: "grid", gap: 8, maxWidth: 520 }}>
            {FAHRZEUGE.map((f) => (
              <label key={f.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{f.label}</span>
                <select
                  value={werte[f.id] ?? ""}
                  onChange={(e) => setWerte({ ...werte, [f.id]: e.target.value })}
                  style={{ minHeight: 44, fontSize: 16 }}
                >
                  <option value="">automatisch</option>
                  {diag.units.map((u) => (
                    <option key={u.unid || u.callname} value={u.unid || u.callname}>
                      {bezeichnung(u)} ({u.unid})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <button type="button" className="btn" onClick={() => void speichern()} disabled={busy} style={{ minHeight: 44 }}>
              Zuordnung speichern
            </button>
            {saved ? <span style={{ color: "var(--ok)", fontWeight: 600 }}>Gespeichert</span> : null}
          </div>
        </>
      )}
    </section>
  );
}
