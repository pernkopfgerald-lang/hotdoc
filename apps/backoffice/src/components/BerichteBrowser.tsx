import { Lock, Unlock, AlertCircle, Plus, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listEinsaetze, manuellAnlegen, triggerMockAlarm, type EinsatzListItem } from "../api/einsaetze";
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

  async function onMockAlarm() {
    setBusy(true);
    try {
      await triggerMockAlarm();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onManuellAnlegen(input: {
    einsatzort: string;
    einsatzart?: string;
    grund?: string;
  }) {
    await manuellAnlegen(input);
    setManuellOpen(false);
    await reload();
  }

  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FilterChip
            label="Alle"
            active={statusFilter === "alle"}
            onClick={() => setStatusFilter("alle")}
          />
          <FilterChip
            label="Aktiv"
            active={statusFilter === "aktiv"}
            onClick={() => setStatusFilter("aktiv")}
          />
          <FilterChip
            label="Abgeschlossen"
            active={statusFilter === "abgeschlossen"}
            onClick={() => setStatusFilter("abgeschlossen")}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMockAlarm}
            disabled={busy}
            className="flex items-center gap-2 rounded-s border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3 disabled:opacity-50"
            title="Dev-Endpoint: simuliert einen BlaulichtSMS-Alarm"
          >
            <Zap size={14} /> Mock-Alarm
          </button>
          <button
            type="button"
            onClick={() => setManuellOpen(true)}
            className="flex items-center gap-2 rounded-s bg-red px-3 py-1.5 text-sm font-semibold text-white shadow hover:brightness-110"
          >
            <Plus size={14} /> Neuer Bericht (manuell)
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-s border border-red/40 bg-red/10 p-3 text-sm text-red">
          <AlertCircle size={16} />
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <ul className="m-0 list-none rounded-m border border-border bg-surface-1 p-1">
          {items.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-text-3">
              {busy ? "lädt …" : "Keine Berichte gefunden."}
            </li>
          ) : (
            items.map((it) => (
              <li key={it._id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(it._id)}
                  className={`flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition hover:bg-surface-2 ${
                    selectedId === it._id ? "bg-surface-3" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text-1">
                      {it.einsatzart ?? it.einsatzartFreitext ?? "—"}
                    </span>
                    <StatusBadge item={it} />
                  </div>
                  <span className="text-xs text-text-2">{it.einsatzort}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
                    {formatDateTime(it.alarmierungZeit)} · {it.einsatzTyp === "manuell" ? "MAN" : "ALR"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div>
          {selectedId ? (
            <BerichtDetail id={selectedId} onChange={reload} />
          ) : (
            <div className="rounded-m border border-dashed border-border p-6 text-center text-sm text-text-3">
              Wähle einen Bericht aus der Liste links.
            </div>
          )}
        </div>
      </div>

      <ManuellerBerichtModal
        open={manuellOpen}
        onClose={() => setManuellOpen(false)}
        onSubmit={onManuellAnlegen}
      />
    </section>
  );
}

function StatusBadge({ item }: { item: EinsatzListItem }) {
  if (item.status === "aktiv") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald/30 bg-emerald/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-emerald">
        <Unlock size={9} /> aktiv
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-text-3/30 bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-text-2">
      <Lock size={9} /> geschützt
    </span>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-text-1 bg-text-1 text-bg-page"
          : "border-border bg-surface-2 text-text-2 hover:border-border-strong"
      }`}
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
