import { Lock, Unlock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { abschluss, getEinsatz, reaktivieren, type EinsatzListItem } from "../api/einsaetze";

interface Props {
  id: string;
  onChange: () => void;
}

export function BerichtDetail({ id, onChange }: Props) {
  const [doc, setDoc] = useState<(EinsatzListItem & Record<string, unknown>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reaktivModal, setReaktivModal] = useState(false);
  const [grund, setGrund] = useState("");

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const d = await getEinsatz(id);
      setDoc(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAbschluss() {
    if (!confirm("Bericht jetzt abschließen? Danach ist er schreibgeschützt.")) return;
    setBusy(true);
    try {
      await abschluss(id);
      await load();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReaktivieren() {
    if (grund.trim().length < 10) {
      setErr("Reaktivierungs-Grund muss mind. 10 Zeichen enthalten.");
      return;
    }
    setBusy(true);
    try {
      await reaktivieren(id, grund.trim());
      setReaktivModal(false);
      setGrund("");
      await load();
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!doc) {
    return (
      <div className="rounded-m border border-border bg-surface-1 p-6 text-sm text-text-3">
        {busy ? "lädt …" : err ?? "—"}
      </div>
    );
  }

  return (
    <article className="rounded-m border border-border bg-surface-1 p-5">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="m-0 text-xl font-semibold text-text-1">
            {(doc as { einsatzart?: string; einsatzartFreitext?: string }).einsatzart ??
              (doc as { einsatzartFreitext?: string }).einsatzartFreitext ??
              "(ohne Einsatzart)"}
          </h3>
          <p className="mt-0.5 text-sm text-text-2">{doc.einsatzort}</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">
            {doc._id} · {doc.einsatzTyp === "manuell" ? "manuell angelegt" : "BlaulichtSMS-Alarm"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === "aktiv" ? (
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald/30 bg-emerald/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald">
              <Unlock size={12} /> aktiv
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded border border-text-3/30 bg-surface-3 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-text-2">
              <Lock size={12} /> geschützt
            </span>
          )}
        </div>
      </header>

      {err && (
        <div className="mb-3 flex items-center gap-2 rounded-s border border-red/40 bg-red/10 p-3 text-sm text-red">
          <AlertTriangle size={16} /> {err}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
        <Field label="Alarmierung">{formatDateTime((doc as { alarmierungZeit: string }).alarmierungZeit)}</Field>
        <Field label="Status">{doc.status}</Field>
        <Field label="Schreibschutz">{doc.schreibschutz ? "JA" : "NEIN"}</Field>
        {doc.einsatzende && <Field label="Einsatzende">{formatDateTime(doc.einsatzende)}</Field>}
        {(doc as unknown as { alarmierungAuthor?: string }).alarmierungAuthor && (
          <Field label="Alarmiert von">
            {(doc as unknown as { alarmierungAuthor: string }).alarmierungAuthor}
          </Field>
        )}
      </dl>

      {doc.reaktivierungen && doc.reaktivierungen.length > 0 && (
        <section className="mt-5 rounded-s border border-amber/30 bg-amber/10 p-3">
          <header className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber">
            <AlertTriangle size={12} /> Reaktivierungs-Audit-Trail
          </header>
          <ul className="m-0 list-none space-y-1.5 text-xs">
            {doc.reaktivierungen.map((r, i) => (
              <li key={i} className="border-l-2 border-amber pl-2 text-text-1">
                <span className="font-mono text-text-3">{formatDateTime(r.am)}</span> · {r.grund}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-5 flex flex-wrap gap-2">
        {doc.status === "aktiv" ? (
          <button
            type="button"
            onClick={onAbschluss}
            disabled={busy}
            className="flex items-center gap-2 rounded-m border border-emerald/50 bg-gradient-to-b from-emerald to-emerald/80 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Abschließen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setReaktivModal(true)}
            disabled={busy}
            className="flex items-center gap-2 rounded-m border border-amber/50 bg-amber/15 px-4 py-2 text-sm font-semibold text-amber disabled:opacity-50"
          >
            <Unlock size={16} /> Reaktivieren …
          </button>
        )}
      </footer>

      {reaktivModal && (
        <div className="fixed inset-0 z-50 grid place-items-center px-4">
          <button
            type="button"
            aria-label="Schließen"
            className="absolute inset-0 bg-black/55"
            onClick={() => setReaktivModal(false)}
          />
          <div className="relative w-full max-w-md rounded-m border border-border bg-surface-1 p-5 shadow-2xl">
            <h4 className="m-0 text-lg font-semibold">Bericht reaktivieren</h4>
            <p className="mt-1 text-sm text-text-2">
              Der Bericht wurde am{" "}
              <strong>{doc.einsatzende ? formatDateTime(doc.einsatzende) : "—"}</strong>{" "}
              abgeschlossen. Eine Reaktivierung wird mit Audit-Trail dokumentiert.
            </p>
            <label className="mt-4 block">
              <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
                Grund (min. 10 Zeichen)
              </span>
              <textarea
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-s border border-border bg-surface-2 p-2 text-sm focus:border-border-strong focus:outline-none"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReaktivModal(false)}
                className="rounded-m border border-border px-3 py-2 text-sm"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={onReaktivieren}
                disabled={busy || grund.trim().length < 10}
                className="rounded-m bg-amber px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Reaktivieren
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 text-text-1">{children}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
