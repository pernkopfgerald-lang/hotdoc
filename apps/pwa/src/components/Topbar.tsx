import { MapPin, Moon, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";
import type { GeoState } from "../lib/geo";

interface Props {
  funkrufname?: string;
  einsatzNr?: string;
  geo?: GeoState;
}

/**
 * Apple-Style Sticky-Header mit Glass-Effekt, Flame-Logo + HotDoc-Marke,
 * Einsatznummer als Subtitle, GPS-Chip, Theme-Toggle, Uhr+Datum.
 */
export function Topbar({ funkrufname, einsatzNr, geo }: Props) {
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

  const dateLabel = formatDate(new Date());

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-4 border-b px-7 py-3.5 backdrop-blur-md"
      style={{
        background: "color-mix(in srgb, var(--bg) 78%, transparent)",
        borderColor: "var(--border)",
        backdropFilter: "blur(12px) saturate(140%)",
      }}
      data-component="topbar"
    >
      {/* App-Logo (Flame-Icon) */}
      <span
        aria-hidden
        className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px]"
        style={{ background: "#0F172A" }}
      >
        <svg viewBox="0 0 24 24" fill="none" width={26} height={26}>
          <path
            d="M12 2c.5 4 4 5.5 4 9.5 0 3.6-1.8 6.5-4 6.5s-4-2.9-4-6.5C8 9 9.5 8 12 2z"
            fill="#E63946"
          />
          <path
            d="M12 7c0 3 2 4 2 6.5s-1 3.5-2 3.5-2-1-2-3.5S12 10 12 7z"
            fill="#FFB703"
          />
          <circle cx="12" cy="20.5" r="1.8" fill="#FFB703" />
        </svg>
      </span>

      {/* Branding */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: "var(--red)",
              boxShadow: "0 0 0 4px rgba(200, 16, 46, 0.18)",
              animation: "pulse 1.4s ease-in-out infinite",
            }}
          />
          <span className="text-[18px] font-bold tracking-tight text-text-1">HotDoc</span>
        </div>
        <div
          className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-[0.06em] text-text-2"
        >
          Fahrzeugbericht{einsatzNr ? ` · Einsatz ${einsatzNr}` : ""}
          {funkrufname ? ` · ${funkrufname}` : ""}
        </div>
      </div>

      {/* GPS-Chip */}
      {geo ? <GeoChip geo={geo} /> : null}

      {/* Theme-Toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Modus wechseln"
        className="grid h-[38px] w-[38px] place-items-center rounded-[12px] border transition"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border)",
          color: theme === "dark" ? "var(--warn)" : "var(--fg-2)",
        }}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Zeitstempel */}
      <div className="flex flex-col items-end leading-none">
        <span className="font-mono text-[16px] font-semibold tabular-nums text-text-1">
          {clock}
        </span>
        <span className="mt-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-text-2">
          {dateLabel}
        </span>
      </div>
    </header>
  );
}

function GeoChip({ geo }: { geo: GeoState }) {
  const palette = paletteFor(geo.status);
  const Icon = geo.status === "denied" || geo.status === "unavail" ? WifiOff : MapPin;
  const label =
    geo.status === "live"
      ? `${(geo.fix?.accuracyM ?? 0).toFixed(0)} m`
      : geo.status === "stale"
        ? `${geo.ageSec}s alt`
        : geo.status === "loading"
          ? "GPS sucht"
          : geo.status === "denied"
            ? "blockiert"
            : "kein GPS";
  return (
    <span
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
      style={palette}
      title={geo.errorMessage ?? undefined}
    >
      <Icon size={11} />
      <span>{label}</span>
    </span>
  );
}

function paletteFor(status: GeoState["status"]): React.CSSProperties {
  switch (status) {
    case "live":
      return { color: "var(--ok)", background: "var(--ok-tint)", borderColor: "var(--emerald-border)" };
    case "stale":
      return { color: "var(--warn)", background: "var(--warn-tint)", borderColor: "var(--amber-border)" };
    case "denied":
    case "unavail":
      return { color: "var(--red)", background: "var(--red-tint)", borderColor: "var(--red-border)" };
    case "loading":
      return { color: "var(--info)", background: "var(--info-tint)", borderColor: "var(--blue-border)" };
  }
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} · ${days[d.getDay()]}`;
}
