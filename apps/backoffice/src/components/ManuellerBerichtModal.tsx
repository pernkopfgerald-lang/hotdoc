import { EINSATZARTEN } from "@hotdoc/shared";
import { X } from "lucide-react";
import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { einsatzort: string; einsatzart?: string; einsatzartFreitext?: string; grund?: string }) => Promise<void>;
}

export function ManuellerBerichtModal({ open, onClose, onSubmit }: Props) {
  const [einsatzort, setEinsatzort] = useState("");
  const [einsatzart, setEinsatzart] = useState<string>("");
  const [freitext, setFreitext] = useState("");
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    if (einsatzort.trim().length < 3) {
      setErr("Einsatzort mit mind. 3 Zeichen erforderlich.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await onSubmit({
        einsatzort: einsatzort.trim(),
        ...(einsatzart ? { einsatzart } : {}),
        ...(freitext ? { einsatzartFreitext: freitext } : {}),
        ...(grund ? { grund } : {}),
      });
      setEinsatzort("");
      setEinsatzart("");
      setFreitext("");
      setGrund("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4">
      <button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-m border border-border bg-surface-1 p-5 shadow-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-lg font-semibold">Neuer Bericht (manuell)</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
              FR-12 · ohne BlaulichtSMS-Alarm
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-surface-3"
            aria-label="Schließen"
          >
            <X size={18} />
          </button>
        </header>

        <label className="block">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
            Einsatzort *
          </span>
          <input
            value={einsatzort}
            onChange={(e) => setEinsatzort(e.target.value)}
            placeholder="z.B. Eberstalzeller Str. 5"
            className="mt-1 w-full rounded-s border border-border bg-surface-2 px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          />
        </label>

        <label className="mt-3 block">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
            Einsatzart
          </span>
          <select
            value={einsatzart}
            onChange={(e) => setEinsatzart(e.target.value)}
            className="mt-1 w-full rounded-s border border-border bg-surface-2 px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          >
            <option value="">— wählen —</option>
            {EINSATZARTEN.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
            oder Freitext
          </span>
          <input
            value={freitext}
            onChange={(e) => setFreitext(e.target.value)}
            placeholder="Wenn Einsatzart nicht passt …"
            className="mt-1 w-full rounded-s border border-border bg-surface-2 px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
          />
        </label>

        <label className="mt-3 block">
          <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
            Grund der Anlage (optional, für Audit)
          </span>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={2}
            placeholder="z.B. Pumparbeiten ohne vorherigen Alarm"
            className="mt-1 w-full rounded-s border border-border bg-surface-2 p-2 text-sm focus:border-border-strong focus:outline-none"
          />
        </label>

        {err && (
          <div className="mt-3 rounded-s border border-red/40 bg-red/10 p-2 text-sm text-red">{err}</div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-m border border-border px-3 py-2 text-sm"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-m bg-red px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
          >
            {busy ? "Anlegen …" : "Anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
