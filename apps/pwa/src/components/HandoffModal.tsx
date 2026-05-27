import { AlertTriangle, CheckCircle2, Loader2, Monitor, QrCode, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { apiCall } from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Aktiver Einsatz beim Erstellen — der Empfänger landet direkt darauf. */
  einsatzId?: string;
  /** Wird aufgerufen wenn der QR vom Handy geclaimt wurde — Tablet loggt sich dann selbst aus. */
  onClaimed: () => void;
  /**
   * "forward" = Tablet → Handy (Notfall-Übergabe, mit Auto-Release)
   * "reverse" = Handy → Tablet (Sitzung sofort zurückgeben, kein Auto-Release)
   * Affektet nur die UI-Wording — die Backend-Logik leitet sich vom
   * source-Token-viaHandoff-Flag ab.
   */
  mode?: "forward" | "reverse";
}

type HandoffState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "ready"; code: string; expiresAt: string }
  | { kind: "claimed" }
  | { kind: "expired" }
  | { kind: "error"; msg: string };

/**
 * QR-Notfall-Übergabe.
 *
 * Beim Öffnen wird sofort ein 8-Zeichen-Short-Code im Backend angelegt
 * (5 min gültig). Der QR-Code zeigt auf `/handoff/<code>` — wenn das
 * Handy scannt, ruft es die Claim-Route und bekommt einen neuen JWT-
 * Token mit allen Tablet-Rechten. Single-Device-Modell: sobald der Claim
 * erfolgt ist, loggt sich der Tablet selbst aus (`onClaimed`).
 *
 * Polling läuft alle 5 s — wenn der Status `claimed=true` zurückkommt,
 * triggert die Komponente sofort `onClaimed`. Beim Schließen / Unmount
 * wird das Polling beendet.
 */
export function HandoffModal({ open, onClose, einsatzId, onClaimed, mode = "forward" }: Props) {
  const [state, setState] = useState<HandoffState>({ kind: "idle" });
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Beim Öffnen: Code erstellen.
  useEffect(() => {
    if (!open) {
      setState({ kind: "idle" });
      return;
    }
    if (state.kind !== "idle") return;
    setState({ kind: "creating" });
    void (async () => {
      try {
        const r = await apiCall<{ ok: true; code: string; expiresAt: string }>(
          "/api/auth/handoff/create",
          {
            method: "POST",
            body: { ...(einsatzId ? { einsatzId } : {}) },
          },
        );
        setState({ kind: "ready", code: r.code, expiresAt: r.expiresAt });
      } catch (e) {
        setState({
          kind: "error",
          msg: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Beim "ready": starte Polling + Countdown.
  useEffect(() => {
    if (state.kind !== "ready") return;
    const code = state.code;
    const expiresAtMs = new Date(state.expiresAt).getTime();

    const tick = async () => {
      try {
        const r = await apiCall<{ claimed: boolean; expired: boolean }>(
          `/api/auth/handoff/${encodeURIComponent(code)}/status`,
        );
        if (r.claimed) {
          setState({ kind: "claimed" });
          stopPolling();
          // Kurze Verzögerung damit der User die "Erfolgreich"-Animation sieht
          window.setTimeout(() => onClaimed(), 1200);
        } else if (r.expired) {
          setState({ kind: "expired" });
          stopPolling();
        }
      } catch {
        // Network-Fehler — beim nächsten Tick erneut versuchen
      }
    };

    pollRef.current = setInterval(() => void tick(), 5_000);

    const updateCountdown = () => {
      const ms = expiresAtMs - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
      if (ms <= 0) {
        setState({ kind: "expired" });
        stopPolling();
      }
    };
    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1_000);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind === "ready" ? state.code : null]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }

  // ESC zum Schließen — außer im "claimed"-Auto-Logout-Fenster.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.kind !== "claimed") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.kind, onClose]);

  if (!open) return null;

  const claimUrl = state.kind === "ready" ? `${window.location.origin}/handoff/${state.code}` : "";
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const reverse = mode === "reverse";
  const TargetIcon = reverse ? Monitor : Smartphone;
  const title = reverse ? "Sitzung ans Tablet zurückgeben" : "Notfall-Übergabe an Handy";
  const subtitle = reverse
    ? "QR scannen am Tablet · Sitzung normalisieren · Handy logt sich aus"
    : "QR scannen · Sitzung übernehmen · Tablet logt sich aus";
  const scanInstruction = reverse
    ? "Öffne am Tablet die Kamera oder den HotDoc-Scanner und scanne den QR-Code. Sobald das Tablet übernimmt, loggt sich dieses Handy automatisch aus."
    : "Öffne am Handy die Kamera und scanne den QR-Code. Sobald das Handy übernimmt, loggt sich dieses Tablet automatisch aus.";
  const successText = reverse
    ? "Das Tablet hat die Sitzung übernommen. Dieses Handy wird in einem Moment ausgeloggt."
    : "Das Handy hat die Sitzung übernommen. Dieses Tablet wird in einem Moment ausgeloggt.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: reverse
            ? "var(--glass-shadow-1), var(--glow-info)"
            : "var(--glass-shadow-1), var(--glow-red-soft)",
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: 12,
              background: reverse
                ? "linear-gradient(135deg, var(--info) 0%, color-mix(in srgb, var(--info) 60%, #000) 100%)"
                : "linear-gradient(135deg, var(--red) 0%, color-mix(in srgb, var(--red) 60%, #000) 100%)",
              color: "#fff",
              boxShadow: reverse
                ? "0 8px 20px -6px rgba(37,99,235,0.5)"
                : "0 8px 20px -6px rgba(200,16,46,0.5)",
            }}
          >
            <TargetIcon size={20} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <h2
              id="handoff-title"
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              {subtitle}
            </p>
          </div>
          {state.kind !== "claimed" ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              style={{
                background: "transparent",
                border: 0,
                color: "var(--fg-3)",
                padding: 6,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
          ) : null}
        </header>

        {/* Body je nach State */}
        {state.kind === "creating" ? (
          <div
            style={{
              padding: "40px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              color: "var(--fg-2)",
            }}
          >
            <Loader2 size={24} className="animate-spin" />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Code wird erstellt …
            </span>
          </div>
        ) : state.kind === "ready" ? (
          <>
            {/* QR-Code */}
            <div
              style={{
                background: "#fff",
                padding: 16,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--border)",
              }}
            >
              <QRCodeSVG
                value={claimUrl}
                size={240}
                level="M"
                marginSize={2}
                title={`HotDoc Handoff ${state.code}`}
              />
            </div>

            {/* Code als Klartext (Backup falls QR-Scan nicht klappt) */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                  marginBottom: 4,
                }}
              >
                Notfall-Code
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  color: "var(--fg)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {state.code}
              </div>
            </div>

            {/* Countdown + Anweisung */}
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: secondsLeft < 60 ? "var(--warn-tint)" : "var(--surface-2)",
                border: `1px solid ${secondsLeft < 60 ? "var(--amber-border)" : "var(--border)"}`,
                color: secondsLeft < 60 ? "var(--warn)" : "var(--fg-2)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <QrCode size={14} />
              <span style={{ flex: 1 }}>
                Gültig noch <strong>{mins}:{String(secs).padStart(2, "0")}</strong>
              </span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.55,
                color: "var(--fg-3)",
              }}
            >
              {scanInstruction}
            </p>
          </>
        ) : state.kind === "claimed" ? (
          <div
            style={{
              padding: "30px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              color: "var(--ok)",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={48} strokeWidth={1.8} />
            <strong style={{ fontSize: 16 }}>Übernahme erfolgreich</strong>
            <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>{successText}</p>
          </div>
        ) : state.kind === "expired" ? (
          <div
            style={{
              padding: "30px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              color: "var(--warn)",
              textAlign: "center",
            }}
          >
            <AlertTriangle size={40} strokeWidth={1.8} />
            <strong style={{ fontSize: 15 }}>Code ist abgelaufen</strong>
            <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>
              Der QR-Code war 5 Minuten gültig. Schließe den Dialog und versuche es erneut.
            </p>
          </div>
        ) : state.kind === "error" ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "var(--red-tint)",
              color: "var(--red)",
              border: "1px solid var(--red-border)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <AlertTriangle size={14} />
            <span>Fehler: {state.msg}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
