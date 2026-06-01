import { ArrowLeftRight, HelpCircle, MapPin, Moon, Smartphone, Sun, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";
import type { GeoState } from "../lib/geo";
import { BrandLogo } from "./BrandLogo";
import { HilfeSheet } from "./HilfeSheet";

interface Props {
  funkrufname?: string;
  einsatzNr?: string;
  geo?: GeoState;
  /** Optional. Wenn nicht gesetzt: aus funkrufname abgeleitet
   *  (enthaelt "Florian" → "Florian Eberstalzell", sonst "Fahrzeugbericht"). */
  mode?: "fahrzeug" | "zentrale";
  /** Optional. Fahrzeug-Tablet: zeigt Fahrzeug-wechseln-Button in der
   *  Mitte der Topbar. Frueher war der nur in der Fusszeile, was zu
   *  unsichtbar war. */
  onSwitchVehicle?: () => void;
  /** Optional. Fahrzeug-Tablet: zeigt Handoff-Button (Uebergeben an Handy)
   *  in der Mitte der Topbar. */
  onHandoff?: () => void;
  /** HILFE-Knopf nur auf der Florianstation einblenden (User-Wunsch). */
  showHilfe?: boolean;
}

export function Topbar({
  funkrufname,
  einsatzNr,
  geo,
  mode,
  onSwitchVehicle,
  onHandoff,
  showHilfe,
}: Props) {
  const [hilfeOpen, setHilfeOpen] = useState(false);
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
          {(() => {
            const resolvedMode =
              mode ??
              (funkrufname && /florian/i.test(funkrufname) ? "zentrale" : "fahrzeug");
            // Auf der Zentrale ist der Funkrufname identisch mit dem
            // Label "Florian Eberstalzell" — nicht doppelt anzeigen.
            if (resolvedMode === "zentrale") {
              return (
                <>
                  Florian Eberstalzell
                  {einsatzNr ? ` · Bericht-Nr ${einsatzNr}` : ""}
                </>
              );
            }
            return (
              <>
                Fahrzeugbericht
                {einsatzNr ? ` · Bericht-Nr ${einsatzNr}` : ""}
                {funkrufname ? ` · ${funkrufname}` : ""}
              </>
            );
          })()}
        </div>
      </div>

      {/* Fahrzeug-Tablet-Aktionen mittig in der Topbar — deutlich sichtbarer
          als die alten Footer-Links.
          U-11: Hierarchie reduziert. "Fahrzeug wechseln" ist Text-Button mit
          dezenter Optik (kein farbiges Tint mehr), "Uebergeben" als IconButton
          (nur Smartphone-Icon, 44x44 Touch-Target, Tooltip). */}
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
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 500,
                background: "transparent",
                color: "var(--fg-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                minHeight: 0,
              }}
              aria-label="Fahrzeug wechseln"
              title="Fahrzeug wechseln"
            >
              <ArrowLeftRight size={13} strokeWidth={2.2} />
              Fahrzeug wechseln
            </button>
          )}
          {onHandoff && (
            <button
              type="button"
              onClick={onHandoff}
              className="btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                background: "var(--warn-tint)",
                color: "var(--warn)",
                border: "1px solid var(--amber-border)",
                borderRadius: 10,
                minHeight: 0,
              }}
              aria-label="Sitzung an Handy uebergeben (QR-Code)"
              title="Sitzung an Handy uebergeben (QR-Code)"
            >
              <Smartphone size={18} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}

      {geo ? <GeoChip geo={geo} /> : null}

      {/* HILFE: Knopf-Button nur auf der Florianstation (User-Wunsch). Im
          Fahrzeug-Tablet sind die Tooltips inline an den Feldern, weil dort
          ohnehin weniger zu erklaeren ist. */}
      {showHilfe && (
        <button
          type="button"
          className="themetoggle"
          onClick={() => setHilfeOpen(true)}
          aria-label="Hilfe oeffnen"
          title="Hilfe &amp; haeufige Fragen"
          style={{ color: "var(--info)" }}
        >
          <HelpCircle size={18} />
        </button>
      )}

      <button className="themetoggle" onClick={toggleTheme} aria-label="Modus wechseln">
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="headerstamp">
        <div className="time">{clock}</div>
        <div className="meta">{formatDate(new Date())}</div>
      </div>

      <HilfeSheet open={hilfeOpen} onClose={() => setHilfeOpen(false)} />
    </header>
  );
}

function GeoChip({ geo }: { geo: GeoState }) {
  const variant = variantFor(geo.status);
  const Icon = geo.status === "denied" || geo.status === "unavail" ? WifiOff : MapPin;
  // D-11: Nutzersprachliche Labels — Funktionaere wollen auf einen Blick
  // wissen ob das GPS taugt, nicht die Praezision in Metern lesen. Die
  // Details (Genauigkeit, Alter, Block-Hinweis) wandern in den Tooltip.
  const label =
    geo.status === "live"
      ? "GPS gut"
      : geo.status === "stale"
        ? "GPS schwach"
        : geo.status === "loading"
          ? "GPS sucht"
          : geo.status === "denied"
            ? "GPS aus"
            : "GPS aus";
  const detailTitle =
    geo.status === "live"
      ? `Genauigkeit ~${(geo.fix?.accuracyM ?? 0).toFixed(0)} m`
      : geo.status === "stale"
        ? `Letzte Position vor ${geo.ageSec}s — Signal schwach`
        : geo.status === "loading"
          ? "GPS-Fix wird gesucht …"
          : geo.status === "denied"
            ? (geo.errorMessage ?? "Standortzugriff im Browser blockiert")
            : (geo.errorMessage ?? "Geraet hat kein GPS-Signal");
  return (
    <span className={`status-pill ${variant}`} title={detailTitle}>
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
