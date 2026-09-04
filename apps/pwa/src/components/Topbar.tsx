import {
  ArrowLeftRight,
  HelpCircle,
  Info,
  MapPin,
  Moon,
  MoreHorizontal,
  Smartphone,
  Sun,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
 * Topbar — Logo, Titel, GPS-Chip, Hilfe (nur Zentrale), Mehr-Menue, Uhr.
 *
 * E-09 (Audit 2026-09): Die Sekundaer-Aktionen (Fahrzeug wechseln, An
 * Handy uebergeben, Hell/Dunkel, Über HotDoc) sassen vorher als vier
 * einzelne Buttons in der Leiste — auf dem Handy lief das in den Overflow
 * (Issue 11), auf dem Tablet war "Uebergeben" ein unbeschrifteter Icon-
 * Knopf. Jetzt: EIN "⋯ Mehr"-Button (44 px) mit Popover; Escape (auch
 * Android-Back → Escape, C-09) und Tipp ausserhalb schliessen es. Der
 * Hilfe-Knopf bleibt separat, weil er auf der Zentrale die Haupt-Anlaufstelle
 * fuer Fragen ist.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  // Mehr-Menue: Escape + Outside-Click schliessen. pointerdown statt click,
  // damit ein Tipp auf einen anderen Button das Menue schliesst, BEVOR dessen
  // Click feuert (sonst bleibt das Popover einen Frame laenger offen).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onPointer = (e: PointerEvent): void => {
      const el = menuRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeOverride(next);
    setTheme(next);
  }

  function runAndClose(fn: () => void): void {
    setMenuOpen(false);
    fn();
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

      {/* E-09: "⋯ Mehr"-Menue mit den Sekundaer-Aktionen */}
      <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          type="button"
          className="themetoggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Mehr"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Mehr: Fahrzeug wechseln · Übergeben · Hell/Dunkel · Über HotDoc"
          style={{
            width: 44,
            height: 44,
            minHeight: 44,
            ...(menuOpen
              ? { background: "var(--glass-2)", borderColor: "var(--glass-border-strong)", color: "var(--fg)" }
              : {}),
          }}
        >
          <MoreHorizontal size={20} strokeWidth={2.4} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Mehr"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              minWidth: 260,
              padding: 6,
              borderRadius: 12,
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 16px 40px -12px rgba(15, 23, 42, 0.45)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              zIndex: 10,
              animation: "glass-reveal 160ms var(--ease-decel) both",
            }}
          >
            {items.map((it) => (
              <button
                key={it.key}
                role="menuitem"
                type="button"
                onClick={() => runAndClose(it.onClick)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  minHeight: 44,
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: 0,
                  background: "transparent",
                  color: it.tone === "warn" ? "var(--warn)" : "var(--fg)",
                  fontFamily: "inherit",
                  fontSize: 16.5,
                  fontWeight: 600,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: it.tone === "warn" ? "var(--warn-tint)" : "var(--surface-2)",
                    flexShrink: 0,
                  }}
                >
                  {it.icon}
                </span>
                <span style={{ flex: 1 }}>{it.label}</span>
              </button>
            ))}
          </div>
        )}
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
