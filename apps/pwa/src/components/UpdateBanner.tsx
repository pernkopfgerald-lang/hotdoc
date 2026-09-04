import { ChevronDown, ChevronUp, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { checkForUpdate } from "../lib/app-update";
import { getTabletToken } from "../lib/api";
import { installApkUpdate, isApkInstallerAvailable } from "../lib/apk-installer";

const DISMISS_KEY = "hotdoc.update.dismissed";

/** N-13: erster Update-Check erst 10 min nach dem Boot (nicht im Alarm-Moment). */
const FIRST_CHECK_DELAY_MS = 10 * 60 * 1000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Wie oft geprüft wird, ob noch ein offener Bericht-Draft vorliegt. */
const DRAFT_POLL_MS = 60 * 1000;

/**
 * N-13 (Audit 2026-09): Liegt lokal ein Fahrzeugbericht-Draft mit
 * `abgeschlossen == null` (= laufender, nicht abgeschlossener Bericht)?
 * Solange ja, wird der Banner unterdrückt — ein "Update jetzt" mitten im
 * Einsatz killt die App und damit die Mannschaftserfassung.
 */
function hatOffenenDraft(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("hotdoc.draft.")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { abgeschlossen?: unknown } | null;
      if (!parsed || typeof parsed !== "object") continue;
      if (parsed.abgeschlossen === null || parsed.abgeschlossen === undefined) return true;
    }
  } catch {
    // korrupter Draft / Private-Mode → im Zweifel NICHT unterdrücken
  }
  return false;
}

/**
 * Dezenter Update-Banner.
 *
 * - Erster Check 10 min nach dem Boot, danach alle 6 h
 *   /api/devices/app-version (N-13: kein Check mehr bei jedem Tab-
 *   Wiederreingucken — das feuerte genau im Alarm-Moment)
 * - Unterdrückt, solange ein Bericht-Draft offen ist
 * - Zeigt eine schmale rote Pille oben rechts wenn eine neuere Version
 *   verfuegbar ist
 * - Auf Android-Native nutzt der "Update jetzt"-Button das neue
 *   ApkInstaller-Plugin: lädt APK in den App-Cache, triggert direkt den
 *   Android-PackageInstaller — 1 Klick statt Browser-Umweg
 * - Im Browser-PWA fällt es auf window.open(apkUrl) zurück
 *
 * Wenn der User noch keine "Apps aus unbekannten Quellen erlauben"-
 * Permission hat, oeffnet das Plugin die System-Settings-UI. Wir zeigen
 * dann einen Hinweis und der User klickt erneut auf "Update".
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<{
    available: boolean;
    current: string;
    latest: string;
    apkUrl: string;
    notes: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<
    "idle" | "running" | "permission" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  // N-13: solange ein Bericht-Draft offen ist, bleibt der Banner weg.
  const [draftOffen, setDraftOffen] = useState<boolean>(() => hatOffenenDraft());

  useEffect(() => {
    const check = async (): Promise<void> => {
      const token = getTabletToken();
      if (!token) return;
      const res = await checkForUpdate("", token);
      let dismissed: string | null = null;
      try {
        dismissed = localStorage.getItem(DISMISS_KEY);
      } catch {
        // egal
      }
      if (dismissed === res.latest) return;
      setInfo({
        available: res.updateAvailable,
        current: res.current,
        latest: res.latest,
        apkUrl: res.apkUrl,
        notes: res.releaseNotes,
      });
    };
    // N-13: erster Check erst nach 10 min, dann 6-h-Intervall. Der frühere
    // visibilitychange-Trigger ist weg — er feuerte beim Aufwecken des
    // Tablets, also genau dann, wenn der Alarm reinkommt.
    const first = setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
    const t = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);

  // Draft-Zustand periodisch nachlesen — nur solange ein Update ansteht,
  // sonst wäre das ein unnötiger localStorage-Scan alle 60 s.
  useEffect(() => {
    if (!info?.available) return;
    const tick = (): void => setDraftOffen(hatOffenenDraft());
    tick();
    const t = setInterval(tick, DRAFT_POLL_MS);
    return () => clearInterval(t);
  }, [info?.available]);

  if (!info || !info.available) return null;
  if (draftOffen) return null;

  const runUpdate = async (): Promise<void> => {
    if (!info?.apkUrl) return;
    setStatus("running");
    setProgress(0);
    setStatusMessage("");
    const result = await installApkUpdate({
      url: info.apkUrl,
      onProgress: (e) => setProgress(e.percent),
    });
    if (result.status === "installer-launched") {
      setStatusMessage("Android Installer offen — bitte 'Aktualisieren' bestätigen.");
      setStatus("idle");
    } else if (result.status === "permission-required") {
      setStatus("permission");
      setStatusMessage(
        result.message ??
          "Bitte 'Apps aus dieser Quelle erlauben' aktivieren und erneut tippen.",
      );
    } else if (result.status === "web-fallback") {
      // Browser hat das übernommen — keine weitere UI nötig.
      setStatus("idle");
    } else {
      setStatus("error");
      setStatusMessage(result.message ?? "Update fehlgeschlagen.");
    }
    setProgress(null);
  };

  const buttonLabel = (() => {
    if (status === "running" && progress !== null) return `${progress}%`;
    if (status === "permission") return "Erlaubnis öffnen";
    if (status === "error") return "Nochmal";
    return isApkInstallerAvailable() ? "Update" : "Öffnen";
  })();

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 1400,
        maxWidth: 380,
        padding: expanded ? "12px 14px" : "10px 12px 10px 14px",
        borderRadius: 12,
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--red) 92%, transparent), color-mix(in srgb, var(--red-strong) 90%, transparent))",
        color: "#fff",
        boxShadow: "var(--glow-red), 0 12px 28px -10px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "var(--font-sans)",
        fontSize: 16.5,
        fontWeight: 600,
        letterSpacing: "var(--tracking-ui)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Download size={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div>HotDoc {info.latest} verfügbar</div>
          <div
            style={{
              fontSize: 12.5,
              fontFamily: "var(--font-mono)",
              opacity: 0.85,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            aktuell {info.current}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runUpdate()}
          disabled={status === "running"}
          style={{
            // D-02: Permission-Warning-State auf semantische Tokens
            // (var(--warn) statt fixem Amber, var(--bg-deep) als
            // Hochkontrast-Text auf Amber).
            background: status === "permission" ? "var(--warn)" : "rgba(255,255,255,0.18)",
            color: status === "permission" ? "var(--bg-deep)" : "#fff",
            border: 0,
            borderRadius: 8,
            padding: "6px 10px",
            fontWeight: 700,
            fontSize: 15,
            cursor: status === "running" ? "wait" : "pointer",
            minHeight: 0,
            minWidth: 64,
            opacity: status === "running" ? 0.7 : 1,
          }}
        >
          {buttonLabel}
        </button>
        {info.notes ? (
          <button
            type="button"
            aria-label={
              expanded ? "Release-Notes ausblenden" : "Release-Notes anzeigen"
            }
            onClick={() => setExpanded((x) => !x)}
            style={{
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
              border: 0,
              borderRadius: 6,
              padding: 4,
              cursor: "pointer",
              minHeight: 0,
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Verstecken"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, info.latest);
            } catch {
              // egal
            }
            setInfo(null);
          }}
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.7)",
            border: 0,
            borderRadius: 6,
            padding: 4,
            cursor: "pointer",
            minHeight: 0,
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress-Bar während Download */}
      {progress !== null && (
        <div
          style={{
            height: 3,
            background: "rgba(255,255,255,0.18)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "#fff",
              transition: "width 180ms linear",
            }}
          />
        </div>
      )}

      {/* Status-Meldung bei Permission/Error */}
      {statusMessage && (
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 500,
            background: "rgba(0,0,0,0.18)",
            padding: "6px 8px",
            borderRadius: 6,
            lineHeight: 1.4,
          }}
        >
          {statusMessage}
        </div>
      )}

      {expanded && info.notes ? (
        <div
          style={{
            marginTop: 2,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.18)",
            color: "rgba(255,255,255,0.95)",
            fontSize: 14.5,
            fontWeight: 500,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 220,
            overflow: "auto",
          }}
        >
          {info.notes}
        </div>
      ) : null}
    </div>
  );
}
