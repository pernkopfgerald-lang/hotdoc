import { EINSATZARTEN } from "@hotdoc/shared";
import { Plus, X } from "lucide-react";
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        padding: 16,
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 480 }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "var(--info-tint)",
                color: "var(--info)",
              }}
            >
              <Plus size={18} strokeWidth={2.4} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
                Neuer Bericht (manuell)
              </h3>
              <p
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                FR-12 · ohne BlaulichtSMS-Alarm
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="themetoggle"
          >
            <X size={16} />
          </button>
        </header>

        <div className="field">
          <label className="caption">Einsatzort *</label>
          <input
            value={einsatzort}
            onChange={(e) => setEinsatzort(e.target.value)}
            placeholder="z. B. Eberstalzeller Str. 5"
            className="input"
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="caption">Einsatzart</label>
          <select
            value={einsatzart}
            onChange={(e) => setEinsatzart(e.target.value)}
            className="input"
            style={{ fontFamily: "inherit" }}
          >
            <option value="">— wählen —</option>
            {EINSATZARTEN.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="caption">oder Freitext</label>
          <input
            value={freitext}
            onChange={(e) => setFreitext(e.target.value)}
            placeholder="Wenn Einsatzart nicht passt …"
            className="input"
          />
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <label className="caption">Grund der Anlage (Audit)</label>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={2}
            placeholder="z. B. Pumparbeiten ohne vorherigen Alarm"
            className="input"
            style={{ resize: "vertical" }}
          />
        </div>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--red-border)",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            className="themetoggle"
            style={{ width: "auto", padding: "0 14px" }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="cta"
            style={{ width: "auto", padding: "10px 16px", fontSize: 14 }}
          >
            {busy ? "Anlegen …" : "Anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
