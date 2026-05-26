import { AlertTriangle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiCall } from "../lib/api";
import type { FahrzeugId } from "@hotdoc/shared";
import { FAHRZEUGE } from "@hotdoc/shared";

interface Props {
  code: string;
  /** Wird gerufen wenn der Claim erfolgreich war + die Tablet-Konfig geschrieben werden soll. */
  onComplete: (fahrzeugId: FahrzeugId) => void;
  /** Cancel-Button auf Fehler-Screen — User möchte normal weitermachen / Setup. */
  onCancel: () => void;
}

type ClaimState =
  | { kind: "claiming" }
  | { kind: "success"; fahrzeugId: FahrzeugId; funkrufname: string }
  | { kind: "error"; code: number; msg: string };

const TOKEN_KEY = "hotdoc.tabletToken";

/**
 * Handoff-Claim-Bildschirm.
 *
 * Aufgerufen wenn der Browser `/handoff/<code>` öffnet. Macht den GET-
 * Request an die Backend-Claim-Route, speichert den neuen Token in
 * localStorage und übergibt die fahrzeugId an `onComplete` damit die
 * App-Konfig stimmt.
 *
 * Bei Fehlern (Code abgelaufen, schon geclaimt, Tippfehler):
 * Fehler-Banner + Button "Zurück zum Setup".
 */
export function HandoffClaim({ code, onComplete, onCancel }: Props) {
  const [state, setState] = useState<ClaimState>({ kind: "claiming" });

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiCall<{
          ok: true;
          token: string;
          expiresAt: string;
          autoReleaseAt?: string;
          viaHandoff?: boolean;
          rolle: string;
          fahrzeugId?: string;
          einsatzId?: string;
        }>(`/api/auth/handoff/${encodeURIComponent(code)}`);
        // Token gleich speichern damit der nächste apiCall die Auth hat.
        try {
          localStorage.setItem(TOKEN_KEY, r.token);
          // Handoff-Metadaten getrennt speichern damit UI sie ohne
          // JWT-Decode lesen kann (Auto-Release-Countdown, Release-Banner)
          localStorage.setItem(
            "hotdoc.handoffInfo",
            JSON.stringify({
              viaHandoff: true,
              autoReleaseAt: r.autoReleaseAt,
              claimedAt: new Date().toISOString(),
              ...(r.einsatzId ? { einsatzId: r.einsatzId } : {}),
              ...(r.fahrzeugId ? { fahrzeugId: r.fahrzeugId } : {}),
            }),
          );
        } catch {
          // Quota/Private-Mode — Fehler explizit zeigen damit User merkt was Sache ist
          setState({
            kind: "error",
            code: 500,
            msg: "localStorage nicht verfügbar — bitte private/incognito-Modus verlassen.",
          });
          return;
        }
        const fz = r.fahrzeugId as FahrzeugId | undefined;
        if (!fz || !(fz in FAHRZEUGE)) {
          setState({
            kind: "error",
            code: 500,
            msg: `Unbekanntes Fahrzeug aus Handoff: ${fz ?? "(keins)"}`,
          });
          return;
        }
        setState({ kind: "success", fahrzeugId: fz, funkrufname: FAHRZEUGE[fz].funkrufname });
        // Kurz "Erfolgreich"-Animation, dann weiter.
        window.setTimeout(() => onComplete(fz), 900);
      } catch (e) {
        const status = (e as { status?: number }).status;
        let msg = "Übergabe fehlgeschlagen.";
        if (status === 404) msg = "Code unbekannt — bitte am Tablet einen neuen QR generieren.";
        else if (status === 410) msg = "Code abgelaufen oder bereits verwendet (single-use).";
        else if (e instanceof Error) msg = e.message;
        setState({ kind: "error", code: status ?? 500, msg });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--red) 8%, var(--bg)) 0%, var(--bg) 60%)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "var(--surface)",
          borderRadius: 18,
          border: "1px solid var(--border-strong)",
          padding: 28,
          boxShadow: "0 24px 64px -24px rgba(15,23,42,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          HotDoc · Notfall-Übergabe
        </div>

        {state.kind === "claiming" ? (
          <>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                gap: 14,
                padding: "10px 0",
              }}
            >
              <Loader2 size={36} className="animate-spin" style={{ color: "var(--fg-2)" }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)" }}>
                Übernehme Sitzung …
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--fg-3)",
                letterSpacing: "0.1em",
              }}
            >
              Code: <strong style={{ color: "var(--fg)" }}>{code}</strong>
            </div>
          </>
        ) : state.kind === "success" ? (
          <>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                gap: 12,
                padding: "10px 0",
                color: "var(--ok)",
              }}
            >
              <CheckCircle2 size={52} strokeWidth={1.8} />
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
                Übergabe erfolgreich
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                {state.funkrufname}
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              Sitzung wird geöffnet <ArrowRight size={14} />
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                placeItems: "center",
                gap: 12,
                padding: "10px 0",
                color: "var(--red)",
              }}
            >
              <AlertTriangle size={44} strokeWidth={1.8} />
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--fg)" }}>
                Übergabe fehlgeschlagen
              </div>
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--red-tint)",
                color: "var(--red)",
                border: "1px solid var(--red-border)",
                fontSize: 13,
                textAlign: "left",
              }}
            >
              {state.msg}
            </div>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid var(--border-strong)",
                background: "var(--surface-2)",
                color: "var(--fg)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Zurück zum Setup
            </button>
          </>
        )}
      </div>
    </div>
  );
}
