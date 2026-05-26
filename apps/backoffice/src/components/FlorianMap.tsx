import L, { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Crosshair, Maximize2, Minimize2 } from "lucide-react";

export interface FahrzeugPos {
  fahrzeugId: string;
  funkrufname: string;
  abk: string;
  lat: number;
  lng: number;
  /** Status für die Farbcodierung */
  status: "im_einsatz" | "wartend" | "abgeschlossen";
  /** Florian Eberstalzell — fix am Feuerwehrhaus, nie stale. */
  isZentrale?: boolean;
  /** ISO-Zeitstempel des letzten Positions-Updates. */
  lastSeenAt?: string;
}

const STALE_AFTER_MIN = 10;

interface Props {
  einsatzort?: { lat: number; lng: number; label?: string };
  fahrzeuge: FahrzeugPos[];
  /** Standardzoom auf Einsatzort. */
  zoom?: number;
}

const HOME = { lat: 48.0884, lng: 13.9586 };

/**
 * Florianstation-Karte (Backoffice-Variante) — read-only Übersicht aller
 * aktuell ausgerückten Fahrzeuge mit Einsatzort. Anders als die Tablet-
 * MapCard hat sie keine eigene Position, keinen Routen-Button, kein
 * Hydranten-Toggle — nur Übersicht.
 */
export function FlorianMap({ einsatzort, fahrzeuge, zoom = 14 }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const einsatzMarkerRef = useRef<L.Marker | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Initialisieren
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const center = einsatzort ?? HOME;
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([center.lat, center.lng], zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Einsatzort-Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (einsatzMarkerRef.current) {
      einsatzMarkerRef.current.remove();
      einsatzMarkerRef.current = null;
    }
    if (einsatzort) {
      einsatzMarkerRef.current = L.marker([einsatzort.lat, einsatzort.lng], {
        icon: einsatzIcon(),
        title: einsatzort.label ?? "Einsatzort",
      }).addTo(map);
    }
  }, [einsatzort?.lat, einsatzort?.lng, einsatzort?.label]);

  // Periodischer Tick (60 s) damit "offline seit X min" mitwächst
  // auch wenn keine neuen Fahrzeug-Daten kommen.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Fahrzeug-Marker synchronisieren (inkl. Stale-Status)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const f of fahrzeuge) {
      seen.add(f.fahrzeugId);
      const staleMin = staleMinutes(f, tickNow);
      const ic = fahrzeugIcon(f, staleMin);
      const pos: LatLngExpression = [f.lat, f.lng];
      const existing = markersRef.current.get(f.fahrzeugId);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(ic);
      } else {
        const m = L.marker(pos, { icon: ic, title: f.funkrufname }).addTo(map);
        markersRef.current.set(f.fahrzeugId, m);
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
  }, [fahrzeuge, tickNow]);

  // Resize wenn Vollbild wechselt
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // ESC zum Schließen
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    const center = einsatzort ?? HOME;
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }

  const wrapperStyle = fullscreen
    ? ({
        position: "fixed" as const,
        inset: 0,
        zIndex: 2100,
        margin: 0,
        background: "var(--bg)",
        padding: 12,
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
      })
    : { position: "relative" as const };

  return (
    <div style={wrapperStyle}>
      {fullscreen ? (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "4px 8px",
          }}
        >
          <strong style={{ fontSize: 15 }}>Karte · Live-Positionen</strong>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="icon-btn" onClick={recenter} aria-label="Zentrieren">
              <Crosshair size={14} />
            </button>
            <button type="button" className="icon-btn" onClick={() => setFullscreen(false)} aria-label="Vollbild beenden">
              <Minimize2 size={14} />
            </button>
          </div>
        </header>
      ) : null}

      <div
        style={{
          position: "relative",
          flex: fullscreen ? 1 : undefined,
          height: fullscreen ? "auto" : 360,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
        }}
      >
        <div ref={elRef} style={{ width: "100%", height: "100%", background: "var(--surface-2)" }} />

        {!fullscreen ? (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 401,
              display: "flex",
              gap: 6,
            }}
          >
            <button
              type="button"
              className="icon-btn"
              onClick={recenter}
              aria-label="Auf Einsatzort zentrieren"
              title="Auf Einsatzort zentrieren"
            >
              <Crosshair size={14} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFullscreen(true)}
              aria-label="Vollbild"
              title="Vollbild"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        ) : null}

        <Legend />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        left: 8,
        zIndex: 401,
        padding: "6px 10px",
        borderRadius: 8,
        background: "color-mix(in srgb, var(--surface) 92%, transparent)",
        border: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--fg-2)",
        backdropFilter: "blur(6px)",
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <LegendDot color="var(--red)" label="Einsatzort" />
      <LegendDot color="var(--warn)" label="im Einsatz" />
      <LegendDot color="var(--ok)" label="abgeschlossen" />
      <LegendDot color="var(--fg-3)" label="wartend" />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

function einsatzIcon(): L.DivIcon {
  return L.divIcon({
    className: "fln-einsatz",
    html: `
      <svg viewBox="0 0 36 48" width="32" height="42" style="filter:drop-shadow(0 4px 10px rgba(200,16,46,0.45));">
        <path d="M18 0 C8 0 2 8 2 16 C2 28 18 48 18 48 C18 48 34 28 34 16 C34 8 28 0 18 0 Z" fill="#C8102E" stroke="#fff" stroke-width="2"/>
        <path d="M18 8 C13 12 13 17 16 19 C14 18 13.5 16 14.5 14 M18 8 C23 12 23 17 20 19 C22 18 22.5 16 21.5 14 M16 21 H20 V25 H16 Z" fill="#fff"/>
      </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 40],
  });
}

function staleMinutes(f: FahrzeugPos, now: number): number | null {
  if (f.isZentrale) return 0;
  if (!f.lastSeenAt) return null;
  const t = new Date(f.lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

function fahrzeugIcon(f: FahrzeugPos, staleMin: number | null): L.DivIcon {
  const isStale = staleMin !== null && staleMin > STALE_AFTER_MIN;
  const noPos = staleMin === null && !f.isZentrale;
  const color =
    f.status === "abgeschlossen"
      ? "#16A34A"
      : f.status === "im_einsatz"
        ? "#D97706"
        : "#94A3B8";
  const bg = color + "33";
  const opacity = isStale || noPos ? 0.45 : 1;
  const offlineLabel = isStale
    ? `<div style="margin-left:4px;margin-top:2px;padding:1px 6px;border-radius:99px;background:#fff;border:1px solid #cbd5e1;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:#64748b;letter-spacing:0.04em;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);">offline seit ${staleMin} min</div>`
    : noPos
      ? `<div style="margin-left:4px;margin-top:2px;padding:1px 6px;border-radius:99px;background:#fff;border:1px solid #cbd5e1;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:#64748b;letter-spacing:0.04em;white-space:nowrap;">keine Position</div>`
      : "";
  return L.divIcon({
    className: "fln-fzg",
    html: `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;opacity:${opacity};transition:opacity 200ms ease;">
        <div style="
          display:flex;
          align-items:center;
          gap:5px;
          padding:4px 10px 4px 6px;
          border-radius:99px;
          background:${bg};
          border:1.5px solid ${color};
          color:${color};
          font-family:'JetBrains Mono', monospace;
          font-size:10px;
          font-weight:700;
          letter-spacing:0.08em;
          text-transform:uppercase;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(15,23,42,0.18);
        ">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};"></span>
          ${f.abk}
        </div>
        ${offlineLabel}
      </div>`,
    iconSize: undefined as unknown as L.PointTuple,
    iconAnchor: [10, 10],
  });
}
