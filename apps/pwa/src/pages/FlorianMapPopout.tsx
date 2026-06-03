/**
 * FlorianMap-Pop-Out — eigene Top-Level-Seite, wird via window.open
 * aus der ZentralePage geöffnet. Ziel: zweiten Bildschirm mit Live-
 * Karte bestücken, während der Funktionär auf dem Haupt-Bildschirm
 * den Bericht editiert.
 *
 * Architektur: dieselbe FlorianMap-Komponente, aber variant="popout"
 * (kein Border, voll-fenstergroße Map). Eigenes Polling alle 3 s gegen
 * /api/einsaetze + /api/positions + /api/fahrzeugberichte — selbstständig
 * von der Haupt-PWA, damit das Schließen der Haupt-Seite die Karte
 * nicht stoppt.
 */

import { useEffect, useState } from "react";
import { resolveApiUrl } from "../lib/api";
import { FlorianMap, type FahrzeugMannschaft, type FahrzeugPos } from "../components/FlorianMap";
import { FAHRZEUGE, FLORIAN_POSITION } from "@hotdoc/shared";
import type { FahrzeugId } from "@hotdoc/shared";

interface PositionPing {
  fahrzeugId: FahrzeugId;
  lat: number;
  lng: number;
  ts: string;
}

interface FahrzeugberichtRow {
  fahrzeugId: FahrzeugId;
  status: "in_arbeit" | "abgeschlossen";
  fahrerPersonId?: number;
  fahrzeugKdtPersonId?: number;
  mannschaft?: Array<{ name?: string; personId?: number }>;
}

interface AktiverEinsatz {
  _id: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  einsatzort?: string;
  koordinaten?: { lat: number; lng: number };
}

function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "tlf-a-4000":
      return "TLF";
    case "lfa-b":
      return "LFA-B";
    case "kdo":
      return "KDO";
    case "mtf":
      return "MTF";
    case "zentrale":
      return "FLO";
    default:
      return String(id).toUpperCase();
  }
}

export function FlorianMapPopout(): JSX.Element {
  const [einsatz, setEinsatz] = useState<AktiverEinsatz | null>(null);
  const [positions, setPositions] = useState<PositionPing[]>([]);
  const [berichte, setBerichte] = useState<FahrzeugberichtRow[]>([]);
  const [personById, setPersonById] = useState<Record<number, string>>({});
  const [token] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hotdoc.tabletToken");
    } catch {
      return null;
    }
  });

  // Aktiven Einsatz holen + alle 5 s refreshen.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchEinsatz = async (): Promise<void> => {
      try {
        const res = await fetch(resolveApiUrl("/api/einsaetze?status=aktiv"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { items: AktiverEinsatz[] };
        if (cancelled) return;
        setEinsatz(json.items[0] ?? null);
      } catch {
        // egal — Polling versucht es gleich wieder
      }
    };
    void fetchEinsatz();
    const t = setInterval(() => void fetchEinsatz(), 5_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token]);

  // Positions-Pings alle 3 s.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchPositions = async (): Promise<void> => {
      try {
        const res = await fetch(resolveApiUrl("/api/positions"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { positions: PositionPing[] };
        if (cancelled) return;
        setPositions(
          (json.positions ?? []).filter((p) =>
            ["kdo", "tlf-a-4000", "lfa-b", "mtf"].includes(p.fahrzeugId),
          ),
        );
      } catch {
        // ignore
      }
    };
    void fetchPositions();
    const t = setInterval(() => void fetchPositions(), 3_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token]);

  // Fahrzeugberichte des aktiven Einsatzes — für Status + Mannschaft.
  useEffect(() => {
    if (!token || !einsatz) {
      setBerichte([]);
      return;
    }
    let cancelled = false;
    const fetchBerichte = async (): Promise<void> => {
      try {
        const res = await fetch(
          resolveApiUrl(
            `/api/einsaetze/${encodeURIComponent(einsatz._id)}/fahrzeugberichte`,
          ),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { items: FahrzeugberichtRow[] };
        if (cancelled) return;
        setBerichte(json.items ?? []);
      } catch {
        // ignore
      }
    };
    void fetchBerichte();
    const t = setInterval(() => void fetchBerichte(), 8_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [token, einsatz?._id]);

  // Personen-Auflösung (für Fahrer-/Kdt-Namen).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchPersonen = async (): Promise<void> => {
      try {
        const res = await fetch(resolveApiUrl("/api/admin/personen"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          items: Array<{ id: number; vorname: string; nachname: string }>;
        };
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const p of json.items ?? []) {
          map[p.id] = `${p.vorname} ${p.nachname}`.trim();
        }
        setPersonById(map);
      } catch {
        // ignore
      }
    };
    void fetchPersonen();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Fleet für FlorianMap bauen (gleiche Logik wie ZentralePage).
  const statusById = new Map(
    berichte.map((b): [string, "im_einsatz" | "abgeschlossen"] => [
      b.fahrzeugId,
      b.status === "abgeschlossen" ? "abgeschlossen" : "im_einsatz",
    ]),
  );
  const fleet: FahrzeugPos[] = positions.map((p) => ({
    fahrzeugId: p.fahrzeugId,
    funkrufname: FAHRZEUGE[p.fahrzeugId].funkrufname,
    abk: shortCode(p.fahrzeugId),
    lat: p.lat,
    lng: p.lng,
    status: statusById.get(p.fahrzeugId) ?? "wartend",
    lastSeenAt: p.ts,
  }));
  // Florian fix am FF-Haus
  fleet.push({
    fahrzeugId: "zentrale",
    funkrufname: FAHRZEUGE.zentrale.funkrufname,
    abk: "FLO",
    lat: FLORIAN_POSITION.lat,
    lng: FLORIAN_POSITION.lng,
    status: einsatz ? "im_einsatz" : "wartend",
    isZentrale: true,
  });

  // Mannschafts-Mapping je Fahrzeug
  const mannschaftByFahrzeug: Record<string, FahrzeugMannschaft> = {};
  for (const b of berichte) {
    const fahrerName = b.fahrerPersonId ? personById[b.fahrerPersonId] : undefined;
    const kdtName = b.fahrzeugKdtPersonId
      ? personById[b.fahrzeugKdtPersonId]
      : undefined;
    mannschaftByFahrzeug[b.fahrzeugId] = {
      fahrzeugId: b.fahrzeugId,
      ...(fahrerName ? { fahrer: fahrerName } : {}),
      ...(kdtName ? { kdt: kdtName } : {}),
      mannschaft: (b.mannschaft ?? [])
        .map((m) =>
          m.name ??
          (m.personId !== undefined ? personById[m.personId] : undefined),
        )
        .filter((s): s is string => !!s),
    };
  }

  if (!token) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "var(--font-sans)",
          color: "var(--fg-2)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h2>Kein Token gefunden</h2>
          <p>
            Bitte zuerst auf der Haupt-Seite anmelden, dann diese Pop-Out-Karte
            neu öffnen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "10px 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: 15,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg-2)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ color: "var(--red)" }}>● Live-Lagekarte</span>
        {einsatz ? (
          <>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>
              {einsatz.einsatzart ?? einsatz.einsatzartFreitext ?? "Einsatz"} ·{" "}
              {einsatz.einsatzort ?? "—"}
            </span>
          </>
        ) : (
          <span style={{ opacity: 0.6 }}>Kein aktiver Einsatz</span>
        )}
      </header>
      <div style={{ flex: 1 }}>
        <FlorianMap
          variant="popout"
          {...(einsatz?.koordinaten
            ? {
                einsatzort: {
                  lat: einsatz.koordinaten.lat,
                  lng: einsatz.koordinaten.lng,
                  ...(einsatz.einsatzort
                    ? { label: einsatz.einsatzort }
                    : {}),
                },
              }
            : {})}
          fahrzeuge={fleet}
          zoom={einsatz?.koordinaten ? 16 : 14}
          mannschaftByFahrzeug={mannschaftByFahrzeug}
        />
      </div>
    </div>
  );
}
