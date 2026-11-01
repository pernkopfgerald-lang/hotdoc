import { shortCode } from "../lib/format";
import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { AlertTriangle, ChevronRight, Download, Info, Loader2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { db, getFahrzeugConfig } from "../db/pouch";
import { AboutModal } from "../components/AboutModal";
import { BrandLogo } from "../components/BrandLogo";
import { hardResetLocalData } from "../components/ErrorBoundary";
import { isNative } from "../lib/platform";
import { APK_DOWNLOAD_URL } from "../lib/app-update";

/**
 * Fahrzeugwahl beim ersten Setup (alle Fahrzeuge inkl. Florian): Klick oeffnet eine Rueckfrage
 * ("Ja, <Fahrzeug> festlegen"). Es gibt KEINE PIN mehr — der Server meldet Tablets
 * ohnehin PIN-los an (HOTDOC_TABLET_NO_PIN); die Rueckfrage verhindert nur Fehltipps.
 */

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

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

const PIN_TOKEN_KEY = "hotdoc.tabletToken";

/**
 * Gründe, mit denen App.tsx den Setup-Screen öffnet (sessionStorage
 * "hotdoc.setupReason"). Alles andere = normales Erst-Setup.
 *  - auth-failed  → Token tot/weg (Server-Restart, Secret-Rotation, ITP)
 *  - role-stale   → Zentrale-Tablet mit alter mannschaft-Rolle
 *  - boot-failed  → C-02: PouchDB beim Boot nicht lesbar
 */
type SetupReason = "auth-failed" | "role-stale" | "boot-failed" | null;

/**
 * N-01/I-04 (Audit 2026-09): Zustand der stillen Neuanmeldung.
 *  - pruefe         → fahrzeug:self wird gelesen
 *  - laeuft         → pin-register läuft für das gespeicherte Fahrzeug
 *  - fehlgeschlagen → Auto-Login ging nicht, User muss PIN-Weg gehen
 *  - kein           → kein gespeichertes Fahrzeug bzw. kein Auth-Grund
 */
type AutoLogin = "pruefe" | "laeuft" | "fehlgeschlagen" | "kein";

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
 *
 * N-01/I-04 (Audit 2026-09): Landet das Tablet wegen abgelaufenem Token
 * hier (auth-failed/role-stale) und liegt noch `fahrzeug:self` in PouchDB,
 * wird die Anmeldung OHNE PIN-Dialog direkt wiederholt — der Server
 * erlaubt pin-register ohne PIN. Der Hinweis "kein PIN nötig" erscheint
 * nur, wenn das auch wirklich passiert; scheitert es, sieht der User den
 * normalen PIN-Weg mit Fehlertext.
 */
export function Setup({ onSetupDone }: Props) {
  const [selectedFzg, setSelectedFzg] = useState<FahrzeugId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  /** Klick auf eine Fahrzeug-Karte oeffnet diesen Rueckfrage-Dialog; erst "Ja, festlegen"
   *  schickt den Backend-Call ab. Verhindert versehentliche Einrichtung. */
  const [confirmFzg, setConfirmFzg] = useState<FahrzeugId | null>(null);

  // Wenn der Boot-Check festgestellt hat, dass der vorhandene Token tot
  // war (z. B. nach Backend-Restart, JWT-Secret-Rotation oder iOS-Safari-
  // ITP-Storage-Cleanup), wird in sessionStorage ein Reason-Flag gesetzt.
  // Wir zeigen dem User dann einen freundlichen Hinweis statt einer
  // unerklärten Setup-Seite. Einmalig im State-Initializer lesen — vorher
  // lief das bei jedem Render und der Hinweis verschwand nach dem ersten
  // State-Update wieder. Das Flag wird erst im Mount-Effekt geloescht, damit
  // ein doppelt laufender Initializer (StrictMode) nicht ins Leere greift.
  const [setupReason] = useState<SetupReason>(() => {
    try {
      const r = sessionStorage.getItem("hotdoc.setupReason");
      return r === "auth-failed" || r === "role-stale" || r === "boot-failed" ? r : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem("hotdoc.setupReason");
    } catch {
      // egal
    }
  }, []);
  const authReason = setupReason === "auth-failed" || setupReason === "role-stale";
  const [autoLogin, setAutoLogin] = useState<AutoLogin>(() => (authReason ? "pruefe" : "kein"));
  /** Fahrzeug, für das der Auto-Login läuft (nur für den Hinweistext). */
  const [autoFzg, setAutoFzg] = useState<FahrzeugId | null>(null);

  // N-01/I-04: stille Neuanmeldung über fahrzeug:self — ohne PIN-Dialog.
  useEffect(() => {
    if (autoLogin !== "pruefe") return;
    let cancelled = false;
    void (async () => {
      let cfg: Awaited<ReturnType<typeof getFahrzeugConfig>> = null;
      try {
        cfg = await getFahrzeugConfig();
      } catch (err) {
        console.warn("[setup] fahrzeug:self nicht lesbar:", err);
        cfg = null;
      }
      if (cancelled) return;
      if (!cfg?.fahrzeugId) {
        setAutoLogin("kein");
        return;
      }
      setAutoLogin("laeuft");
      setAutoFzg(cfg.fahrzeugId);
      setSelectedFzg(cfg.fahrzeugId);
      setBusy(true);
      // Geräte-UUID beibehalten — sonst zählt das Backend ein "neues" Gerät.
      const ok = await tryRegister(cfg.fahrzeugId, cfg.tabletDeviceId);
      if (cancelled) return;
      setBusy(false);
      if (!ok) setAutoLogin("fehlgeschlagen");
      // ok → tryRegister hat onSetupDone gerufen, der Screen ist weg.
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogin]);

  /** Fahrzeug-Klick → oeffnet den Rueckfrage-Dialog (kein Backend-Call). */
  function selectFahrzeug(fId: FahrzeugId) {
    setError(null);
    setConfirmFzg(fId);
  }

  /** Schliesst den Rueckfrage-Dialog. */
  function closeConfirm() {
    setConfirmFzg(null);
  }

  /** Backend-Registrierung — wird vom Rueckfrage-Dialog gerufen. */
  async function confirmFahrzeugSelection(fId: FahrzeugId): Promise<void> {
    setSelectedFzg(fId);
    setError(null);
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
   *
   * @param deviceIdOverride N-01: beim Auto-Login die bestehende Geräte-UUID
   *   aus fahrzeug:self weiterverwenden statt eine neue zu würfeln.
   */
  async function tryRegister(fahrzeugId: FahrzeugId, deviceIdOverride?: string): Promise<boolean> {
    const deviceId = deviceIdOverride || crypto.randomUUID();
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
            borderRadius: 6,
            background: "var(--glass-2)",
            border: "1px solid var(--glass-border)",
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

      {/* ─── Reason-Hinweis (Boot-Check hat altes Token verworfen) ───
          N-01/I-04: Text nur, wenn er auch stimmt — "kein PIN nötig"
          erscheint ausschliesslich waehrend der stillen Neuanmeldung. */}
      {authReason && (autoLogin === "pruefe" || autoLogin === "laeuft") ? (
        <div
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--info-tint)",
            border: "1px solid var(--blue-border)",
            color: "var(--fg)",
            fontSize: 16.5,
            lineHeight: 1.55,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--info)", flexShrink: 0 }} />
          <span>
            <strong style={{ color: "var(--info)" }}>Sitzung wird aufgefrischt …</strong>{" "}
            {autoLogin === "laeuft" && autoFzg
              ? `${FAHRZEUGE[autoFzg].funkrufname} meldet sich neu an — kein PIN nötig.`
              : "Gespeichertes Fahrzeug wird geprüft."}
          </span>
        </div>
      ) : null}
      {authReason && autoLogin === "fehlgeschlagen" ? (
        <div
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--warn-tint)",
            border: "1px solid var(--amber-border)",
            color: "var(--fg)",
            fontSize: 16.5,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--warn)" }}>Automatische Neuanmeldung fehlgeschlagen.</strong>{" "}
          Wähle dein Fahrzeug.
        </div>
      ) : null}
      {authReason && autoLogin === "kein" ? (
        <div
          role="status"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--info-tint)",
            border: "1px solid var(--blue-border)",
            color: "var(--fg)",
            fontSize: 16.5,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--info)" }}>Anmeldung abgelaufen.</strong>{" "}
          Wähle dein Fahrzeug — der laufende Bericht ist am Server gespeichert.
        </div>
      ) : null}
      {/* C-02: PouchDB beim Boot nicht lesbar → harter Reset ist der Weg. */}
      {setupReason === "boot-failed" ? (
        <div
          role="alert"
          style={{
            margin: "8px 0 0",
            padding: "14px 16px",
            borderRadius: "var(--radius-m)",
            background: "var(--red-tint)",
            border: "1px solid var(--red-border)",
            color: "var(--fg)",
            fontSize: 16.5,
            lineHeight: 1.55,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <AlertTriangle size={18} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
          <span>
            <strong style={{ color: "var(--red)" }}>Lokale Datenbank nicht lesbar</strong> — Tablet
            zurücksetzen (Über HotDoc → Reset). Bereits gesendete Berichte bleiben am Server.
          </span>
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
                          "var(--red-tint)",
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
                      ? "var(--red)"
                      : "var(--fg)",
                    color: isZentrale ? "#fff" : "var(--bg)",
                    width: 44,
                    height: 44,
                    borderRadius: 5,
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
              "var(--ok)",
            border: "1px solid var(--ok-border)",
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
              borderRadius: 5,
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
              borderRadius: 4,
              background: "var(--ok)",
              color: "#fff",
              flexShrink: 0,
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
      {/* C-02: Bei "boot-failed" bekommt das About-Modal den harten Reset
          (Drafts + PouchDB + Service-Worker) als Geraete-Aktion. Im
          normalen Setup gibt es nichts zurueckzusetzen. */}
      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        {...(setupReason === "boot-failed" ? { onResetSetup: () => void hardResetLocalData() } : {})}
      />

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
              borderRadius: 6,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              boxShadow: "var(--glass-shadow-1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 42,
                  height: 42,
                  borderRadius: 5,
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
              Später nur durch einen Funktionär änderbar.
            </p>

            {error ? (
              <div
                role="alert"
                style={{
                  padding: "8px 10px",
                  background: "var(--red-tint)",
                  color: "var(--red)",
                  border: "1px solid var(--red-border)",
                  borderRadius: 4,
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
                  borderRadius: 4,
                  cursor: busy ? "wait" : "pointer",
                  minHeight: 48,
                }}
              >
                Anderes wählen
              </button>
              <button
                type="button"
                onClick={() => void confirmFahrzeugSelection(confirmFzg)}
                disabled={busy}
                autoFocus
                className="cta"
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  fontSize: 16.5,
                  fontWeight: 700,
                  minHeight: 48,
                  cursor: busy ? "wait" : "pointer",
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

