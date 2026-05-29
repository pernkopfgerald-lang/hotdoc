import { AlertTriangle, CheckCircle2, Loader2, QrCode } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { db, getFahrzeugConfig } from "../db/pouch";
import { TOKEN_KEY } from "../lib/api";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  token: string;
  onComplete: (fahrzeugId: FahrzeugId) => void;
  onCancel: () => void;
}

type ClaimState =
  | { kind: "verifying" }
  | { kind: "ok"; fahrzeugId: FahrzeugId; funkrufname: string }
  | { kind: "revoked"; msg: string }
  | { kind: "invalid"; msg: string }
  | { kind: "network"; msg: string };

/**
 * QR-Sticker-Auto-Login.
 *
 * Wird angezeigt wenn die URL `/qr/<token>` aufgerufen wurde — also nachdem
 * jemand den QR-Sticker am Tablet / im Auto / im Backoffice abfotografiert
 * hat. Komponente macht:
 *
 *  1. Sofort: GET /api/auth/qr/<token>
 *  2. Bei Erfolg: Tablet-Token in localStorage, FahrzeugConfig in PouchDB
 *     anlegen (oder aktualisieren wenn das Gerät bisher anderem Fahrzeug
 *     zugeordnet war), Seed laufen lassen für die Personalliste.
 *  3. Kurze Erfolgs-Anzeige (1.5 s) mit Funkrufname → dann onComplete.
 *  4. Bei Fehler: klarer Hinweis + "Manuell einrichten" Button.
 *
 * Multi-Device-Parallel: dieser Flow erzeugt einen frischen Token mit
 * eigener deviceId. Andere Geräte für dasselbe Fahrzeug bleiben
 * angemeldet — kein Single-Device-Logout (im Gegensatz zum QR-Handoff).
 */
export function QrClaim({ token, onComplete, onCancel }: Props) {
  const [state, setState] = useState<ClaimState>({ kind: "verifying" });
  /** Verhindert Doppel-Aufruf in React-Strict-Mode (useEffect läuft 2x). */
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim() {
    try {
      const res = await fetch(`/api/auth/qr/${encodeURIComponent(token)}`);
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        fahrzeugId?: string;
        error?: string;
        message?: string;
      };
      if (res.status === 401 && body.error === "qr_revoked") {
        setState({
          kind: "revoked",
          msg:
            body.message ??
            "Dieser QR-Code wurde vom Funktionär ungültig gemacht. Bitte neuen Sticker holen.",
        });
        return;
      }
      if (!res.ok || !body.token || !body.fahrzeugId) {
        setState({
          kind: "invalid",
          msg: body.message ?? body.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      // Token persistieren
      try {
        localStorage.setItem(TOKEN_KEY, body.token);
      } catch {
        // egal — beim ersten API-Call würde es auffallen
      }
      // FahrzeugConfig in PouchDB: anlegen oder aktualisieren
      const existing = await getFahrzeugConfig();
      const fahrzeugId = body.fahrzeugId as FahrzeugId;
      const now = new Date().toISOString();
      if (!existing) {
        await db.put({
          _id: "fahrzeug:self",
          type: "fahrzeug-config",
          fahrzeugId,
          tabletDeviceId: crypto.randomUUID(),
          setupAm: now,
        });
      } else if (existing.fahrzeugId !== fahrzeugId) {
        await db.put({
          ...existing,
          fahrzeugId,
          geaendertAm: now,
        });
      }
      const funkruf = FAHRZEUGE[fahrzeugId]?.funkrufname ?? fahrzeugId;
      setState({ kind: "ok", fahrzeugId, funkrufname: funkruf });
      // Kurze Erfolgsanzeige, dann weiter
      setTimeout(() => onComplete(fahrzeugId), 1500);
    } catch (err) {
      setState({
        kind: "network",
        msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <main
      className="page"
      style={{
        minHeight: "100vh",
        maxWidth: 520,
        margin: "0 auto",
        paddingTop: "min(10vh, 80px)",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <header
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            padding: 18,
            borderRadius: 28,
            background: "var(--glass-2)",
            backdropFilter: "var(--blur-2)",
            WebkitBackdropFilter: "var(--blur-2)",
            border: "1px solid var(--glass-border)",
            boxShadow: "var(--glass-shadow-2), 0 0 60px -12px var(--blue-glow)",
            color: "var(--info)",
          }}
        >
          <QrCode size={36} strokeWidth={2} />
        </div>
        <div>
          <BrandLogo variant="full" size={48} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          QR-Sticker-Anmeldung
        </div>
      </header>

      {state.kind === "verifying" ? (
        <Card
          tint="info"
          icon={<Loader2 size={26} className="animate-spin" />}
          title="QR wird geprüft …"
          text="Einen Moment — das Backend bestätigt deinen Sticker."
        />
      ) : state.kind === "ok" ? (
        <Card
          tint="ok"
          icon={<CheckCircle2 size={26} />}
          title={`Angemeldet · ${state.funkrufname}`}
          text="Bericht-Page öffnet sich gleich. Andere Geräte mit demselben QR bleiben aktiv — du arbeitest jetzt parallel."
        />
      ) : state.kind === "revoked" ? (
        <Card
          tint="warn"
          icon={<AlertTriangle size={26} />}
          title="QR-Sticker ungültig"
          text={state.msg}
          actions={
            <>
              <button type="button" className="cta" onClick={onCancel}>
                Manuell einrichten
              </button>
            </>
          }
        />
      ) : state.kind === "invalid" ? (
        <Card
          tint="red"
          icon={<AlertTriangle size={26} />}
          title="QR-Code nicht akzeptiert"
          text={`Backend-Antwort: ${state.msg}`}
          actions={
            <>
              <button type="button" className="cta" onClick={onCancel}>
                Manuell einrichten
              </button>
            </>
          }
        />
      ) : (
        <Card
          tint="red"
          icon={<AlertTriangle size={26} />}
          title="Server nicht erreichbar"
          text={`Netzwerkfehler: ${state.msg}. WLAN/Mobilfunk prüfen und Seite neu laden.`}
          actions={
            <>
              <button type="button" className="cta" onClick={() => location.reload()}>
                Erneut versuchen
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={onCancel}
                style={{
                  width: "auto",
                  padding: "0 16px",
                  minHeight: 48,
                  fontWeight: 600,
                  fontSize: 14,
                  gap: 8,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Manuell einrichten
              </button>
            </>
          }
        />
      )}
    </main>
  );
}

function Card({
  tint,
  icon,
  title,
  text,
  actions,
}: {
  tint: "info" | "ok" | "warn" | "red";
  icon: React.ReactNode;
  title: string;
  text: string;
  actions?: React.ReactNode;
}) {
  const palette = {
    info: { color: "var(--info)",  glow: "var(--glow-info)",  border: "var(--blue-border)" },
    ok:   { color: "var(--ok)",    glow: "var(--glow-ok)",    border: "var(--ok-border)" },
    warn: { color: "var(--warn)",  glow: "var(--glow-warn)",  border: "var(--warn-border)" },
    red:  { color: "var(--red)",   glow: "var(--glow-red-soft)", border: "var(--red-border)" },
  }[tint];
  return (
    <section
      className="card"
      style={{
        boxShadow: `var(--glass-shadow-2), ${palette.glow}`,
        borderColor: palette.border,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span
          style={{
            display: "grid",
            placeItems: "center",
            width: 48,
            height: 48,
            borderRadius: 14,
            background: `color-mix(in srgb, ${palette.color} 16%, transparent)`,
            color: palette.color,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "var(--tracking-tight)",
              color: "var(--fg)",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: "var(--fg-2)",
              letterSpacing: "var(--tracking-ui)",
            }}
          >
            {text}
          </p>
        </div>
      </div>
      {actions ? (
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>
      ) : null}
    </section>
  );
}
