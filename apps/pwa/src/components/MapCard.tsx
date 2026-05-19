import L, { type LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, Crosshair, Droplets, Navigation } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface MapPosition {
  fahrzeugId: string;
  funkrufname: string;
  abk: string;
  lat: number;
  lng: number;
  isSelf?: boolean;
}

export interface Hydrant {
  id: string;
  typ: "H" | "S" | "T";
  lat: number;
  lng: number;
}

interface Props {
  selfPos: { lat: number; lng: number };
  einsatzPos: { lat: number; lng: number };
  einsatzAdresse: string;
  fleet: MapPosition[];
  hydranten: Hydrant[];
}

const SELF_ZOOM = 17;

export function MapCard({ selfPos, einsatzPos, einsatzAdresse, fleet, hydranten }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const hydrantLayerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const autoFollowRef = useRef(true);
  const [waterOn, setWaterOn] = useState(true);
  const [distance, setDistance] = useState<number>(0);

  // — Map einmalig initialisieren —
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    }).setView([selfPos.lat, selfPos.lng], SELF_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);

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
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // — Marker für Fahrzeuge synchronisieren —
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const f of fleet) {
      seen.add(f.fahrzeugId);
      const existing = markersRef.current.get(f.fahrzeugId);
      const pos: LatLngExpression = [f.lat, f.lng];
      if (existing) {
        existing.setLatLng(pos);
      } else {
        const m = L.marker(pos, {
          icon: fzgIcon(f.abk, !!f.isSelf),
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
    // Route updaten
    if (routeRef.current) {
      routeRef.current.setLatLngs([
        [selfPos.lat, selfPos.lng],
        [einsatzPos.lat, einsatzPos.lng],
      ]);
    }
    // Auto-Follow auf Self
    if (autoFollowRef.current) {
      map.setView([selfPos.lat, selfPos.lng], SELF_ZOOM, { animate: true, duration: 1.2 });
    }
    // Distanz
    setDistance(haversineKm(selfPos, einsatzPos));
  }, [fleet, selfPos, einsatzPos]);

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
  const etaMin = Math.max(1, Math.round((distance * 60) / 50));

  function recenter() {
    autoFollowRef.current = true;
    mapRef.current?.setView([selfPos.lat, selfPos.lng], SELF_ZOOM, { animate: true });
  }

  return (
    <section
      className="rounded-m border p-3.5 pb-2.5"
      style={{
        borderColor: "var(--border-strong)",
        background: "var(--card-gradient)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <header className="mb-2.5 flex items-baseline justify-between">
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">
          Anfahrt &amp; Lage
        </h2>
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
      </header>

      <div
        className="relative overflow-hidden rounded-s border"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <div ref={elRef} className="h-[280px] bg-surface-2" />

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

      <div className="mt-2.5 flex gap-2">
        <a
          href={navHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2.5 rounded-m px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--blue) 80%, #000) 0%, color-mix(in srgb, var(--blue) 55%, #000) 100%)",
            border: "1px solid color-mix(in srgb, var(--blue) 60%, #000)",
            boxShadow: "0 10px 26px -10px var(--blue-glow), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          <Navigation size={18} />
          <span>Route aktiv · Google Maps öffnen</span>
          <ExternalLink size={14} />
        </a>
        <button
          type="button"
          aria-pressed={waterOn}
          onClick={() => setWaterOn((v) => !v)}
          className="flex shrink-0 items-center gap-2 rounded-m border px-3.5 py-3 text-sm font-semibold transition"
          style={
            waterOn
              ? {
                  borderColor: "var(--blue-border)",
                  background: "var(--blue-bg)",
                  color: "var(--blue)",
                  boxShadow: "0 0 16px -4px var(--blue-glow)",
                }
              : {
                  borderColor: "var(--border-strong)",
                  background: "var(--surface-2)",
                  color: "var(--text-2)",
                }
          }
        >
          <Droplets size={18} />
          Löschwasser
        </button>
      </div>
    </section>
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
      <svg viewBox="0 0 36 48" width="36" height="48" style="filter:drop-shadow(0 4px 8px rgba(220,38,38,0.45));animation:bounce 1.6s ease-in-out infinite">
        <path d="M18 0 C8 0 2 8 2 16 C2 28 18 48 18 48 C18 48 34 28 34 16 C34 8 28 0 18 0 Z" fill="#dc2626" stroke="#fff" stroke-width="2"/>
        <path d="M18 8 C13 12 13 17 16 19 C14 18 13.5 16 14.5 14 M18 8 C23 12 23 17 20 19 C22 18 22.5 16 21.5 14 M16 21 H20 V25 H16 Z" fill="#fff"/>
      </svg>`,
    iconSize: [36, 48],
    iconAnchor: [18, 44],
  });
}

function fzgIcon(abk: string, isSelf: boolean): L.DivIcon {
  const cls = isSelf ? "fzg-self" : "fzg-other";
  return L.divIcon({
    className: cls,
    html: `<div class="${cls}-pin">
      <span class="${cls}-dot"></span>
      <span>${abk}</span>
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

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
