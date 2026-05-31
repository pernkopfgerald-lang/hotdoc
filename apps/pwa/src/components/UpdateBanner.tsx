import { ChevronDown, ChevronUp, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { checkForUpdate, triggerUpdateDownload } from "../lib/app-update";
import { getTabletToken } from "../lib/api";

const DISMISS_KEY = "hotdoc.update.dismissed";

/**
 * Dezenter Update-Banner.
 *
 * - Pollt alle 6h /api/devices/app-version
 * - Zeigt eine schmale rote Pille oben rechts wenn eine neuere Version
 *   verfuegbar ist
 * - User kann "Update jetzt" klicken (oeffnet APK-URL im Browser →
 *   PackageInstaller) oder X klicken (versteckt die Pille bis die
 *   naechste neuere Version published wird).
 *
 * Im Browser-PWA tut der Banner nichts — getInstalledVersion liefert
 * dort "web" und checkForUpdate signalisiert no-update.
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

  useEffect(() => {
    const check = async (): Promise<void> => {
      const token = getTabletToken();
      if (!token) return;
      const res = await checkForUpdate("", token);
      // Wenn die User-Wahl "verschoben" denselben latest-Version-String
      // betrifft → versteckt halten. Bei einer neueren Version wird das
      // Dismiss zurueckgesetzt damit der Banner wieder erscheint.
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
    void check();
    const t = setInterval(check, 6 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  if (!info || !info.available) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 1400,
        maxWidth: 360,
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
        fontSize: 13,
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
              fontSize: 10,
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
        onClick={() => void triggerUpdateDownload(info.apkUrl)}
        style={{
          background: "rgba(255,255,255,0.18)",
          color: "#fff",
          border: 0,
          borderRadius: 8,
          padding: "6px 10px",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          minHeight: 0,
        }}
      >
        Update
      </button>
      {info.notes ? (
        <button
          type="button"
          aria-label={expanded ? "Release-Notes ausblenden" : "Release-Notes anzeigen"}
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
      {expanded && info.notes ? (
        <div
          style={{
            marginTop: 2,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(0,0,0,0.18)",
            color: "rgba(255,255,255,0.95)",
            fontSize: 11.5,
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
