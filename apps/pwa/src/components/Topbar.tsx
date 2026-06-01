import { ArrowLeftRight, MapPin, Moon, Smartphone, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";
import type { GeoState } from "../lib/geo";
import { BrandLogo } from "./BrandLogo";

interface Props {
  funkrufname?: string;
  einsatzNr?: string;
  geo?: GeoState;
  /** Optional. Wenn nicht gesetzt: aus funkrufname abgeleitet
   *  (enthaelt "Florian" → "Einsatzzentrale", sonst "Fahrzeugbericht"). */
  mode?: "fahrzeug" | "zentrale";
  /** Optional. Fahrzeug-Tablet: zeigt Fahrzeug-wechseln-Button in der
   *  Mitte der Topbar. Frueher war der nur in der Fusszeile, was zu
   *  unsichtbar war. */
  onSwitchVehicle?: () => void;
  /** Optional. Fahrzeug-Tablet: zeigt Handoff-Button (Uebergeben an Handy)
   *  in der Mitte der Topbar. */
  onHandoff?: () => void;
}

export function Topbar({
  funkrufname,
  einsatzNr,
  geo,
  mode,
  onSwitchVehicle,
  onHandoff,
}: Props) {
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
          {(mode ?? (funkrufname && /florian/i.test(funkrufname)
            ? "zentrale"
            : "fahrzeug")) === "zentrale"
            ? "Einsatzzentrale"
            : "Fahrzeugbericht"}
          {einsatzNr ? ` · Einsatz ${einsatzNr}` : ""}
          {funkrufname ? ` · ${funkrufname}` : ""}
        </div>
      </div>

      {/* Fahrzeug-Tablet-Aktionen mittig in der Topbar — deutlich sichtbarer
          als die alten Footer-Links. */}
      {(onSwitchVehicle || onHandoff) && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginLeft: "auto",
            marginRight: 8,
          }}
        >
          {onSwitchVehicle && (
            <button
              type="button"
              onClick={onSwitchVehicle}
              className="btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--info-tint)",
                color: "var(--info)",
                border: "1px solid var(--blue-border)",
                borderRadius: 10,
                minHeight: 0,
              }}
              aria-label="Fahrzeug wechseln"
              title="Fahrzeug wechseln"
            >
              <ArrowLeftRight size={14} strokeWidth={2.4} />
              Fahrzeug wechseln
            </button>
          )}
          {onHandoff && (
            <button
              type="button"
              onClick={onHandoff}
              className="btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                background: "var(--warn-tint)",
                color: "var(--warn)",
                border: "1px solid var(--amber-border)",
                borderRadius: 10,
                minHeight: 0,
              }}
              aria-label="An Handy übergeben (QR-Code)"
              title="Sitzung an Handy übergeben (QR-Code)"
            >
              <Smartphone size={14} strokeWidth={2.4} />
              Übergeben
            </button>
          )}
        </div>
      )}

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
  const variant = variantFor(geo.status);
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
      className={`status-pill ${variant}`}
      title={geo.errorMessage ?? undefined}
    >
      <span className="dot" />
      <Icon size={11} strokeWidth={2.4} />
      <span>{label}</span>
    </span>
  );
}

function variantFor(status: GeoState["status"]): string {
  switch (status) {
    case "live":   return "ok";
    case "stale":  return "warn";
    case "denied":
    case "unavail": return "danger";
    case "loading": return "";
  }
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDate(d: Date): string {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()} · ${days[d.getDay()]}`;
}
