import {
  ArrowLeftRight,
  HelpCircle,
  Info,
  MapPin,
  Moon,
  Smartphone,
  Sun,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
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
  /** Optional. Fahrzeug-Tablet: "Fahrzeug wechseln" im Mehr-Menue. */
  onSwitchVehicle?: () => void;
  /** Optional. Fahrzeug-Tablet: "An Handy uebergeben (QR)" im Mehr-Menue. */
  onHandoff?: () => void;
  /** HILFE-Knopf nur auf der Florianstation einblenden (User-Wunsch). */
  showHilfe?: boolean;
  /**
   * E-09 (Audit 2026-09): "Über HotDoc" im Mehr-Menue — oeffnet das
   * AboutModal des Aufrufers (dort sitzen Darstellung + Tablet-Reset).
   */
  onAbout?: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Handoff ist eine "Achtung"-Aktion — amber statt neutral. */
  tone?: "warn";
}

/**
 * Topbar — Logo, Titel, GPS-Chip, Hilfe (nur Zentrale), Sekundaer-Aktionen, Uhr.
 *
 * E-09 (Audit 2026-09) hatte die Sekundaer-Aktionen (Fahrzeug wechseln, An
 * Handy uebergeben, Hell/Dunkel, Über HotDoc) hinter einem "⋯ Mehr"-Button
 * versteckt, um den Handy-Overflow (Issue 11, Viewport ≤640px) zu vermeiden.
 * Review 2026-09-07: User-Feedback war eindeutig — das Verstecken haeufig
 * genutzter Befehle hinter einem zusaetzlichen Tap wog schwerer als das
 * geloeste Overflow-Problem, auch am schmalen Handy. Das "⋯ Mehr"-Popover
 * ist komplett weg, alle Sekundaer-Aktionen sind wieder direkte Icon-
 * Buttons (Stand vor E-09).
 */
export function Topbar({
  funkrufname,
  einsatzNr,
  geo,
  mode,
  onSwitchVehicle,
  onHandoff,
  showHilfe,
  onAbout,
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

  const items: MenuItem[] = [];
  if (onSwitchVehicle) {
    items.push({
      key: "switch",
      label: "Fahrzeug wechseln",
      icon: <ArrowLeftRight size={18} strokeWidth={2.2} />,
      onClick: onSwitchVehicle,
    });
  }
  if (onHandoff) {
    items.push({
      key: "handoff",
      label: "An Handy übergeben (QR)",
      icon: <Smartphone size={18} strokeWidth={2.2} />,
      onClick: onHandoff,
      tone: "warn",
    });
  }
  items.push({
    key: "theme",
    label: theme === "dark" ? "Hell / Dunkel: auf Hell wechseln" : "Hell / Dunkel: auf Dunkel wechseln",
    icon: theme === "dark" ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />,
    onClick: toggleTheme,
  });
  if (onAbout) {
    items.push({
      key: "about",
      label: "Über HotDoc",
      icon: <Info size={18} strokeWidth={2.2} />,
      onClick: onAbout,
    });
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

      {geo ? <GeoChip geo={geo} /> : null}

      {/* HILFE: Knopf-Button nur auf der Florianstation (User-Wunsch). Im
          Fahrzeug-Tablet sind die Tooltips inline an den Feldern, weil dort
          ohnehin weniger zu erklaeren ist. */}
      {showHilfe && (
        <button
          type="button"
          className="themetoggle"
          onClick={() => setHilfeOpen(true)}
          aria-label="Hilfe öffnen"
          title="Hilfe & häufige Fragen"
          style={{ color: "var(--info)", width: 44, height: 44, minHeight: 44 }}
        >
          <HelpCircle size={18} />
        </button>
      )}

      {/* Review 2026-09-07: das "⋯ Mehr"-Popover (E-09) ist wieder weg —
          User-Feedback: das Verstecken haeufig genutzter Befehle hinter
          zwei Taps war eine Verschlechterung, auch auf dem schmalen Handy.
          Alle Sekundaer-Aktionen jetzt wieder als direkte Icon-Buttons,
          exakt wie vor E-09. Der Handy-Overflow (Issue 11) ist in Kauf
          genommen — flexShrink/Umbruch federt die schlimmsten Faelle ab. */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className="themetoggle"
            onClick={it.onClick}
            aria-label={it.label}
            title={it.label}
            style={{
              width: 44,
              height: 44,
              minHeight: 44,
              color: it.tone === "warn" ? "var(--warn)" : undefined,
            }}
          >
            {it.icon}
          </button>
        ))}
      </div>

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
            : (geo.errorMessage ?? "Gerät hat kein GPS-Signal");
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
