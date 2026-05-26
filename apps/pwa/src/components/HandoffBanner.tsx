import { AlertTriangle, Monitor, Smartphone, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getHandoffInfo,
  handoffHoursLeft,
  releaseHandoff,
  type HandoffInfo,
} from "../lib/handoff";
import { HandoffModal } from "./HandoffModal";

interface Props {
  /** Wird gerufen wenn der User „Jetzt freigeben" klickt — App entscheidet was als nächstes passiert (üblich: Setup-Screen). */
  onReleased: () => void;
}

/**
 * Banner-Indikator wenn die aktuelle Sitzung via QR-Notfall-Übergabe
 * entstanden ist. Zeigt einen Countdown bis zum Auto-Release und
 * bietet einen Button zur manuellen Freigabe.
 *
 * Renderlogik:
 *  - kein handoffInfo → null (nichts rendern)
 *  - handoffInfo aber Auto-Release noch in der Zukunft → orangenes Banner
 *  - confirm-Modal beim Klick auf Freigabe
 */
export function HandoffBanner({ onReleased }: Props) {
  const [info, setInfo] = useState<HandoffInfo | null>(() => getHandoffInfo());
  const [hoursLeft, setHoursLeft] = useState<number | null>(() => handoffHoursLeft());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reverseQrOpen, setReverseQrOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Countdown alle 30 s aktualisieren — Stunden-genau reicht, niemand
  // braucht Sekunden-Live-Update bei einem 24-h-Timer.
  useEffect(() => {
    if (!info) return;
    const tick = () => setHoursLeft(handoffHoursLeft(info));
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [info]);

  // Storage-Event: wenn der User in einem anderen Tab freigibt, sollten
  // wir auch in diesem Tab das Banner ausblenden.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "hotdoc.handoffInfo") setInfo(getHandoffInfo());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  if (!info) return null;

  async function release() {
    setBusy(true);
    try {
      await releaseHandoff();
    } finally {
      setBusy(false);
      setInfo(null);
      setConfirmOpen(false);
      onReleased();
    }
  }

  const fmt =
    hoursLeft === null
      ? "—"
      : hoursLeft < 1
        ? `< 1 Std`
        : hoursLeft < 24
          ? `${Math.floor(hoursLeft)} Std ${Math.floor((hoursLeft % 1) * 60)} min`
          : `${Math.floor(hoursLeft / 24)} Tg ${Math.floor(hoursLeft % 24)} Std`;

  const dringend = hoursLeft !== null && hoursLeft < 2;

  return (
    <>
      <div
        role="status"
        style={{
          margin: "6px 16px 0",
          padding: "8px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 10,
          background: dringend ? "var(--red-tint)" : "var(--warn-tint)",
          color: dringend ? "var(--red)" : "var(--warn)",
          border: `1px dashed ${dringend ? "var(--red-border)" : "var(--amber-border)"}`,
          fontSize: 12,
        }}
      >
        <Smartphone size={14} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            background: `${dringend ? "var(--red)" : "var(--warn)"}26`,
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Notfall-Sitzung
        </span>
        <span style={{ color: "var(--fg-2)", flex: 1 }}>
          Du arbeitest nach Tablet-Übergabe · Auto-Release in <strong>{fmt}</strong>
        </span>
        <button
          type="button"
          onClick={() => setReverseQrOpen(true)}
          style={{
            background: "var(--info)",
            border: "1px solid var(--info)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minHeight: 0,
          }}
          title="QR-Code generieren — Tablet kann scannen und übernehmen"
        >
          <Monitor size={11} /> QR fürs Tablet
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          style={{
            background: "transparent",
            border: `1px solid ${dringend ? "var(--red-border)" : "var(--amber-border)"}`,
            color: dringend ? "var(--red)" : "var(--warn)",
            padding: "4px 10px",
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            minHeight: 0,
          }}
          title="Sitzung beenden ohne QR — Tablet muss sich mit PIN neu einloggen"
        >
          <Undo2 size={11} /> Nur freigeben
        </button>
      </div>

      <HandoffModal
        open={reverseQrOpen}
        onClose={() => setReverseQrOpen(false)}
        {...(info?.einsatzId ? { einsatzId: info.einsatzId } : {})}
        mode="reverse"
        onClaimed={() => {
          // Tablet hat den QR gescannt und übernommen → Handy logged sich aus
          setReverseQrOpen(false);
          void release();
        }}
      />

      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2400,
            background: "rgba(15,23,42,0.62)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: "min(420px, 100%)",
              background: "var(--surface)",
              color: "var(--fg)",
              borderRadius: 18,
              border: "1px solid var(--border-strong)",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "0 24px 64px -24px rgba(15,23,42,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--warn-tint)",
                  color: "var(--warn)",
                }}
              >
                <AlertTriangle size={20} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  Sitzung wirklich freigeben?
                </h3>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                  }}
                >
                  Ans Tablet zurückgeben
                </p>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--fg-2)" }}>
              Stelle vor dem Freigeben sicher, dass du <strong>alle Änderungen gespeichert</strong>{" "}
              hast. Nach der Freigabe muss das Tablet sich mit seiner PIN wieder anmelden um
              die Sitzung fortzusetzen.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface-2)",
                  color: "var(--fg)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void release()}
                disabled={busy}
                style={{
                  padding: "9px 16px",
                  borderRadius: 10,
                  border: 0,
                  background:
                    "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  cursor: busy ? "wait" : "pointer",
                  boxShadow: "0 4px 12px rgba(217,119,6,0.32)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Undo2 size={14} />
                {busy ? "Gebe frei …" : "Ja, freigeben"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
