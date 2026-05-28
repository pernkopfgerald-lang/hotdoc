import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { ChevronRight, KeyRound, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { db } from "../db/pouch";
import { BrandLogo } from "../components/BrandLogo";

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

const PIN_TOKEN_KEY = "hotdoc.tabletToken";

/**
 * Erstes Setup nach Installation:
 * 1. Fahrzeug wählen
 * 2. PIN eingeben (4-6 Ziffern, Default "1234" — Funktionär ändert in
 *    Verwaltung/Stammdaten)
 * 3. Backend registriert das Tablet, gibt JWT zurück → wird in
 *    localStorage gespeichert für nachfolgende API-Calls.
 *
 * Fallback wenn das Backend nicht erreichbar ist (z. B. erstes Setup
 * ohne Netz): Tablet bleibt offline-tauglich, registriert sich beim
 * ersten Online-Sync nach.
 */
export function Setup({ onSetupDone }: Props) {
  const [stage, setStage] = useState<"vehicle" | "pin">("vehicle");
  const [selectedFzg, setSelectedFzg] = useState<FahrzeugId | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wenn der Boot-Check festgestellt hat, dass der vorhandene Token eine
  // veraltete Rolle hatte (z. B. zentrale-Tablet mit altem "mannschaft"-Token
  // nach dem Backend-Rollen-Fix), wird in sessionStorage ein Reason-Flag
  // gesetzt. Wir zeigen dem User dann einen freundlichen Hinweis statt eines
  // unerwarteten Setup-Screens.
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
   * Fahrzeug-Klick → sofortiger Login-Versuch OHNE PIN.
   * Wenn das Backend im Open-Modus läuft (HOTDOC_TABLET_NO_PIN=1) → durch.
   * Wenn das Backend PIN verlangt → 400 invalid_body → Fallback auf PIN-Stage.
   */
  async function selectFahrzeug(fId: FahrzeugId) {
    setSelectedFzg(fId);
    setError(null);
    setPin("");
    // Probe-Login ohne PIN
    setBusy(true);
    const ok = await tryRegister(fId, "");
    setBusy(false);
    if (!ok) {
      // Backend will doch eine PIN — Stage wechseln, User tippt PIN ein.
      setStage("pin");
    }
  }

  /**
   * Sendet die Anmeldung an /api/auth/tablet/pin-register. Behandelt alle
   * relevanten Fehler-Klassen und liefert true bei Erfolg.
   *
   * Bei einem 400 invalid_body (Backend verlangt PIN) liefert false OHNE
   * Fehlertext — selectFahrzeug() weiß dann, dass der PIN-Stage nötig wird.
   * Bei allen anderen Fehlern wird setError() gesetzt.
   */
  async function tryRegister(fahrzeugId: FahrzeugId, pinValue: string): Promise<boolean> {
    const deviceId = crypto.randomUUID();
    try {
      const res = await fetch("/api/auth/tablet/pin-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fahrzeugId, pin: pinValue, deviceId }),
      });
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retryAfterMinutes?: number };
        const min = body.retryAfterMinutes ?? 30;
        setError(`Zu viele Fehlversuche — bitte ${min} min warten.`);
        return false;
      }
      if (res.status === 400) {
        // PIN-required vom Backend — Fallback auf PIN-Stage, KEIN Fehlertext.
        return false;
      }
      if (res.status === 401) {
        setError("PIN falsch — bitte beim Funktionär nachfragen.");
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

    try {
      await db.put({
        _id: "fahrzeug:self",
        type: "fahrzeug-config",
        fahrzeugId,
        tabletDeviceId: deviceId,
        setupAm: new Date().toISOString(),
      });
      onSetupDone(fahrzeugId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function submitPin() {
    if (!selectedFzg) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN muss 4-6 Ziffern haben.");
      return;
    }
    setBusy(true);
    setError(null);
    await tryRegister(selectedFzg, pin);
    setBusy(false);
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

      {/* ─── Role-Stale-Hinweis ─── */}
      {setupReason === "role-stale" ? (
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
          <strong style={{ color: "var(--info)" }}>Sitzung aufgefrischt.</strong> Die
          alte Anmeldung dieses Tablets stammte noch aus einer früheren Version mit
          anderer Rollen-Zuordnung. Bitte gib jetzt einmal die PIN ein — danach läuft
          alles wie gewohnt.
        </div>
      ) : setupReason === "auth-failed" ? (
        <div
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--warn-tint)",
            backdropFilter: "var(--blur-3)",
            WebkitBackdropFilter: "var(--blur-3)",
            border: "1px solid var(--warn-border)",
            color: "var(--fg)",
            fontSize: 13,
            lineHeight: 1.55,
            boxShadow: "var(--glow-warn)",
          }}
        >
          <strong style={{ color: "var(--warn)" }}>Anmeldung erneuern.</strong> Die
          Sitzung dieses Tablets ist abgelaufen oder vom Server abgelehnt. Bitte gib
          die PIN erneut ein. Default ist <strong>1234</strong> wenn der Funktionär
          noch keine eigene gesetzt hat.
        </div>
      ) : null}

      {stage === "pin" && selectedFzg ? (
        <section className="card hero" style={{ marginTop: 8 }}>
          <div className="card-head">
            <div className="card-title">
              <KeyRound size={18} />
              PIN für {FAHRZEUGE[selectedFzg].funkrufname}
            </div>
            <span className="card-meta">{FAHRZEUGE[selectedFzg].bezeichnung}</span>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--fg-2)",
              marginBottom: 18,
              letterSpacing: "var(--tracking-ui)",
            }}
          >
            Gib die vom Funktionär ausgegebene PIN ein (4–6 Ziffern). Default{" "}
            <strong style={{ color: "var(--fg)" }}>1234</strong> wenn noch keine eigene
            gesetzt wurde.
          </p>
          <input
            type="tel"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="• • • •"
            className="input num"
            autoFocus
            style={{
              textAlign: "center",
              letterSpacing: "0.6em",
              fontSize: 32,
              fontWeight: 700,
              padding: "20px",
              fontFamily: "var(--font-mono)",
            }}
          />
          {error ? (
            <div
              style={{
                marginTop: 14,
                padding: "12px 14px",
                borderRadius: "var(--radius-s)",
                background: "var(--red-tint)",
                backdropFilter: "var(--blur-3)",
                WebkitBackdropFilter: "var(--blur-3)",
                color: "var(--red)",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--red-border)",
                boxShadow: "var(--glow-red-soft)",
              }}
            >
              {error}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => {
                setStage("vehicle");
                setError(null);
              }}
              className="icon-btn"
              style={{
                width: "auto",
                padding: "0 16px",
                gap: 8,
                display: "flex",
                alignItems: "center",
                minHeight: 56,
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <ArrowLeft size={14} /> Zurück
            </button>
            <button
              type="button"
              onClick={() => void submitPin()}
              disabled={busy || pin.length < 4}
              className="cta"
              style={{ flex: 1, padding: "16px 18px", fontSize: 15 }}
            >
              {busy ? "Anmelden …" : "Tablet registrieren"}
            </button>
          </div>
        </section>
      ) : (
        <section className="card hero" style={{ marginTop: 8 }}>
          <div className="card-head">
            <div className="card-title">Fahrzeugauswahl</div>
            <span className="card-meta">{FAHRZEUG_IDS.length} Fahrzeuge</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FAHRZEUG_IDS.map((id) => {
              const f = FAHRZEUGE[id];
              const isZentrale = id === "zentrale";
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => selectFahrzeug(id)}
                  className="person filled"
                  style={{
                    cursor: "pointer",
                    padding: "12px 14px 12px 12px",
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

          {error && stage === "vehicle" ? (
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
      )}

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
