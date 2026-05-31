import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Crosshair,
  ExternalLink,
  Maximize,
  Maximize2,
  Minimize2,
  ScanSearch,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { FLORIAN_POSITION } from "@hotdoc/shared";

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

/**
 * Optionale Mannschafts-Daten je Fahrzeug — wenn vom Parent gegeben,
 * zeigt das Detail-Panel beim Klick auf ein Fahrzeug Fahrer + Kdt +
 * Besatzung an. Quelle: Fahrzeugberichte aus dem laufenden Einsatz.
 */
export interface FahrzeugMannschaft {
  fahrzeugId: string;
  fahrer?: string;
  kdt?: string;
  mannschaft: string[];
}

const STALE_AFTER_MIN = 10;
const HOME = FLORIAN_POSITION;

interface Props {
  einsatzort?: { lat: number; lng: number; label?: string };
  fahrzeuge: FahrzeugPos[];
  /** Standardzoom auf Einsatzort. */
  zoom?: number;
  /**
   * Wenn von außen gesteuert (z. B. durch Klick auf Status-Card):
   *  - Marker pulsiert
   *  - Detail-Panel öffnet sich
   *  - Karte fliegt auf die Position
   * Wenn nicht gegeben: interne State (Marker-Klick toggelt selbst).
   */
  selectedFahrzeugId?: string | null;
  onSelectFahrzeug?: (id: string | null) => void;
  /** Mannschaft-Daten je Fahrzeug (optional, blendet Block im Detail ein). */
  mannschaftByFahrzeug?: Record<string, FahrzeugMannschaft>;
  /** Pop-Out-Button anzeigen (im 2-Bildschirm-Setup nützlich). */
  enablePopOut?: boolean;
  /** Default-Höhe in px (320 alt, 500 neu). */
  defaultHeight?: number;
  /**
   * Render-Modus für Pop-Out-Fenster: kein Wrapper-Border,
   * voll-fenstergroße Map. Wird von FlorianMapPopout gesetzt.
   */
  variant?: "inline" | "popout";
}

/**
 * Florianstation-Karte (PWA-Variante, identisch zur Backoffice-Karte) —
 * read-only Übersicht aller aktuell ausgerückten Fahrzeuge mit Einsatzort.
 *
 * Drei Zoom-Modi:
 *  - "Gesamt": fitBounds([Einsatzort, alle Fahrzeuge]) — Überblick
 *  - "Lagebild": center+zoom 18 auf Einsatzort (~200 m Sichtfeld)
 *  - Vollbild: fixed inset 0 für Lageeinweisung am Bildschirm
 *
 * Plus Pop-Out: window.open('/florian-map') für Zweit-Bildschirm.
 * In Capacitor (APK) ist der Pop-Out-Button deaktiviert (kein Multi-Window).
 */
export function FlorianMap({
  einsatzort,
  fahrzeuge,
  zoom = 14,
  selectedFahrzeugId: controlledSelectedId,
  onSelectFahrzeug,
  mannschaftByFahrzeug,
  enablePopOut = false,
  defaultHeight = 500,
  variant = "inline",
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const einsatzMarkerRef = useRef<L.Marker | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  // Controlled-via-Parent ODER intern — beide Pfade funktionieren.
  const selectedId = controlledSelectedId ?? internalSelectedId;
  const setSelectedId = (next: string | null): void => {
    if (onSelectFahrzeug) onSelectFahrzeug(next);
    else setInternalSelectedId(next);
  };

  const isNative = Capacitor.isNativePlatform();

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

  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const f of fahrzeuge) {
      seen.add(f.fahrzeugId);
      const staleMin = staleMinutes(f, tickNow);
      const isSelected = selectedId === f.fahrzeugId;
      const ic = fahrzeugIcon(f, staleMin, isSelected);
      const pos: LatLngExpression = [f.lat, f.lng];
      const existing = markersRef.current.get(f.fahrzeugId);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(ic);
      } else {
        const m = L.marker(pos, { icon: ic, title: f.funkrufname }).addTo(map);
        m.on("click", () => {
          const next = selectedId === f.fahrzeugId ? null : f.fahrzeugId;
          setSelectedId(next);
          if (next) map.flyTo(pos, Math.max(map.getZoom(), 16), { duration: 0.5 });
        });
        markersRef.current.set(f.fahrzeugId, m);
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fahrzeuge, tickNow, selectedId]);

  // Wenn selectedId von außen geändert wird → automatisch hinfliegen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const f = fahrzeuge.find((x) => x.fahrzeugId === selectedId);
    if (!f) return;
    map.flyTo([f.lat, f.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [selectedId, fahrzeuge]);

  // Klick auf leere Karte → Auswahl schliessen
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMapClick = (): void => setSelectedId(null);
    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFzg = selectedId
    ? fahrzeuge.find((f) => f.fahrzeugId === selectedId) ?? null
    : null;
  const selectedMannschaft = selectedId
    ? mannschaftByFahrzeug?.[selectedId] ?? null
    : null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => clearTimeout(t);
  }, [fullscreen]);

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

  /**
   * "Gesamt": fitBounds([Einsatzort, alle Fahrzeuge]) — gibt einen
   * Überblick wo alles ist + die Flugstrecken automatisch im Frame.
   */
  function zoomGesamt() {
    const map = mapRef.current;
    if (!map) return;
    const points: LatLngExpression[] = [];
    if (einsatzort) points.push([einsatzort.lat, einsatzort.lng]);
    for (const f of fahrzeuge) points.push([f.lat, f.lng]);
    if (points.length === 0) {
      map.setView([HOME.lat, HOME.lng], 12, { animate: true });
      return;
    }
    if (points.length === 1) {
      map.flyTo(points[0] as L.LatLngTuple, 15, { duration: 0.6 });
      return;
    }
    const bounds: LatLngBoundsExpression = L.latLngBounds(
      points.map((p) => p as L.LatLngTuple),
    );
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6, maxZoom: 17 });
  }

  /**
   * "Lagebild": center+zoom 18 auf den Einsatzort (≈ 200 m Radius
   * Sichtfeld bei 256-px-Tiles). Wenn kein Einsatzort: auf FF-Haus.
   */
  function zoomLagebild() {
    const map = mapRef.current;
    if (!map) return;
    const c = einsatzort ?? HOME;
    map.flyTo([c.lat, c.lng], 18, { duration: 0.6 });
  }

  function openPopOut() {
    // Eigenstaendige Route — laedt FlorianMap im variant="popout"-Modus
    // mit eigenem Polling. Größe 1400x900 passt auf einen Zweit-Bildschirm.
    const url = new URL("/florian-map", window.location.origin);
    window.open(
      url.toString(),
      "hotdoc-florian-map",
      "width=1400,height=900,resizable=yes,scrollbars=no",
    );
  }

  const wrapperStyle =
    variant === "popout"
      ? ({
          position: "relative" as const,
          height: "100vh",
          display: "flex",
          flexDirection: "column" as const,
        })
      : fullscreen
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
            <ZoomButtons
              onGesamt={zoomGesamt}
              onLagebild={zoomLagebild}
              onRecenter={recenter}
            />
            <button type="button" className="icon-btn" onClick={() => setFullscreen(false)} aria-label="Vollbild beenden">
              <Minimize2 size={14} />
            </button>
          </div>
        </header>
      ) : null}

      <div
        style={{
          position: "relative",
          flex: fullscreen || variant === "popout" ? 1 : undefined,
          height:
            variant === "popout"
              ? "auto"
              : fullscreen
                ? "auto"
                : defaultHeight,
          borderRadius: variant === "popout" ? 0 : 14,
          overflow: "hidden",
          border:
            variant === "popout"
              ? "none"
              : "1px solid var(--border-strong)",
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
              flexWrap: "wrap",
              justifyContent: "flex-end",
              maxWidth: "calc(100% - 16px)",
            }}
          >
            <ZoomButtons
              onGesamt={zoomGesamt}
              onLagebild={zoomLagebild}
              onRecenter={recenter}
            />
            {enablePopOut && !isNative && variant === "inline" ? (
              <button
                type="button"
                className="icon-btn"
                onClick={openPopOut}
                aria-label="In neuem Fenster öffnen (2-Bildschirm-Setup)"
                title="In neuem Fenster öffnen (2-Bildschirm-Setup)"
              >
                <ExternalLink size={14} />
              </button>
            ) : null}
            {variant === "inline" ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setFullscreen(true)}
                aria-label="Vollbild"
                title="Vollbild"
              >
                <Maximize2 size={14} />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Detail-Panel: erweitert um Fahrer/Kdt/Mannschaft wenn vorhanden. */}
        {selectedFzg ? (
          <div
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 410,
              minWidth: 250,
              maxWidth: 320,
              padding: "12px 14px",
              borderRadius: 14,
              background: "color-mix(in srgb, var(--surface) 94%, transparent)",
              border: "1px solid var(--border-strong)",
              backdropFilter: "blur(10px) saturate(150%)",
              WebkitBackdropFilter: "blur(10px) saturate(150%)",
              boxShadow: "0 12px 28px -8px rgba(15,23,42,0.32)",
              animation: "glass-reveal 180ms var(--ease-decel) both",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 44,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 14 }}>{selectedFzg.funkrufname}</strong>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Schließen"
                style={{
                  appearance: "none",
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  color: "var(--fg-3)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 14,
                  fontWeight: 700,
                  minHeight: 0,
                  padding: "2px 6px",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--fg-3)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span>
                Status:{" "}
                <strong style={{ color: "var(--fg-2)" }}>
                  {selectedFzg.isZentrale
                    ? "Zentrale"
                    : selectedFzg.status === "im_einsatz"
                      ? "Im Einsatz"
                      : selectedFzg.status === "abgeschlossen"
                        ? "Abgeschlossen"
                        : "Wartend"}
                </strong>
              </span>
              <span>
                Position:{" "}
                <strong style={{ color: "var(--fg-2)" }}>
                  {selectedFzg.lat.toFixed(5)}, {selectedFzg.lng.toFixed(5)}
                </strong>
              </span>
              {selectedFzg.lastSeenAt ? (
                <span>
                  Last seen:{" "}
                  <strong style={{ color: "var(--fg-2)" }}>
                    {formatRelative(selectedFzg.lastSeenAt, tickNow)}
                  </strong>
                </span>
              ) : null}
            </div>
            {selectedMannschaft &&
            (selectedMannschaft.fahrer ||
              selectedMannschaft.kdt ||
              selectedMannschaft.mannschaft.length > 0) ? (
              <div
                style={{
                  marginTop: 4,
                  paddingTop: 8,
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  fontSize: 12,
                }}
              >
                {selectedMannschaft.fahrer ? (
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--fg-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Fahrer:
                    </span>{" "}
                    <strong>{selectedMannschaft.fahrer}</strong>
                  </div>
                ) : null}
                {selectedMannschaft.kdt ? (
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--fg-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Kdt:
                    </span>{" "}
                    <strong>{selectedMannschaft.kdt}</strong>
                  </div>
                ) : null}
                {selectedMannschaft.mannschaft.length > 0 ? (
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--fg-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Mannschaft:
                    </span>
                    <ul style={{ margin: "4px 0 0 0", paddingLeft: 14 }}>
                      {selectedMannschaft.mannschaft.map((name, i) => (
                        <li key={i} style={{ fontWeight: 500 }}>
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Legend />
      </div>
    </div>
  );
}

/**
 * Drei-Tasten-Gruppe für die Zoom-Modi: Lagebild (Detail), Gesamt
 * (alles im Frame), Recenter (zurück auf Standard).
 */
function ZoomButtons({
  onGesamt,
  onLagebild,
  onRecenter,
}: {
  onGesamt: () => void;
  onLagebild: () => void;
  onRecenter: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={onLagebild}
        aria-label="Lagebild (Detailansicht ~200 m um Einsatzort)"
        title="Lagebild · ~200 m um Einsatzort"
      >
        <ScanSearch size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onGesamt}
        aria-label="Gesamtansicht (alle Fahrzeuge + Einsatzort)"
        title="Gesamt · alle Fahrzeuge + Einsatzort"
      >
        <Maximize size={14} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={onRecenter}
        aria-label="Auf Einsatzort zentrieren"
        title="Zentrieren"
      >
        <Crosshair size={14} />
      </button>
    </>
  );
}

function formatRelative(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min === 0) return "gerade eben";
  if (min < 60) return `vor ${min} min`;
  const h = Math.floor(min / 60);
  return `vor ${h} h`;
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

function fahrzeugIcon(
  f: FahrzeugPos,
  staleMin: number | null,
  isSelected = false,
): L.DivIcon {
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
  // Pulse-Ring fuer ausgewaehltes Fahrzeug — visualisiert was geklickt wurde
  // und welches Detail-Panel zur Karte gehoert.
  const selectedRing = isSelected
    ? `<div style="position:absolute;left:-4px;top:-4px;width:calc(100% + 8px);height:calc(100% + 8px);border-radius:99px;border:2px solid ${color};animation:fln-pulse-ring 1.4s ease-out infinite;pointer-events:none;"></div>`
    : "";
  const offlineLabel = isStale
    ? `<div style="margin-left:4px;margin-top:2px;padding:1px 6px;border-radius:99px;background:#fff;border:1px solid #cbd5e1;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:#64748b;letter-spacing:0.04em;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.15);">offline seit ${staleMin} min</div>`
    : noPos
      ? `<div style="margin-left:4px;margin-top:2px;padding:1px 6px;border-radius:99px;background:#fff;border:1px solid #cbd5e1;font-family:'JetBrains Mono',monospace;font-size:9px;font-weight:600;color:#64748b;letter-spacing:0.04em;white-space:nowrap;">keine Position</div>`
      : "";
  const selectedShadow = isSelected ? `box-shadow:0 0 0 3px ${color}55, 0 2px 8px rgba(15,23,42,0.22);` : "box-shadow:0 2px 8px rgba(15,23,42,0.18);";
  return L.divIcon({
    className: "fln-fzg",
    html: `
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;opacity:${opacity};transition:opacity 200ms ease;">
        <div style="position:relative;display:flex;align-items:center;gap:5px;padding:4px 10px 4px 6px;border-radius:99px;background:${bg};border:1.5px solid ${color};color:${color};font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;white-space:nowrap;${selectedShadow}">
          ${selectedRing}
          <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
          <span>${f.abk}</span>
        </div>
        ${offlineLabel}
      </div>`,
    iconSize: undefined as unknown as L.PointTuple,
    iconAnchor: [10, 10],
  });
}
