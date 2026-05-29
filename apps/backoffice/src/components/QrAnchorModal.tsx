import { AlertTriangle, CheckCircle2, Loader2, Printer, QrCode, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { buildQrClaimUrl, getQrAnchor, rotateQrAnchor, type QrAnchorResponse } from "../api/qrAnchor";

interface Props {
  open: boolean;
  fahrzeugId: string;
  fahrzeugLabel: string;
  funkrufname: string;
  onClose: () => void;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: QrAnchorResponse }
  | { kind: "rotating"; previous: QrAnchorResponse }
  | { kind: "error"; msg: string };

/**
 * Zeigt den aktuellen QR-Sticker für ein Fahrzeug an. Funktionär kann den
 * Sticker drucken (window.print() blendet alles außer dem Print-Bereich
 * aus) oder rotieren — Rotation bumpt die Generation, alle vorhandenen
 * Sticker werden ungültig.
 *
 * Sicherheits-Hinweis: Multi-Device-Parallel ist gewollt — mehrere Geräte
 * mit demselben QR sind kein Fehler. Bei Tablet-Verlust oder Verdacht auf
 * Foto-Kopie des Stickers → rotieren.
 */
export function QrAnchorModal({ open, fahrzeugId, fahrzeugLabel, funkrufname, onClose }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmRotate(false);
    setState({ kind: "loading" });
    void (async () => {
      try {
        const data = await getQrAnchor(fahrzeugId);
        setState({ kind: "ready", data });
      } catch (err) {
        setState({
          kind: "error",
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [open, fahrzeugId]);

  if (!open) return null;

  async function doRotate() {
    if (state.kind !== "ready") return;
    setState({ kind: "rotating", previous: state.data });
    try {
      const next = await rotateQrAnchor(fahrzeugId);
      setState({ kind: "ready", data: next });
      setConfirmRotate(false);
    } catch (err) {
      setState({
        kind: "error",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function doPrint() {
    setPrinting(true);
    // Browser-Print öffnen — das @media print im CSS unten zeigt nur den
    // Print-Bereich. Nach setTimeout 0 wird der DOM-Reflow garantiert.
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 50);
  }

  const data = state.kind === "ready" ? state.data : state.kind === "rotating" ? state.previous : null;
  const claimUrl = data ? buildQrClaimUrl(data.token) : "";

  return (
    <>
      <div
        className="qr-modal-screen-only"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
          display: "grid",
          placeItems: "center",
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          padding: 16,
          overflow: "auto",
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && !printing) onClose();
        }}
      >
        <div className="card" style={{ width: "100%", maxWidth: 560, margin: "24px 0" }}>
          {/* Header */}
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
                  background: "color-mix(in srgb, var(--info) 16%, transparent)",
                  color: "var(--info)",
                }}
              >
                <QrCode size={20} strokeWidth={2.2} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
                  QR-Sticker · {fahrzeugLabel}
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
                  {funkrufname}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="themetoggle"
              disabled={printing}
            >
              <X size={16} />
            </button>
          </header>

          {/* Inhalt je Status */}
          {state.kind === "loading" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "60px 0",
                color: "var(--fg-3)",
              }}
            >
              <Loader2 size={18} className="animate-spin" /> QR-Token wird geladen …
            </div>
          ) : state.kind === "error" ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                background: "var(--red-tint)",
                border: "1px solid var(--red-border)",
                color: "var(--red)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <AlertTriangle size={14} /> {state.msg}
            </div>
          ) : (
            <>
              {/* Hinweis-Box */}
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "var(--info-tint)",
                  border: "1px solid var(--blue-border)",
                  color: "var(--fg)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  marginBottom: 14,
                }}
              >
                <strong style={{ color: "var(--info)" }}>Multi-Device-Parallel.</strong>{" "}
                Jeder, der den QR scannt, wird als {fahrzeugLabel}-Tablet eingeloggt — ohne
                andere Geräte abzumelden. Ideal für Akku-Wechsel, Kdt-Handy oder Privathandy
                parallel.
              </div>

              {/* Print-Bereich */}
              <div
                className="qr-print-area"
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  color: "#111",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#666",
                  }}
                >
                  HotDoc · FF Eberstalzell
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111", textAlign: "center" }}>
                  {fahrzeugLabel}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: -8 }}>
                  {funkrufname}
                </div>

                {/* QR */}
                <div style={{ padding: 8 }}>
                  {state.kind === "rotating" ? (
                    <div
                      style={{
                        width: 260,
                        height: 260,
                        display: "grid",
                        placeItems: "center",
                        color: "#999",
                      }}
                    >
                      <Loader2 size={32} className="animate-spin" />
                    </div>
                  ) : (
                    <QRCodeSVG
                      value={claimUrl}
                      size={260}
                      level="M"
                      marginSize={2}
                      title={`HotDoc QR ${fahrzeugLabel}`}
                    />
                  )}
                </div>

                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111",
                    textAlign: "center",
                  }}
                >
                  Tablet-Login per Scan
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "#888",
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  Generation #{data?.generation ?? "?"} · {new Date().toLocaleDateString("de-AT")}
                </div>
              </div>

              {/* Klartext-URL-Backup */}
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--fg-3)",
                    fontFamily: "var(--font-mono)",
                    marginBottom: 4,
                  }}
                >
                  Deeplink (Backup)
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--fg-2)",
                    padding: "8px 10px",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    wordBreak: "break-all",
                  }}
                >
                  {claimUrl}
                </div>
              </div>

              {/* Action-Bar */}
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={doPrint}
                  disabled={state.kind === "rotating" || printing}
                  style={{
                    padding: "10px 18px",
                    background: "linear-gradient(180deg, var(--info), color-mix(in srgb, var(--info) 70%, #000))",
                    color: "#fff",
                    border: 0,
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Printer size={14} /> Drucken
                </button>

                {!confirmRotate ? (
                  <button
                    type="button"
                    onClick={() => setConfirmRotate(true)}
                    disabled={state.kind === "rotating"}
                    style={{
                      padding: "10px 14px",
                      background: "transparent",
                      color: "var(--warn)",
                      border: "1px solid var(--warn-border)",
                      borderRadius: 10,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <RotateCcw size={13} /> Rotieren
                  </button>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: "var(--warn-tint)",
                      border: "1px solid var(--warn-border)",
                      borderRadius: 10,
                    }}
                  >
                    <AlertTriangle size={14} style={{ color: "var(--warn)" }} />
                    <span style={{ fontSize: 12, color: "var(--fg-2)" }}>Alle alten Sticker werden ungültig.</span>
                    <button
                      type="button"
                      onClick={() => void doRotate()}
                      disabled={state.kind === "rotating"}
                      style={{
                        padding: "6px 12px",
                        background: "var(--warn)",
                        color: "#111",
                        border: 0,
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {state.kind === "rotating" ? "Rotiere …" : "Ja, rotieren"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRotate(false)}
                      style={{
                        padding: "6px 10px",
                        background: "transparent",
                        color: "var(--fg-3)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      Abbrechen
                    </button>
                  </div>
                )}

                {state.kind === "ready" ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: "var(--ok)",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <CheckCircle2 size={12} /> Generation {data?.generation}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print-Stylesheet: Beim Drucken nur den .qr-print-area zeigen */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .qr-modal-screen-only { position: static !important; background: transparent !important; backdrop-filter: none !important; padding: 0 !important; }
          .qr-modal-screen-only .card { box-shadow: none !important; border: 0 !important; background: transparent !important; padding: 0 !important; }
          .qr-modal-screen-only header, .qr-modal-screen-only > div > div:not(.qr-print-area) { display: none !important; }
          .qr-print-area, .qr-print-area * { visibility: visible !important; }
          .qr-print-area { position: absolute !important; left: 0; top: 0; width: 100%; border: 0 !important; }
        }
      `}</style>
    </>
  );
}
