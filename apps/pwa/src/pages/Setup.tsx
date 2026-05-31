import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { ChevronRight, Download, Smartphone } from "lucide-react";
import { useState } from "react";
import { db } from "../db/pouch";
import { BrandLogo } from "../components/BrandLogo";
import { isNative } from "../lib/platform";

/**
 * Erkennt einen Android-Browser, der NICHT bereits die APK ist. Genau
 * dort macht der "APK installieren"-Hinweis Sinn — auf iOS-Safari, am
 * Desktop oder in der laufenden APK selbst waere er nutzlos bzw. zirkulaer.
 */
function shouldShowApkHint(): boolean {
  if (isNative()) return false;
  try {
    return /Android/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}

const APK_DOWNLOAD_URL = "https://hotdoc-apk.fly.dev/hotdoc-v0.1.0-debug.apk";

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

const PIN_TOKEN_KEY = "hotdoc.tabletToken";

/**
 * Erstes Setup nach Installation:
 * 1. Fahrzeug wählen
 * 2. Backend registriert das Tablet, gibt JWT zurück → wird in
 *    localStorage gespeichert für nachfolgende API-Calls.
 *
 * PIN-los: seit der Einführung von QR-Sticker-Anmeldung und dem
 * Tailscale-/LAN-Modus brauchen Tablets keine PIN mehr. Wer im richtigen
 * Netz hängt und das passende Fahrzeug auswählt → ist drin.
 *
 * Fallback wenn das Backend nicht erreichbar ist (z. B. erstes Setup
 * ohne Netz): Tablet bleibt offline-tauglich, registriert sich beim
 * ersten Online-Sync nach.
 */
export function Setup({ onSetupDone }: Props) {
  const [selectedFzg, setSelectedFzg] = useState<FahrzeugId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wenn der Boot-Check festgestellt hat, dass der vorhandene Token tot
  // war (z. B. nach Backend-Restart, JWT-Secret-Rotation oder iOS-Safari-
  // ITP-Storage-Cleanup), wird in sessionStorage ein Reason-Flag gesetzt.
  // Wir zeigen dem User dann einen freundlichen Hinweis statt einer
  // unerklärten Setup-Seite.
  const setupReason = (() => {
    try {
      const r = sessionStorage.getItem("hotdoc.setupReason");
      if (r) sessionStorage.removeItem("hotdoc.setupReason");
      return r;
    } catch {
      return null;
    }
  })();

  /**
   * Fahrzeug-Klick → sofortige Backend-Registrierung. Bei Erfolg landet das
   * Tablet direkt auf der Bericht-Page.
   */
  async function selectFahrzeug(fId: FahrzeugId) {
    setSelectedFzg(fId);
    setError(null);
    setBusy(true);
    await tryRegister(fId);
    setBusy(false);
  }

  /**
   * Sendet die Anmeldung an /api/auth/tablet/pin-register (Name ist
   * historisch — PIN-Body wird ignoriert). Liefert bei Erfolg den
   * Session-Token, persistiert ihn lokal und schreibt das `fahrzeug:self`-
   * Doc mit Upsert-Pattern (kein „Document update conflict" mehr).
   */
  async function tryRegister(fahrzeugId: FahrzeugId): Promise<boolean> {
    const deviceId = crypto.randomUUID();
    try {
      const res = await fetch("/api/auth/tablet/pin-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fahrzeugId, deviceId }),
      });
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retryAfterMinutes?: number };
        const min = body.retryAfterMinutes ?? 30;
        setError(`Zu viele Versuche — bitte ${min} min warten.`);
        return false;
      }
      if (!res.ok) {
        setError(`Anmeldung fehlgeschlagen (HTTP ${res.status})`);
        return false;
      }
      const auth = (await res.json()) as { token?: string };
      if (!auth.token) {
        setError("Anmeldung unvollständig — Server antwortete ohne Token.");
        return false;
      }
      localStorage.setItem(PIN_TOKEN_KEY, auth.token);
    } catch (err) {
      console.warn("[setup] Backend nicht erreichbar:", err);
      setError(
        "Server gerade nicht erreichbar. Bitte WLAN/Mobilfunk prüfen und nochmal versuchen.",
      );
      return false;
    }

    // Upsert: PouchDB kann nach abgebrochenem Setup oder QR-Claim bereits
    // ein fahrzeug:self-Doc haben. Erst lesen → falls vorhanden mit _rev
    // updaten, sonst frisch anlegen. Verhindert „Document update conflict".
    try {
      const now = new Date().toISOString();
      let existing: PouchDB.Core.ExistingDocument<Record<string, unknown>> | null = null;
      try {
        existing = (await db.get("fahrzeug:self")) as PouchDB.Core.ExistingDocument<
          Record<string, unknown>
        >;
      } catch (err) {
        if ((err as PouchDB.Core.Error).status !== 404) throw err;
      }
      if (existing) {
        await db.put({
          ...existing,
          fahrzeugId,
          tabletDeviceId: deviceId,
          geaendertAm: now,
        });
      } else {
        await db.put({
          _id: "fahrzeug:self",
          type: "fahrzeug-config",
          fahrzeugId,
          tabletDeviceId: deviceId,
          setupAm: now,
        });
      }
      onSetupDone(fahrzeugId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  return (
    <main
      className="page"
      style={{
        minHeight: "100vh",
        maxWidth: 580,
        margin: "0 auto",
        paddingTop: "min(8vh, 64px)",
      }}
    >
      {/* ─── Hero-Header ─── */}
      <header
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          marginBottom: 8,
          position: "relative",
        }}
      >
        {/* Logo mit Glow-Aura */}
        <div
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            padding: 22,
            borderRadius: 32,
            background: "var(--glass-2)",
            backdropFilter: "var(--blur-2)",
            WebkitBackdropFilter: "var(--blur-2)",
            border: "1px solid var(--glass-border)",
            boxShadow: "var(--glass-shadow-2), 0 0 60px -10px rgba(200,16,46,0.20)",
          }}
        >
          <BrandLogo variant="full" size={64} />
        </div>

        <div>
          <h1
            style={{
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: "var(--tracking-display)",
              color: "var(--fg)",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            HotDoc
          </h1>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginTop: 6,
            }}
          >
            FF Eberstalzell · Einsatzdokumentation
          </div>
        </div>

        <p
          style={{
            fontSize: 14.5,
            color: "var(--fg-2)",
            maxWidth: 440,
            lineHeight: 1.55,
            letterSpacing: "var(--tracking-ui)",
            margin: 0,
          }}
        >
          Erstes Setup — wähle das Fahrzeug, auf dem dieses Tablet fix verlastet ist.
        </p>
      </header>

      {/* ─── Reason-Hinweis (Boot-Check hat altes Token verworfen) ─── */}
      {setupReason === "auth-failed" || setupReason === "role-stale" ? (
        <div
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--info-tint)",
            backdropFilter: "var(--blur-3)",
            WebkitBackdropFilter: "var(--blur-3)",
            border: "1px solid var(--blue-border)",
            color: "var(--fg)",
            fontSize: 13,
            lineHeight: 1.55,
            boxShadow: "var(--glow-info)",
          }}
        >
          <strong style={{ color: "var(--info)" }}>Sitzung aufgefrischt.</strong>{" "}
          Wähle dein Fahrzeug — du bist sofort wieder drin, kein PIN nötig.
        </div>
      ) : null}

      <section className="card hero" style={{ marginTop: 8 }}>
        <div className="card-head">
          <div className="card-title">Fahrzeugauswahl</div>
          <span className="card-meta">{FAHRZEUG_IDS.length} Fahrzeuge</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAHRZEUG_IDS.map((id) => {
            const f = FAHRZEUGE[id];
            const isZentrale = id === "zentrale";
            const isSelected = selectedFzg === id && busy;
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => void selectFahrzeug(id)}
                className="person filled"
                style={{
                  cursor: busy ? "wait" : "pointer",
                  padding: "12px 14px 12px 12px",
                  opacity: busy && !isSelected ? 0.5 : 1,
                  ...(isZentrale
                    ? {
                        background:
                          "linear-gradient(135deg, var(--red-tint) 0%, transparent 60%), var(--glass-2)",
                        borderColor: "var(--red-border)",
                      }
                    : {}),
                }}
              >
                <span
                  className="avatar"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    background: isZentrale
                      ? "linear-gradient(135deg, var(--red) 0%, var(--red-strong) 100%)"
                      : "linear-gradient(135deg, var(--fg) 0%, var(--fg-2) 100%)",
                    color: isZentrale ? "#fff" : "var(--bg)",
                    letterSpacing: "0.06em",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    boxShadow: isZentrale ? "var(--glow-red-soft)" : "none",
                  }}
                >
                  {shortCode(id)}
                </span>
                <div
                  className="name"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 3,
                  }}
                >
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{f.funkrufname}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "var(--tracking-caps)",
                      textTransform: "uppercase",
                      color: "var(--fg-3)",
                    }}
                  >
                    {f.bezeichnung} · Besatzung {f.besatzung.typ}
                  </span>
                </div>
                <div className="chev">
                  <ChevronRight size={14} strokeWidth={2.5} />
                </div>
              </button>
            );
          })}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: "12px 14px",
              borderRadius: "var(--radius-s)",
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--red-border)",
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      <p
        style={{
          marginTop: 10,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--fg-3)",
        }}
      >
        Diese Einstellung kann später nur durch einen Funktionär geändert werden.
      </p>

      {/* ─── Android-APK-Hinweis ─── nur fuer Browser-Aufruf auf Android */}
      {shouldShowApkHint() ? (
        <a
          href={APK_DOWNLOAD_URL}
          download
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 16,
            padding: "14px 16px 14px 14px",
            borderRadius: "var(--radius-m)",
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--ok) 14%, transparent), color-mix(in srgb, var(--ok) 6%, transparent))",
            border: "1px solid var(--ok-border)",
            boxShadow: "0 6px 18px -8px var(--emerald-glow)",
            color: "var(--fg)",
            textDecoration: "none",
            transition: "transform 180ms var(--ease-smooth)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--ok-tint)",
              color: "var(--ok)",
              flexShrink: 0,
              border: "1px solid var(--ok-border)",
            }}
          >
            <Smartphone size={22} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "var(--tracking-tight)" }}>
              Als Android-App installieren
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              Echte APK · ~9 MB · Boot-Persistent
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.4 }}>
              Browser-Lesezeichen sind unzuverlässig — die APK läuft auch nach Tablet-Neustart sofort weiter und kann später FCM-Push empfangen.
            </div>
          </div>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--ok)",
              color: "#fff",
              flexShrink: 0,
              boxShadow: "0 4px 12px -2px var(--emerald-glow)",
            }}
          >
            <Download size={16} strokeWidth={2.5} />
          </span>
        </a>
      ) : null}

      {/* ─── Datenschutz-Karte ─── */}
      <div
        className="card"
        style={{
          marginTop: 16,
          padding: 18,
          borderStyle: "dashed",
          borderColor: "var(--glass-border)",
          background: "var(--glass-4)",
        }}
      >
        <div className="caption" style={{ marginBottom: 8 }}>
          Datenschutz-Hinweis
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.6 }}>
          HotDoc speichert nur Daten die für die Einsatzdokumentation der FF Eberstalzell
          notwendig sind:
          <ul style={{ margin: "8px 0 4px", paddingLeft: 18 }}>
            <li>Personalliste (aus syBOS, nur aktive Mitglieder)</li>
            <li>GPS-Position des Tablets nur während des Einsatzes</li>
            <li>Audio-Aufnahmen werden nach 30 Tagen automatisch gelöscht</li>
            <li>Login-Versuche werden für Audit-Zwecke 1 Jahr aufbewahrt</li>
          </ul>
          Bei Fragen wende dich an den Funktionär oder die Datenschutz-Beauftragte der
          Feuerwehr.
        </div>
      </div>
    </main>
  );
}

function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}
