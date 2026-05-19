import { MapPin, Moon, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";
import type { GeoState } from "../lib/geo";

interface Props {
  funkrufname?: string;
  geo?: GeoState;
}

export function Topbar({ funkrufname, geo }: Props) {
  const [theme, setTheme] = useState<Theme>(effectiveTheme());
  const [clock, setClock] = useState<string>(formatClock(new Date()));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeOverride(next);
    setTheme(next);
  }

  return (
    <header
      className="sticky top-0 z-20 border-b border-border-strong bg-bg-page/95 backdrop-blur-md"
      data-component="topbar"
    >
      {/* Hazard-Tape · 4px schmale Streifen oben, animiert nach links unten */}
      <div
        aria-hidden
        className="h-1 w-full"
        style={{
          background: "var(--hazard-thin)",
          animation: "hazard-shift 8s linear infinite",
        }}
      />

      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* FF-Schild mit rotem Glow statt blassem Outline */}
          <span
            className="grid h-9 w-9 place-items-center rounded-md border text-white"
            style={{
              background: "linear-gradient(135deg, var(--red) 0%, var(--red-strong) 100%)",
              borderColor: "color-mix(in srgb, var(--red-strong) 70%, #000)",
              boxShadow: "0 0 16px -2px var(--red-glow), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
            aria-hidden
          >
            <svg viewBox="0 0 32 32" width="22" height="22">
              <path
                d="M16 4 C9 8 9 16 13 19 C9 17.5 7.5 13.5 9.5 9 M16 4 C23 8 23 16 19 19 C23 17.5 24.5 13.5 22.5 9 M12 22 H20 V27 H12 Z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-condensed text-[19px] font-bold leading-none tracking-tight">
              <span style={{ color: "var(--red)" }}>Hot</span>
              <span className="text-text-1">Doc</span>
            </span>
            <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-text-2">
              {funkrufname ?? "FF Eberstalzell"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {geo ? <GeoChip geo={geo} /> : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Theme umschalten"
            className="grid h-9 w-9 place-items-center rounded-full border border-border-strong bg-surface-2 text-text-2 transition hover:border-amber hover:text-amber"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="font-mono text-[15px] font-medium tabular-nums tracking-wider text-text-1">
            {clock}
          </span>
        </div>
      </div>
    </header>
  );
}

/**
 * GPS-Status als kleines Pill rechts in der Topbar.
 * Farbe codiert den Zustand: live=emerald, stale=amber, denied/unavail=red.
 */
function GeoChip({ geo }: { geo: GeoState }) {
  const tone = toneFor(geo.status);
  const Icon = geo.status === "denied" || geo.status === "unavail" ? WifiOff : MapPin;
  const label =
    geo.status === "live"
      ? `${(geo.fix?.accuracyM ?? 0).toFixed(0)} m`
      : geo.status === "stale"
        ? `${geo.ageSec}s alt`
        : geo.status === "loading"
          ? "sucht …"
          : geo.status === "denied"
            ? "blockiert"
            : "kein GPS";
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        borderColor: `var(--${tone}-border)`,
        background: `var(--${tone}-bg)`,
        color: `var(--${tone})`,
        boxShadow: geo.status === "live" ? `0 0 0 0 transparent` : undefined,
      }}
      title={geo.errorMessage ?? undefined}
    >
      <Icon size={11} />
      <span>{label}</span>
      {geo.status === "live" ? (
        <span
          className="h-1 w-1 rounded-full"
          style={{
            background: "var(--emerald)",
            boxShadow: "0 0 6px var(--emerald-glow)",
            animation: "pulse 1.6s ease-in-out infinite",
          }}
        />
      ) : null}
    </span>
  );
}

function toneFor(status: GeoState["status"]): "emerald" | "amber" | "red" | "blue" {
  switch (status) {
    case "live":    return "emerald";
    case "stale":   return "amber";
    case "denied":  return "red";
    case "unavail": return "red";
    case "loading": return "blue";
  }
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
