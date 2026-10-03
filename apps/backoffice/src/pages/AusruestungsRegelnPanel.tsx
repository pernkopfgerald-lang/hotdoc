import { CheckCircle2, ListChecks, Plus, Trash2, AlertTriangle, History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  validiereAusruestung,
  type AusruestungsPruefart,
  type AusruestungsRegel,
} from "@hotdoc/shared";
import { apiCall } from "../api/client";
import {
  getConfig,
  putConfig,
  type EinsatzstichworteData,
  type GeraeteData,
} from "../api/config";

/**
 * Ausruestungs-Check — Regeln pflegen, testen, Protokoll ansehen.
 *
 * Eine Regel sagt: "Bei Stichwort X muss/sollte Fahrzeug Y mindestens eines der
 * Geraete A, B, C erfasst haben." MUSS sperrt den Abschluss am Tablet, INFO
 * zeigt nur einen Vorschlag. Ohne passende Regel gibt es keinen Check.
 */

const FAHRZEUGE: Array<{ id: string; label: string }> = [
  { id: "kdo", label: "KDO" },
  { id: "tlf-a-4000", label: "TANK" },
  { id: "lfa-b", label: "LFA-B" },
  { id: "mtf", label: "MTF" },
];
const FZG_LABEL: Record<string, string> = Object.fromEntries(FAHRZEUGE.map((f) => [f.id, f.label]));

interface RegelnData {
  regeln: AusruestungsRegel[];
}

interface AuditItem {
  _id: string;
  timestamp: string;
  actorUsername?: string;
  fahrzeugId?: string;
  einsatzId?: string;
  details?: {
    stichwort?: string;
    valid?: boolean;
    abgeschlossen?: boolean;
    warnungen?: Array<{ severity: "MUSS" | "INFO"; message: string }>;
  };
}

function neueId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function formatZeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AusruestungsRegelnPanel({
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [regeln, setRegelnRaw] = useState<AusruestungsRegel[] | null>(null);
  const [geraete, setGeraete] = useState<GeraeteData["byFahrzeug"]>({});
  const [stichworte, setStichworte] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setRegeln(next: AusruestungsRegel[]) {
    setRegelnRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [r, g, s] = await Promise.all([
          getConfig<RegelnData>("ausruestungs-regeln"),
          getConfig<GeraeteData>("geraete"),
          getConfig<EinsatzstichworteData>("einsatzstichworte"),
        ]);
        setRegelnRaw(Array.isArray(r.data?.regeln) ? r.data.regeln : []);
        setGeraete(g.data?.byFahrzeug ?? {});
        setStichworte((s.data?.items ?? []).map((i) => i.art));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const namen = useMemo(() => {
    const m: Record<string, string> = {};
    for (const items of Object.values(geraete)) {
      for (const it of items) m[it.id] = it.bezeichnung;
    }
    return m;
  }, [geraete]);

  function problem(): string | null {
    for (const [i, r] of (regeln ?? []).entries()) {
      if (!r.stichwort.trim()) return `Regel ${i + 1}: Stichwort fehlt`;
      if (!r.fahrzeug) return `Regel ${i + 1}: Fahrzeug fehlt`;
      if (r.geraete.length === 0) return `Regel ${i + 1} („${r.stichwort}“): mindestens ein Gerät wählen`;
    }
    return null;
  }

  async function save() {
    if (!regeln) return;
    const p = problem();
    if (p) {
      setErr(p);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await putConfig<RegelnData>("ausruestungs-regeln", { regeln });
      setDirty(false);
      onDirtyChange?.(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function update(id: string, patch: Partial<AusruestungsRegel>) {
    if (!regeln) return;
    setRegeln(regeln.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleGeraet(r: AusruestungsRegel, geraetId: string) {
    const has = r.geraete.includes(geraetId);
    update(r.id, {
      geraete: has ? r.geraete.filter((g) => g !== geraetId) : [...r.geraete, geraetId],
    });
  }

  function add() {
    setRegeln([
      ...(regeln ?? []),
      { id: neueId(), stichwort: "", fahrzeug: "lfa-b", geraete: [], pruefart: "INFO" },
    ]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <ListChecks size={20} />
            Ausrüstungs-Check beim Abschluss
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {saved ? (
              <span className="badge ok">gespeichert</span>
            ) : dirty ? (
              <span className="badge neutral">ungespeicherte Änderungen</span>
            ) : null}
            <button
              type="button"
              className="cta"
              onClick={save}
              disabled={busy || !regeln}
              style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
            >
              {busy ? "Speichert …" : "Speichern"}
            </button>
          </div>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--fg-2)", lineHeight: 1.5 }}>
          Zu einem Einsatzstichwort legst du fest, welche Geräte ein Fahrzeug erfasst haben sollte. Es genügt
          <strong> eines</strong> der gewählten Geräte. <strong>MUSS</strong> sperrt den Abschluss am Tablet,
          <strong> INFO</strong> zeigt nur einen Vorschlag. Ohne passende Regel gibt es keinen Check.
          Im Stichwort steht <code>*</code> für beliebig viele Zeichen (z. B. <code>VU*</code>) und <code>?</code> für
          genau eines. Die Regel gilt nur, wenn das Fahrzeug am Einsatz beteiligt ist.
        </p>

        {err ? (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--red-border)",
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13.5,
            }}
          >
            {err}
          </div>
        ) : null}

        <datalist id="ausruestung-stichworte">
          {stichworte.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {regeln === null ? (
          <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
        ) : regeln.length === 0 ? (
          <p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>
            Noch keine Regeln — am Tablet findet daher kein Ausrüstungs-Check statt.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {regeln.map((r) => {
              const verfuegbar = geraete[r.fahrzeug] ?? [];
              const unbekannt = r.geraete.filter((g) => !verfuegbar.some((v) => v.id === g));
              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid var(--border-strong)",
                    borderRadius: 6,
                    padding: 12,
                    opacity: r.aktiv === false ? 0.6 : 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="input"
                      style={{ flex: "2 1 220px", fontSize: 15 }}
                      value={r.stichwort}
                      list="ausruestung-stichworte"
                      placeholder="Stichwort, z. B. VU*"
                      onChange={(e) => update(r.id, { stichwort: e.target.value })}
                      aria-label="Stichwort (Wildcard)"
                    />
                    <select
                      className="input"
                      style={{ flex: "0 1 120px", fontSize: 15 }}
                      value={r.fahrzeug}
                      onChange={(e) => update(r.id, { fahrzeug: e.target.value, geraete: [] })}
                      aria-label="Fahrzeug"
                    >
                      {FAHRZEUGE.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input"
                      style={{ flex: "0 1 110px", fontSize: 15 }}
                      value={r.pruefart}
                      onChange={(e) => update(r.id, { pruefart: e.target.value as AusruestungsPruefart })}
                      aria-label="Prüfart"
                    >
                      <option value="INFO">INFO</option>
                      <option value="MUSS">MUSS</option>
                    </select>
                    <input
                      className="input"
                      type="date"
                      style={{ flex: "0 1 150px", fontSize: 15 }}
                      value={r.gueltigAb ?? ""}
                      onChange={(e) => {
                        const { gueltigAb: _alt, ...rest } = r;
                        void _alt;
                        const next: AusruestungsRegel = e.target.value
                          ? { ...rest, gueltigAb: e.target.value }
                          : rest;
                        setRegeln((regeln ?? []).map((x) => (x.id === r.id ? next : x)));
                      }}
                      aria-label="Gültig ab"
                      title="Gültig ab (leer = sofort)"
                    />
                    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13.5 }}>
                      <input
                        type="checkbox"
                        checked={r.aktiv !== false}
                        onChange={(e) => update(r.id, { aktiv: e.target.checked })}
                      />
                      aktiv
                    </label>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => setRegeln((regeln ?? []).filter((x) => x.id !== r.id))}
                      aria-label="Regel löschen"
                      title="Regel löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 4 }}>
                      Geräte {FZG_LABEL[r.fahrzeug] ?? r.fahrzeug} — mindestens eines muss erfasst sein
                    </div>
                    <div className="chips">
                      {verfuegbar.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={`chip${r.geraete.includes(g.id) ? " selected" : ""}`}
                          onClick={() => toggleGeraet(r, g.id)}
                          style={{ minHeight: 34, padding: "4px 10px", fontSize: 13.5 }}
                        >
                          {g.bezeichnung}
                        </button>
                      ))}
                      {unbekannt.map((g) => (
                        <button
                          key={g}
                          type="button"
                          className="chip selected"
                          onClick={() => toggleGeraet(r, g)}
                          title="Gerät nicht mehr in der Geräteliste — anklicken zum Entfernen"
                          style={{ minHeight: 34, padding: "4px 10px", fontSize: 13.5 }}
                        >
                          {g} ✕
                        </button>
                      ))}
                      {verfuegbar.length === 0 && unbekannt.length === 0 ? (
                        <span style={{ fontSize: 13, color: "var(--fg-3)" }}>
                          Für dieses Fahrzeug sind noch keine Geräte angelegt (Tab „Geräte“).
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <input
                    className="input"
                    style={{ fontSize: 14 }}
                    value={r.notiz ?? ""}
                    placeholder="Notiz (optional)"
                    onChange={(e) => {
                      const { notiz: _alt, ...rest } = r;
                      void _alt;
                      const next: AusruestungsRegel = e.target.value ? { ...rest, notiz: e.target.value } : rest;
                      setRegeln((regeln ?? []).map((x) => (x.id === r.id ? next : x)));
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button type="button" className="icon-btn" onClick={add} style={{ width: "auto", padding: "0 14px", gap: 6, display: "inline-flex", alignItems: "center", fontWeight: 600 }}>
            <Plus size={14} /> Neue Regel
          </button>
        </div>
      </section>

      {regeln ? <TestModus regeln={regeln} geraete={geraete} namen={namen} /> : null}
      <ProtokollAnsicht />
    </div>
  );
}

/** Testmodus: Stichwort + erfasste Geräte eingeben → Ergebnis mit den AKTUELLEN (auch ungespeicherten) Regeln. */
function TestModus({
  regeln,
  geraete,
  namen,
}: {
  regeln: AusruestungsRegel[];
  geraete: GeraeteData["byFahrzeug"];
  namen: Record<string, string>;
}) {
  const [stichwort, setStichwort] = useState("");
  const [beteiligt, setBeteiligt] = useState<Record<string, string[]>>({});

  function toggleFzg(id: string) {
    setBeteiligt((b) => {
      const { [id]: weg, ...rest } = b;
      return weg ? rest : { ...b, [id]: [] };
    });
  }
  function toggleGeraet(fzg: string, g: string) {
    setBeteiligt((b) => {
      const cur = b[fzg] ?? [];
      return { ...b, [fzg]: cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g] };
    });
  }

  const ergebnis = stichwort.trim()
    ? validiereAusruestung({
        stichwort,
        ausruestungProFahrzeug: beteiligt,
        regeln,
        geraeteNamen: namen,
      })
    : null;

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <CheckCircle2 size={20} />
          Regeln testen
        </div>
        <span className="card-meta">verwendet die aktuell angezeigten Regeln</span>
      </div>
      <input
        className="input"
        value={stichwort}
        onChange={(e) => setStichwort(e.target.value)}
        placeholder="Einsatzstichwort eingeben, z. B. VU Eingekl. Per."
        aria-label="Test-Stichwort"
      />
      <div style={{ margin: "12px 0 6px", fontSize: 13, color: "var(--fg-3)" }}>
        Beteiligte Fahrzeuge und erfasste Geräte:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FAHRZEUGE.map((f) => {
          const on = f.id in beteiligt;
          return (
            <div key={f.id}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 14 }}>
                <input type="checkbox" checked={on} onChange={() => toggleFzg(f.id)} />
                {f.label}
              </label>
              {on ? (
                <div className="chips" style={{ marginTop: 6 }}>
                  {(geraete[f.id] ?? []).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`chip${beteiligt[f.id]?.includes(g.id) ? " selected" : ""}`}
                      onClick={() => toggleGeraet(f.id, g.id)}
                      style={{ minHeight: 32, padding: "3px 10px", fontSize: 13 }}
                    >
                      {g.bezeichnung}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {ergebnis ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14 }}>
            <strong>{ergebnis.matchingRules.length}</strong> passende Regel(n):{" "}
            {ergebnis.matchingRules.length === 0
              ? "keine → am Tablet findet kein Check statt"
              : ergebnis.matchingRules
                  .map((r) => `${r.stichwort} · ${FZG_LABEL[r.fahrzeug] ?? r.fahrzeug} · ${r.pruefart}`)
                  .join("  |  ")}
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 14,
              border: `1px solid ${ergebnis.valid ? "var(--ok-border)" : "var(--red-border)"}`,
              background: ergebnis.valid ? "var(--ok-tint)" : "var(--red-tint)",
              color: ergebnis.valid ? "var(--ok)" : "var(--red)",
            }}
          >
            {ergebnis.valid
              ? ergebnis.warnings.length === 0
                ? "✓ Abschluss frei — Ausrüstungs-Check ok"
                : "✓ Abschluss möglich — mit Vorschlägen"
              : "✕ Abschluss gesperrt — MUSS-Geräte fehlen"}
          </div>
          {ergebnis.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 13.5, color: w.severity === "MUSS" ? "var(--red)" : "var(--warn)" }}>
              <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              [{FZG_LABEL[w.fahrzeug] ?? w.fahrzeug}] {w.severity}: {w.message}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Letzte 50 Validierungen (Audit-Events), nur lesend. */
function ProtokollAnsicht() {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await apiCall<{ ok: boolean; items: AuditItem[] }>(
        "/api/admin/audit?type=ausruestung-validierung&limit=50",
      );
      setItems(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <History size={20} />
          Protokoll der Prüfungen
        </div>
        <button type="button" className="icon-btn" onClick={() => void load()} style={{ width: "auto", padding: "0 12px", fontSize: 13 }}>
          Aktualisieren
        </button>
      </div>
      {err ? <div style={{ color: "var(--red)", fontSize: 13.5 }}>{err}</div> : null}
      {items === null && !err ? <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p> : null}
      {items && items.length === 0 ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13.5 }}>Noch keine Prüfungen protokolliert.</p>
      ) : null}
      {items && items.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-3)" }}>
                <th style={{ padding: "4px 8px" }}>Zeit</th>
                <th style={{ padding: "4px 8px" }}>Stichwort</th>
                <th style={{ padding: "4px 8px" }}>Fahrzeug</th>
                <th style={{ padding: "4px 8px" }}>Ergebnis</th>
                <th style={{ padding: "4px 8px" }}>Hinweise</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const d = it.details ?? {};
                const w = d.warnungen ?? [];
                return (
                  <tr key={it._id} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatZeit(it.timestamp)}</td>
                    <td style={{ padding: "6px 8px" }}>{d.stichwort ?? "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{FZG_LABEL[it.fahrzeugId ?? ""] ?? it.fahrzeugId ?? "—"}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {w.length === 0 ? (
                        <span className="badge ok">OK</span>
                      ) : d.valid === false ? (
                        <span className="badge red">MUSS fehlt</span>
                      ) : (
                        <span className="badge warn">Vorschlag</span>
                      )}
                      {d.abgeschlossen ? <span className="badge neutral" style={{ marginLeft: 6 }}>abgeschlossen</span> : null}
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--fg-2)" }}>
                      {w.map((x, i) => (
                        <div key={i}>{x.message}</div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
