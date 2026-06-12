import { AlertCircle, Lock, Plus, Unlock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listEinsaetze, manuellAnlegen, type EinsatzListItem, type EinsatzTyp } from "../api/einsaetze";
import { TypBadge } from "../pages/Verwaltung";
import { BerichtDetail } from "./BerichtDetail";
import { ManuellerBerichtModal } from "./ManuellerBerichtModal";

export function BerichteBrowser() {
  const [items, setItems] = useState<EinsatzListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"alle" | "aktiv" | "abgeschlossen">("alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [manuellOpen, setManuellOpen] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const list = await listEinsaetze(statusFilter === "alle" ? undefined : statusFilter);
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onManuellAnlegen(input: { einsatzort: string; einsatzart?: string; grund?: string }) {
    await manuellAnlegen(input);
    setManuellOpen(false);
    await reload();
  }

  return (
    <section>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div className="chips">
          <FilterChip label="Alle" active={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} />
          <FilterChip label="Aktiv" active={statusFilter === "aktiv"} onClick={() => setStatusFilter("aktiv")} />
          <FilterChip
            label="Abgeschlossen"
            active={statusFilter === "abgeschlossen"}
            onClick={() => setStatusFilter("abgeschlossen")}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => setManuellOpen(true)}
            className="cta"
            style={{ width: "auto", padding: "10px 16px", fontSize: 14 }}
          >
            <Plus size={16} />
            Neuer Bericht (manuell)
          </button>
        </div>
      </header>

      {err && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--red-tint)",
            color: "var(--red)",
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--red-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={16} />
          {err}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) 2fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <ul className="card" style={{ padding: 8, listStyle: "none", margin: 0 }}>
          {items.length === 0 ? (
            <li
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--fg-3)",
                fontSize: 13,
              }}
            >
              {busy ? "lädt …" : "Keine Berichte gefunden."}
            </li>
          ) : (
            items.map((it) => (
              <li key={it._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(it._id)}
                  className={`person${selectedId === it._id ? " filled" : ""}`}
                  style={{
                    marginBottom: 4,
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 4,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    {/* AUDIT-15: Titel-Fallback wie im ArchivPanel — Uebungen/
                        Lotsendienste ohne Einsatzart zeigten vorher nur "—". */}
                    <span className="name" style={{ fontSize: 14 }}>
                      {it.einsatzart ??
                        it.einsatzartFreitext ??
                        it.uebungThema ??
                        it.lotsendienstAuftraggeber ??
                        "—"}
                    </span>
                    <StatusBadge item={it} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--fg-2)", textAlign: "left" }}>{it.einsatzort}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        textAlign: "left",
                      }}
                    >
                      {formatDateTime(it.alarmierungZeit)}
                    </span>
                    {/* AUDIT-15: TypBadge aus Verwaltung.tsx statt des
                        MAN/ALR-Kuerzels — eine Wahrheit fuer beide Ansichten. */}
                    <TypBadge typ={(it.einsatzTyp ?? "alarm") as EinsatzTyp} />
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div>
          {selectedId ? (
            <BerichtDetail
              id={selectedId}
              onChange={reload}
              // AUDIT-15 (SF-09): Auswahl leeren VOR dem Reload — sonst
              // bleibt eine Geist-Detailansicht des geloeschten Berichts
              // mit aktiven Buttons stehen.
              onDeleted={() => {
                setSelectedId(null);
                void reload();
              }}
            />
          ) : (
            <div
              style={{
                padding: 32,
                textAlign: "center",
                fontSize: 14,
                color: "var(--fg-3)",
                border: "1px dashed var(--border-strong)",
                borderRadius: 18,
                background: "var(--surface)",
              }}
            >
              Wähle einen Bericht aus der Liste links.
            </div>
          )}
        </div>
      </div>

      <ManuellerBerichtModal open={manuellOpen} onClose={() => setManuellOpen(false)} onSubmit={onManuellAnlegen} />
    </section>
  );
}

function StatusBadge({ item }: { item: EinsatzListItem }) {
  if (item.status === "aktiv") {
    return (
      <span className="badge ok" style={{ gap: 4 }}>
        <Unlock size={9} /> aktiv
      </span>
    );
  }
  return (
    <span className="badge neutral" style={{ gap: 4 }}>
      <Lock size={9} /> geschützt
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip"
      style={
        active
          ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
          : undefined
      }
    >
      {label}
    </button>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
