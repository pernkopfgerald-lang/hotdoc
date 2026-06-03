import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { AlertTriangle, ChevronRight, Download, Info, Lock, Smartphone } from "lucide-react";
import { useState } from "react";
import { db } from "../db/pouch";
import { AboutModal } from "../components/AboutModal";
import { BrandLogo } from "../components/BrandLogo";
import { isNative } from "../lib/platform";

/**
 * Test-Phasen-Schutz: jedes Fahrzeug muss sich beim Klick mit PIN 1234
 * anmelden. PIN wird NICHT in der UI verraten — die Kameraden bekommen
 * sie aus der WhatsApp/Schulung. Pro Fahrzeug-Auswahl (nicht pro Tablet
 * einmalig), damit auch beim Fahrzeug-Wechsel im laufenden Test-Betrieb
 * die Eingabe wiederholt werden muss.
 *
 * Schwacher Schutz (clientseitig), aber für die geschlossene Test-Phase
 * mit FF-Kameraden ausreichend. Vor dem produktiven Live-Betrieb wandert
 * der Check in den Backend-Endpoint /api/auth/tablet/pin-register zurück.
 */
const SETUP_PIN = "1234";

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

// Statt versionierter Direkt-URL (die nach jedem Release veraltet)
// linken wir auf die Landing-Seite — die liest /apk-info.json zur Laufzeit
// und bietet immer die aktuelle APK an. Damit broken Tablets, die diese
// PWA-Seite gecached haben, nicht beim naechsten Release.
const APK_DOWNLOAD_URL = "https://hotdoc-apk.fly.dev/";

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
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Klick auf eine Fahrzeug-Karte oeffnet diesen Dialog. Erst nach
   *  korrektem PIN ("1234", Test-Phasen-Schutz) wird der Backend-Call
   *  abgeschickt. Verhindert versehentliche Einrichtung UND blockt
   *  Fremde die zufaellig die PWA-URL kennen. */
  const [confirmFzg, setConfirmFzg] = useState<FahrzeugId | null>(null);
  /** PIN-Eingabe im Confirm-Dialog. Beim Schliessen/Wechseln immer
   *  geleert. Korrekter PIN-String aktiviert den "Ja, festlegen"-Button. */
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmPinErr, setConfirmPinErr] = useState<string | null>(null);

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
   * Fahrzeug-Klick → oeffnet Confirm-Dialog mit PIN-Eingabe.
   * Erst nach korrektem PIN + "Ja, festlegen" wird der Backend-Call
   * abgeschickt.
   */
  function selectFahrzeug(fId: FahrzeugId) {
    setError(null);
    setConfirmPin("");
    setConfirmPinErr(null);
    setConfirmFzg(fId);
  }

  /**
   * Schliesst den Confirm-Dialog inkl. PIN-State-Reset.
   */
  function closeConfirm() {
    setConfirmFzg(null);
    setConfirmPin("");
    setConfirmPinErr(null);
  }

  /**
   * Backend-Registrierung — wird vom Confirm-Dialog gerufen.
   * Prueft zuerst den PIN; bei falsch wird der Dialog mit Fehlermeldung
   * weiter angezeigt. Erst bei korrektem PIN wird tryRegister gerufen.
   */
  async function confirmFahrzeugSelection(fId: FahrzeugId): Promise<void> {
    if (confirmPin.trim() !== SETUP_PIN) {
      setConfirmPinErr("PIN nicht korrekt — bitte erneut eingeben.");
      setConfirmPin("");
      return;
    }
    setSelectedFzg(fId);
    setError(null);
    setConfirmPinErr(null);
    setBusy(true);
    const ok = await tryRegister(fId);
    setBusy(false);
    if (!ok) {
      // Dialog offen lassen, damit User erneut klicken kann.
      return;
    }
    closeConfirm();
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
      const { resolveApiUrl } = await import("../lib/api");
      const res = await fetch(resolveApiUrl("/api/auth/tablet/pin-register"), {
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
              fontSize: 47.5,
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
              fontSize: 14,
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
            fontSize: 18,
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
            fontSize: 16.5,
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
                onClick={() => selectFahrzeug(id)}
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
                    fontSize: 14,
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
                  <span style={{ fontSize: 20, fontWeight: 600 }}>{f.funkrufname}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
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
              fontSize: 16.5,
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
          fontSize: 12.5,
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
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "var(--tracking-tight)" }}>
              Als Android-App installieren
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              Echte APK · ~9 MB · Boot-Persistent
            </div>
            <div style={{ fontSize: 15, color: "var(--fg-2)", marginTop: 2, lineHeight: 1.4 }}>
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

      {/* Über HotDoc Link */}
      <button
        type="button"
        onClick={() => setAboutOpen(true)}
        style={{
          marginTop: 14,
          padding: "10px 14px",
          background: "transparent",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-s)",
          color: "var(--fg-2)",
          fontFamily: "inherit",
          fontSize: 15.5,
          fontWeight: 600,
          letterSpacing: "var(--tracking-ui)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Info size={14} />
        Über HotDoc · Entwickler · Lizenz · Release-Notes
      </button>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* U-07: Bestaetigungs-Dialog vor Fahrzeug-Registrierung.
          "Dieses Tablet wird als <Funkrufname> registriert. Spaeter nur
          durch Funktionaer aenderbar." */}
      {confirmFzg !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-confirm-title"
          onClick={() => !busy && closeConfirm()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              borderRadius: 16,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: "var(--warn-tint)",
                  color: "var(--warn)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                <AlertTriangle size={20} />
              </span>
              <h3
                id="setup-confirm-title"
                style={{ margin: 0, fontSize: 20, fontWeight: 700 }}
              >
                Dieses Tablet als <span style={{ color: "var(--info)" }}>
                  {FAHRZEUGE[confirmFzg].funkrufname}
                </span> festlegen?
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 17, color: "var(--fg-2)", lineHeight: 1.55 }}>
              Das Tablet wird als <strong>{FAHRZEUGE[confirmFzg].funkrufname}</strong>{" "}
              ({FAHRZEUGE[confirmFzg].bezeichnung}) registriert.
              Spaeter nur durch einen Funktionaer aenderbar.
            </p>

            {/* PIN-Eingabe — Test-Phasen-Schutz pro Fahrzeug. PIN ist in
                Schulung/WhatsApp kommuniziert, nicht hier im UI sichtbar. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void confirmFahrzeugSelection(confirmFzg);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <label
                htmlFor="setup-confirm-pin"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 16.5,
                  fontWeight: 600,
                  color: "var(--fg)",
                }}
              >
                <Lock size={14} />
                PIN zur Bestaetigung
              </label>
              <input
                id="setup-confirm-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={confirmPin}
                onChange={(e) => {
                  setConfirmPin(e.target.value);
                  if (confirmPinErr) setConfirmPinErr(null);
                }}
                maxLength={12}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: 25,
                  letterSpacing: "0.5em",
                  textAlign: "center",
                  background: "var(--surface-2)",
                  border: confirmPinErr
                    ? "1px solid var(--red)"
                    : "1px solid var(--border-strong)",
                  borderRadius: 10,
                  color: "var(--fg)",
                  outline: "none",
                }}
              />
            </form>

            {confirmPinErr ? (
              <div
                role="alert"
                style={{
                  padding: "8px 10px",
                  background: "var(--red-tint)",
                  color: "var(--red)",
                  border: "1px solid var(--red-border)",
                  borderRadius: 8,
                  fontSize: 15,
                }}
              >
                {confirmPinErr}
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                style={{
                  padding: "8px 10px",
                  background: "var(--red-tint)",
                  color: "var(--red)",
                  border: "1px solid var(--red-border)",
                  borderRadius: 8,
                  fontSize: 15,
                }}
              >
                {error}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={closeConfirm}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  fontSize: 16.5,
                  fontWeight: 600,
                  background: "var(--surface-2)",
                  color: "var(--fg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  cursor: busy ? "wait" : "pointer",
                  minHeight: 48,
                }}
              >
                Anderes waehlen
              </button>
              <button
                type="button"
                onClick={() => void confirmFahrzeugSelection(confirmFzg)}
                disabled={busy || confirmPin.trim().length === 0}
                className="cta"
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  fontSize: 16.5,
                  fontWeight: 700,
                  minHeight: 48,
                  opacity: confirmPin.trim().length === 0 ? 0.6 : 1,
                  cursor:
                    busy || confirmPin.trim().length === 0
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {busy ? "Lege fest …" : `Ja, ${FAHRZEUGE[confirmFzg].funkrufname} festlegen`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D-19: Datenschutz-Disclosure — gleich-gewichtig mit Hero/Fahrzeug
          ist visuelle Inflation. Wir verstecken die Details hinter einem
          <details>-Element. Funktionaer & Datenschutz-Beauftragte koennen
          klicken zum Aufklappen, alle anderen sehen nur den 1-zeiligen
          Hinweis. */}
      <details
        style={{
          marginTop: 16,
          padding: "10px 14px",
          background: "var(--glass-4)",
          border: "1px dashed var(--glass-border)",
          borderRadius: "var(--radius-s)",
          color: "var(--fg-2)",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: "var(--font-sm)",
            fontWeight: 600,
            color: "var(--fg-3)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            fontFamily: "var(--font-mono)",
          }}
        >
          Datenschutz · klick zum Aufklappen
        </summary>
        <div
          style={{
            fontSize: "var(--font-sm)",
            color: "var(--fg-2)",
            lineHeight: 1.6,
            marginTop: 10,
          }}
        >
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
      </details>
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
