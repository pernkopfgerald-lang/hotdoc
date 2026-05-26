import { MapPin, Moon, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";
import type { GeoState } from "../lib/geo";
import { BrandLogo } from "./BrandLogo";

interface Props {
  funkrufname?: string;
  einsatzNr?: string;
  geo?: GeoState;
}

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

  return (
    <header className="appheader">
      <BrandLogo variant="mark" size={44} />

      <div className="appbrand">
        <div className="appname">
          <span className="dot" />
          HotDoc
        </div>
        <div className="appsub">
          Fahrzeugbericht
          {einsatzNr ? ` · Einsatz ${einsatzNr}` : ""}
          {funkrufname ? ` · ${funkrufname}` : ""}
        </div>
      </div>

      {geo ? <GeoChip geo={geo} /> : null}

      <button className="themetoggle" onClick={toggleTheme} aria-label="Modus wechseln">
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="headerstamp">
        <div className="time">{clock}</div>
        <div className="meta">{formatDate(new Date())}</div>
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
      className="badge"
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
      return { color: "var(--ok)", background: "var(--ok-tint)" };
    case "stale":
      return { color: "var(--warn)", background: "var(--warn-tint)" };
    case "denied":
    case "unavail":
      return { color: "var(--red)", background: "var(--red-tint)" };
    case "loading":
      return { color: "var(--info)", background: "var(--info-tint)" };
  }
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} · ${days[d.getDay()]}`;
}
