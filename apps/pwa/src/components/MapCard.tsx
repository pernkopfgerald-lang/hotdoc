import L, { type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Crosshair,
  Droplets,
  ExternalLink,
  Layers,
  Maximize,
  Maximize2,
  Minimize2,
  Navigation,
  ScanSearch,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAP_TILES, haversineKm, type MapTileChoice } from "@hotdoc/shared";

// Issue 25 (Einsatz-Test 2026-06-02): Geteilter localStorage-Key zwischen
// FlorianMap und MapCard, damit der Funktionaer einmal auswaehlt und auf
// allen Karten konsistent angezeigt wird.
const TILE_CHOICE_KEY = "hotdoc.maptile.choice";

function loadTileChoice(): MapTileChoice {
  try {
    const raw = localStorage.getItem(TILE_CHOICE_KEY);
    if (raw === "karte" || raw === "foto" || raw === "hybrid") return raw;
  } catch {
    // localStorage unavailable
  }
  // User-Default (Test 2026-06-03): HYBRID — Foto + Beschriftungs-Overlay.
  // Vorher "karte" (reine Karte ohne Foto) → User wollte Foto-Sicht standardmäßig.
  return "hybrid";
}

function saveTileChoice(choice: MapTileChoice): void {
  try {
    localStorage.setItem(TILE_CHOICE_KEY, choice);
  } catch {
    // localStorage unavailable
  }
}

function applyMapCardTileLayer(
  map: L.Map,
  choice: MapTileChoice,
  layersRef: { base: L.TileLayer | null; overlay: L.TileLayer | null },
): void {
  if (layersRef.base) {
    layersRef.base.remove();
    layersRef.base = null;
  }
  if (layersRef.overlay) {
    layersRef.overlay.remove();
    layersRef.overlay = null;
  }
  if (choice === "hybrid") {
    const cfg = MAP_TILES.hybrid;
    const fotoCfg = MAP_TILES.foto;
    layersRef.base = L.tileLayer(fotoCfg.url, {
      subdomains: fotoCfg.subdomains as unknown as string[],
      maxZoom: cfg.maxZoom,
      attribution: cfg.attribution,
    }).addTo(map);
    layersRef.overlay = L.tileLayer(cfg.overlayUrl, {
      subdomains: cfg.subdomains as unknown as string[],
      maxZoom: cfg.maxZoom,
      attribution: cfg.attribution,
    }).addTo(map);
  } else {
    const cfg = MAP_TILES[choice];
    layersRef.base = L.tileLayer(cfg.url, {
      subdomains: cfg.subdomains as unknown as string[],
      maxZoom: cfg.maxZoom,
      attribution: cfg.attribution,
    }).addTo(map);
  }
}

export interface MapPosition {
  fahrzeugId: string;
  funkrufname: string;
  abk: string;
  lat: number;
  lng: number;
  isSelf?: boolean;
  /** Florian Eberstalzell — fix am Feuerwehrhaus, nie stale. */
  isZentrale?: boolean;
  /** ISO-Zeitstempel des letzten Positions-Updates. Wenn fehlt
   *  oder älter als STALE_AFTER_MIN, gilt das Fahrzeug als offline. */
  lastSeenAt?: string;
}

/** Fahrzeug gilt als "offline" wenn Position älter als 10 Minuten. */
const STALE_AFTER_MIN = 10;

export interface Hydrant {
  id: string;
  typ: "H" | "S" | "T";
  lat: number;
  lng: number;
}

export interface RouteData {
  path: Array<{ lat: number; lng: number }>;
  distanceM: number;
  timeMs: number;
  instructions: Array<{
    text: string;
    distanceM: number;
    timeMs: number;
    sign: number;
  }>;
}

interface Props {
  selfPos: { lat: number; lng: number };
  einsatzPos: { lat: number; lng: number };
  einsatzAdresse: string;
  fleet: MapPosition[];
  hydranten: Hydrant[];
  /** Wenn false (Default), wird der Löschwasser-Toggle nicht gerendert */
  showLoeschwasser?: boolean;
  /** Echte GraphHopper-Route von selfPos zu einsatzPos. Wenn vorhanden →
   *  Polyline folgt der Route + Turn-by-Turn-Liste wird gerendert.
   *  Wenn nicht (z. B. Routing noch nicht da), faellt auf Luftlinie zurueck. */
  route?: RouteData;
}

const SELF_ZOOM = 17;

export function MapCard({
  selfPos,
  einsatzPos,
  einsatzAdresse,
  fleet,
  hydranten,
  showLoeschwasser = false,
  route,
}: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const hydrantLayerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const autoFollowRef = useRef(true);
  // S-1 (Audit KISS): letzte Position, auf die auto-gefolgt wurde. Verhindert,
  // dass die 1,2-s-Pan-Animation bei jedem 3-s-Fleet-Tick neu feuert, obwohl
  // sich die eigene Position kaum bewegt hat (GPU-/Akku-Churn auf dem Tablet).
  const lastFollowRef = useRef<{ lat: number; lng: number } | null>(null);
  // Issue 25 (Einsatz-Test 2026-06-02): Tile-Layer-Refs + User-Choice.
  const tileLayersRef = useRef<{
    base: L.TileLayer | null;
    overlay: L.TileLayer | null;
  }>({ base: null, overlay: null });
  const [tileChoice, setTileChoice] = useState<MapTileChoice>(loadTileChoice);
  const [waterOn, setWaterOn] = useState(true);
  const [distance, setDistance] = useState<number>(0);
  const [fullscreen, setFullscreen] = useState(false);

  // — Map einmalig initialisieren —
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([selfPos.lat, selfPos.lng], SELF_ZOOM);

    // Issue 25 (Einsatz-Test 2026-06-02): basemap.at-Tiles statt OSM —
    // bessere Aufloesung in Oesterreich, Foto-Layer fuer Lageeinschaetzung.
    applyMapCardTileLayer(map, tileChoice, tileLayersRef.current);

    // Einsatzort
    L.marker([einsatzPos.lat, einsatzPos.lng], {
      icon: einsatzIcon(),
      title: "Einsatzort",
    }).addTo(map);

    // Route
    routeRef.current = L.polyline(
      [
        [selfPos.lat, selfPos.lng],
        [einsatzPos.lat, einsatzPos.lng],
      ],
      { color: "#dc2626", weight: 4, opacity: 0.7, dashArray: "10 8", lineCap: "round" },
    ).addTo(map);

    // Hydrant-Layer
    hydrantLayerRef.current = L.layerGroup().addTo(map);

    map.on("dragstart", () => {
      autoFollowRef.current = false;
    });

    mapRef.current = map;

    // #156 (Test 2026-06-03): Leaflet rendert die Kacheln vor der finalen
    // Container-Größe → "halbe Karte"-Bug. ResizeObserver triggert ein
    // invalidateSize, sobald sich die Container-Box ändert (Erstanzeige,
    // Sektionswechsel, Fullscreen-Toggle). Mehrfaches Feuern ist safe.
    // #156 (v0.1.13): ResizeObserver ENTPRELLT — invalidateSize erst wenn die
    // Container-Größe settlet, NICHT während der Einblend-Animation
    // (sonst versetzte Kachel-Blöcke). Plus ein Settle-Tick nach der Animation.
    let ro: ResizeObserver | null = null;
    let debTimer: ReturnType<typeof setTimeout> | null = null;
    const doInvalidate = (): void => {
      try {
        map.invalidateSize();
        // #156 (v0.1.15): redraw() erzwingt vollständiges Kachel-Neuladen für
        // die aktuelle Größe — invalidateSize alleine pannt nur (versetzte Blöcke).
        tileLayersRef.current.base?.redraw();
        tileLayersRef.current.overlay?.redraw();
      } catch {
        // unmounted — egal
      }
    };
    const invalidateDebounced = (): void => {
      if (debTimer) clearTimeout(debTimer);
      debTimer = setTimeout(doInvalidate, 250);
    };
    if (typeof ResizeObserver !== "undefined" && elRef.current) {
      ro = new ResizeObserver(invalidateDebounced);
      ro.observe(elRef.current);
    }
    const tSettle = setTimeout(doInvalidate, 550);

    return () => {
      clearTimeout(tSettle);
      if (debTimer) clearTimeout(debTimer);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayersRef.current = { base: null, overlay: null };
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Issue 25 (Einsatz-Test 2026-06-02): Layer austauschen bei User-Switch.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyMapCardTileLayer(map, tileChoice, tileLayersRef.current);
    // Auto-Follow neu aktivieren — der User wollte explizit umschalten,
    // also Karte wieder am eigenen Fahrzeug ausrichten.
    autoFollowRef.current = true;
  }, [tileChoice]);

  // Periodischer Tick (60 s) damit Stale-Anzeigen rerender und
  // "offline seit 11 min" auf "12 min" wechselt ohne neue fleet-Daten.
  const [tickNow, setTickNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTickNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // — Marker für Fahrzeuge synchronisieren (inkl. Stale-Status) —
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const f of fleet) {
      seen.add(f.fahrzeugId);
      const staleMin = staleMinutes(f, tickNow);
      const icon = fzgIcon(f, staleMin);
      const pos: LatLngExpression = [f.lat, f.lng];
      const existing = markersRef.current.get(f.fahrzeugId);
      if (existing) {
        existing.setLatLng(pos);
        existing.setIcon(icon);
      } else {
        const m = L.marker(pos, {
          icon,
          title: f.funkrufname,
          zIndexOffset: f.isSelf ? 1000 : 100,
        }).addTo(map);
        markersRef.current.set(f.fahrzeugId, m);
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    // Route updaten — bei echter GraphHopper-Route die Polyline der Strasse
    // folgen lassen + durchgehend statt gestrichelt. Sonst Luftlinie.
    if (routeRef.current) {
      if (route && route.path.length > 1) {
        routeRef.current.setLatLngs(route.path.map((p) => [p.lat, p.lng]));
        routeRef.current.setStyle({
          color: "#2563eb",
          weight: 5,
          opacity: 0.85,
          dashArray: undefined,
        });
      } else {
        routeRef.current.setLatLngs([
          [selfPos.lat, selfPos.lng],
          [einsatzPos.lat, einsatzPos.lng],
        ]);
        routeRef.current.setStyle({
          color: "#dc2626",
          weight: 4,
          opacity: 0.7,
          dashArray: "10 8",
        });
      }
    }
    // Auto-Follow auf Self — aber nur neu pannen, wenn sich die eigene
    // Position seit dem letzten Follow spürbar (> 15 m) bewegt hat. Sonst
    // feuerte die 1,2-s-Animation bei jedem 3-s-Fleet-Tick erneut (S-1).
    if (autoFollowRef.current) {
      const last = lastFollowRef.current;
      const movedKm = last ? haversineKm(last, selfPos) : Infinity;
      if (movedKm > 0.015) {
        lastFollowRef.current = { lat: selfPos.lat, lng: selfPos.lng };
        map.setView([selfPos.lat, selfPos.lng], SELF_ZOOM, { animate: true, duration: 1.2 });
      }
    }
    // Distanz: echte Strecken-Distanz wenn GraphHopper-Route vorhanden, sonst Luftlinie
    if (route && route.distanceM > 0) {
      setDistance(route.distanceM / 1000);
    } else {
      setDistance(haversineKm(selfPos, einsatzPos));
    }
  }, [fleet, selfPos, einsatzPos, route]);

  // — Hydranten-Layer aktualisieren —
  useEffect(() => {
    const layer = hydrantLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!waterOn) return;
    for (const h of hydranten) {
      L.marker([h.lat, h.lng], {
        icon: hydrantIcon(h.typ),
        title: `Löschwasser ${h.typ === "H" ? "Hydrant" : h.typ === "S" ? "Saugstelle" : "Tieflöschwasser"}`,
      }).addTo(layer);
    }
  }, [hydranten, waterOn]);

  const navHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(einsatzAdresse)}&travelmode=driving`;
  const hydrantsNearby = hydranten.filter((h) => haversineKm({ lat: h.lat, lng: h.lng }, selfPos) * 1000 <= 250).length;
  const etaMin = route && route.timeMs > 0
    ? Math.max(1, Math.round(route.timeMs / 60_000))
    : Math.max(1, Math.round((distance * 60) / 50));

  function recenter() {
    autoFollowRef.current = true;
    lastFollowRef.current = { lat: selfPos.lat, lng: selfPos.lng };
    mapRef.current?.setView([selfPos.lat, selfPos.lng], SELF_ZOOM, { animate: true });
  }

  /**
   * "Detail" — zoomt 200 m um die eigene Fahrzeug-Position. Default-Sicht.
   * Bei Capacitor-Geo-Modus ist SELF_ZOOM=17 schon ~250 m Sichtfeld. Zoom 18
   * wäre ~125 m, also zwischen den beiden für ~200 m: 17.
   * Macht im Endeffekt das gleiche wie Recenter, deshalb hier Alias.
   */
  function zoomDetail() {
    autoFollowRef.current = true;
    lastFollowRef.current = { lat: selfPos.lat, lng: selfPos.lng };
    mapRef.current?.flyTo([selfPos.lat, selfPos.lng], SELF_ZOOM, {
      duration: 0.6,
    });
  }

  /**
   * "Gesamt" — fitBounds([selfPos, einsatzPos, route.path]). Zeigt
   * Anfahrt komplett im Frame. Wenn die GraphHopper-Route da ist, nimmt
   * die alle Wegpunkte, sonst nur Start+Ziel.
   */
  function zoomGesamt() {
    const map = mapRef.current;
    if (!map) return;
    autoFollowRef.current = false;
    const points: LatLngExpression[] = [
      [selfPos.lat, selfPos.lng],
      [einsatzPos.lat, einsatzPos.lng],
    ];
    if (route && route.path.length > 1) {
      for (const p of route.path) points.push([p.lat, p.lng]);
    }
    const bounds: LatLngBoundsExpression = L.latLngBounds(
      points.map((p) => p as L.LatLngTuple),
    );
    map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6, maxZoom: 17 });
  }

  // Leaflet braucht ein invalidateSize() nach Größenänderung der Karte.
  // #156 (v0.1.15): invalidateSize alleine pannt nur — beim Vollbild-Toggle
  // müssen die Kacheln für die neue Fläche per redraw() nachgeladen werden.
  // Zweiter Tick bei 320ms fängt langsame Layout-/Transition-Fälle ab.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const refresh = (): void => {
      try {
        map.invalidateSize();
        tileLayersRef.current.base?.redraw();
        tileLayersRef.current.overlay?.redraw();
      } catch { /* unmounted */ }
    };
    const t1 = setTimeout(refresh, 60);
    const t2 = setTimeout(refresh, 320);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fullscreen]);

  // ESC-Taste schließt Vollbild
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const sectionStyle = fullscreen
    ? ({
        position: "fixed" as const,
        inset: 0,
        zIndex: 2100,
        margin: 0,
        borderRadius: 0,
        background: "var(--bg)",
        padding: 12,
        display: "flex",
        flexDirection: "column" as const,
        gap: 10,
      })
    : ({
        borderColor: "var(--border-strong)",
        background: "var(--card-gradient)",
        boxShadow: "var(--shadow-card)",
      });
  const mapHeight = fullscreen ? "calc(100vh - 200px)" : "360px";

  return (
    <section
      className={fullscreen ? "" : "rounded-m border p-3.5 pb-2.5"}
      style={sectionStyle}
    >
      <header className="mb-2.5 flex items-baseline justify-between">
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">
          Anfahrt &amp; Lage
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{
              borderColor: "var(--emerald-border)",
              background: "var(--emerald-bg)",
              color: "var(--emerald)",
              boxShadow: "0 0 18px -4px var(--emerald-glow)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--emerald)",
                boxShadow: "0 0 8px var(--emerald-glow)",
                animation: "pulse 1.8s ease-in-out infinite",
              }}
            />
            Position-Sharing
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={zoomDetail}
            aria-label="Detail · ~200 m um eigene Position"
            title="Detail · ~200 m um eigene Position"
          >
            <ScanSearch size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={zoomGesamt}
            aria-label="Gesamt · gesamte Anfahrt im Frame"
            title="Gesamt · gesamte Anfahrt im Frame"
          >
            <Maximize size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setFullscreen((v) => !v)}
            aria-label={fullscreen ? "Vollbild beenden" : "Karte im Vollbild"}
            title={fullscreen ? "Vollbild beenden (ESC)" : "Karte im Vollbild"}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </header>

      <div
        className="relative overflow-hidden rounded-s border"
        style={{ borderColor: "var(--border-strong)", flex: fullscreen ? 1 : undefined }}
      >
        <div ref={elRef} className="bg-surface-2" style={{ height: mapHeight, width: "100%" }} />

        {/* Issue 25 (Einsatz-Test 2026-06-02): Layer-Switch top-right. */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 401,
          }}
        >
          <MapCardTileLayerSwitch
            choice={tileChoice}
            onChange={(next) => {
              setTileChoice(next);
              saveTileChoice(next);
            }}
          />
        </div>

        <button
          type="button"
          aria-label="Auf eigene Position zentrieren"
          onClick={recenter}
          className="absolute bottom-[70px] right-2.5 z-[401] grid h-9 w-9 place-items-center rounded-full border bg-surface-1 text-text-1 shadow-md transition hover:scale-105"
          style={{ borderColor: "var(--amber-border)", color: "var(--amber)" }}
        >
          <Crosshair size={16} />
        </button>

        <div
          className="absolute bottom-2 left-2 right-2 z-[401] flex gap-0 overflow-hidden rounded-md border backdrop-blur-md"
          style={{
            borderColor: "var(--border-strong)",
            background: "color-mix(in srgb, var(--surface-1) 88%, transparent)",
          }}
        >
          <Stat
            label="Distanz"
            value={distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
            tone="red"
          />
          <Stat label="ETA" value={`${etaMin} min`} tone="amber" divided />
          <Stat
            label={`Hydranten 250m`}
            value={`${hydrantsNearby} · wkinfo`}
            tone="blue"
            divided
            align="right"
          />
        </div>
      </div>

      {route && route.instructions.length > 0 ? (
        <div
          style={{
            marginTop: 12,
            maxHeight: 200,
            overflowY: "auto",
            borderRadius: 12,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-2)",
            padding: "6px 4px",
          }}
        >
          <div
            style={{
              padding: "4px 10px 6px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              borderBottom: "1px solid var(--border)",
              marginBottom: 4,
            }}
          >
            {/* OPT-4 (Audit 2026-06-03): Klarsprache statt "Turn-by-Turn · GraphHopper". */}
            Abbiegehinweise
          </div>
          {route.instructions.map((ins, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                gap: 10,
                padding: "8px 10px",
                fontSize: 13,
                lineHeight: 1.35,
                color: "var(--fg)",
                borderBottom: idx < route.instructions.length - 1 ? "1px solid var(--border)" : 0,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 22,
                  textAlign: "center",
                  fontSize: 14,
                }}
                aria-hidden
              >
                {signGlyph(ins.sign)}
              </span>
              <span style={{ flex: 1 }}>{ins.text}</span>
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--fg-3)",
                }}
              >
                {ins.distanceM >= 1000
                  ? `${(ins.distanceM / 1000).toFixed(1)} km`
                  : `${Math.round(ins.distanceM)} m`}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-2.5 flex gap-2">
        <a
          href={navHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-[14px] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(180deg, #1E293B 0%, #0F172A 100%)",
            border: "1px solid #0F172A",
            boxShadow: "0 6px 18px -6px rgba(15, 23, 42, 0.50)",
          }}
        >
          <Navigation size={18} />
          <span>Route · Google Maps öffnen</span>
          <ExternalLink size={14} />
        </a>
        {showLoeschwasser ? (
          <button
            type="button"
            aria-pressed={waterOn}
            onClick={() => setWaterOn((v) => !v)}
            className="flex shrink-0 items-center gap-2 rounded-[14px] border px-3.5 py-3 text-sm font-semibold transition"
            style={
              waterOn
                ? {
                    borderColor: "var(--blue-border)",
                    background: "var(--blue-bg)",
                    color: "var(--blue)",
                  }
                : {
                    borderColor: "var(--border-strong)",
                    background: "var(--surface-2)",
                    color: "var(--fg-2)",
                  }
            }
          >
            <Droplets size={18} />
            Löschwasser
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Issue 25 (Einsatz-Test 2026-06-02): Layer-Switch wie in FlorianMap —
 * gleicher localStorage-Key, gleiche Visuals damit der Funktionaer ueberall
 * dasselbe sieht.
 */
function MapCardTileLayerSwitch({
  choice,
  onChange,
}: {
  choice: MapTileChoice;
  onChange: (next: MapTileChoice) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Karten-Layer waehlen"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        background: "color-mix(in srgb, var(--surface) 88%, transparent)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        padding: 2,
        backdropFilter: "blur(6px)",
      }}
    >
      <Layers
        size={11}
        strokeWidth={2}
        style={{
          marginLeft: 4,
          marginRight: 2,
          color: "var(--fg-3)",
          flexShrink: 0,
        }}
        aria-hidden
      />
      {(["karte", "foto", "hybrid"] as const).map((opt) => {
        const active = choice === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={active}
            title={`Layer · ${MAP_TILES[opt].label}`}
            style={{
              // OPT-2 (Audit 2026-06-03): Touch-Target von ~17px auf 40px Höhe +
              // mehr horizontales Padding + 2px gap zwischen den Optionen.
              // Beim Anfahren mit Handschuh muss der Layer-Wechsel treffbar sein,
              // ohne den Nachbar-Layer versehentlich zu erwischen.
              padding: "0 12px",
              minHeight: 40,
              marginLeft: 2,
              display: "inline-flex",
              alignItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: active ? "var(--info)" : "var(--fg-2)",
              background: active ? "var(--info-tint)" : "transparent",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
              transition: "color 120ms ease, background 120ms ease",
            }}
          >
            {MAP_TILES[opt].label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  align,
  tone,
  divided,
}: {
  label: string;
  value: string;
  align?: "right";
  tone?: "red" | "amber" | "blue";
  divided?: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-px px-2.5 py-2 ${align === "right" ? "text-right" : ""}`}
      style={{ borderLeft: divided ? "1px solid var(--border)" : undefined }}
    >
      <span
        className="font-mono text-[8px] font-bold uppercase tracking-[0.18em]"
        style={{ color: tone ? `var(--${tone})` : "var(--text-3)", opacity: tone ? 0.9 : 1 }}
      >
        {label}
      </span>
      <span
        className="font-mono text-[14px] font-bold tabular-nums tracking-wide text-text-1"
        style={tone ? { textShadow: `0 0 12px var(--${tone}-glow)` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function einsatzIcon(): L.DivIcon {
  return L.divIcon({
    className: "einsatz-marker",
    html: `
      <svg viewBox="0 0 36 48" width="36" height="48" style="filter:drop-shadow(0 4px 8px rgba(220,38,38,0.45))">
        <path d="M18 0 C8 0 2 8 2 16 C2 28 18 48 18 48 C18 48 34 28 34 16 C34 8 28 0 18 0 Z" fill="#dc2626" stroke="#fff" stroke-width="2"/>
        <path d="M18 8 C13 12 13 17 16 19 C14 18 13.5 16 14.5 14 M18 8 C23 12 23 17 20 19 C22 18 22.5 16 21.5 14 M16 21 H20 V25 H16 Z" fill="#fff"/>
      </svg>`,
    iconSize: [36, 48],
    iconAnchor: [18, 44],
  });
}

/**
 * Wie alt ist die letzte Position in Minuten? null = nie gesehen.
 * Zentrale ist fix und gibt immer 0 zurück.
 */
function staleMinutes(f: MapPosition, now: number): number | null {
  if (f.isZentrale) return 0;
  if (!f.lastSeenAt) return null;
  const t = new Date(f.lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60_000));
}

function fzgIcon(f: MapPosition, staleMin: number | null): L.DivIcon {
  const isSelf = !!f.isSelf;
  const cls = isSelf ? "fzg-self" : "fzg-other";
  const isStale = staleMin !== null && staleMin > STALE_AFTER_MIN;
  const opacityStyle = isStale || staleMin === null ? "opacity:0.45;" : "";
  const offlineLabel =
    isStale
      ? `<div class="fzg-offline">offline seit ${staleMin} min</div>`
      : staleMin === null && !f.isZentrale
        ? `<div class="fzg-offline">keine Position</div>`
        : "";
  return L.divIcon({
    className: cls,
    html: `<div class="fzg-wrap" style="${opacityStyle}">
      <div class="${cls}-pin">
        <span class="${cls}-dot"></span>
        <span>${f.abk}</span>
      </div>
      ${offlineLabel}
    </div>`,
    iconSize: undefined as unknown as L.PointTuple,
    iconAnchor: [10, 10],
  });
}

function hydrantIcon(typ: "H" | "S" | "T"): L.DivIcon {
  return L.divIcon({
    className: "hydrant-marker",
    html: `<div class="hydrant-pin">${typ}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// OPT-1 (Audit 2026-06-03): lokale haversineKm-Kopie entfernt, jetzt aus
// @hotdoc/shared importiert (eine Implementierung statt drei).

/** GraphHopper-Sign-Code → Pfeil-Glyph. Siehe docs.graphhopper.com. */
function signGlyph(sign: number): string {
  switch (sign) {
    case -98: return "·";       // unknown
    case -8:  return "↶";        // leave roundabout
    case -7:  return "↰";        // keep left
    case -3:  return "↰";        // sharp left
    case -2:  return "←";        // left
    case -1:  return "↖";        // slight left
    case 0:   return "↑";        // straight
    case 1:   return "↗";        // slight right
    case 2:   return "→";        // right
    case 3:   return "↱";        // sharp right
    case 4:   return "🏁";        // finish
    case 5:   return "•";        // via reached
    case 6:   return "⟳";        // use roundabout
    case 7:   return "↱";        // keep right
    default:  return "·";
  }
}
