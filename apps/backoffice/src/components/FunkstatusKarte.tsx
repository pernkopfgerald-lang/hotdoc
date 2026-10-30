import { Radio } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FAHRZEUGE, funkstatusKurz, funkstatusText, funkstatusTon, type FahrzeugId } from "@hotdoc/shared";
import { apiCall } from "../api/client";
import { FAHRZEUG_IDS as IDS } from "../lib/fahrzeuge";
import { useSichtbarPolling } from "../lib/useSichtbarPolling";

const TON_KLASSE = { ok: "ok", info: "rank", warn: "warn", danger: "red", neutral: "neutral" } as const;

interface Eintrag {
  status: string;
  since: string | null;
}

interface Stand {
  map: Partial<Record<FahrzeugId, Eintrag>>;
  enabled: boolean;
  stale: boolean;
}

function hhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

/** Funkstatus aller Fahrzeuge laut Leitstelle (ELS), im Klartext. Aktualisiert alle 15 s. */
export function FunkstatusKarte() {
  const [stand, setStand] = useState<Stand>({ map: {}, enabled: false, stale: true });
  const [fehler, setFehler] = useState(false);

  const aktiv = useRef(true);
  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
    };
  }, []);

  const tick = useCallback(async () => {
    try {
      const r = await apiCall<{
        enabled: boolean;
        stale: boolean;
        items: Array<{ fahrzeugId: string; status: string; since: string | null }>;
      }>("/api/els/status");
      if (!aktiv.current) return;
      const map: Stand["map"] = {};
      for (const i of r.items) {
        if ((IDS as ReadonlyArray<string>).includes(i.fahrzeugId)) {
          map[i.fahrzeugId as FahrzeugId] = { status: i.status ?? "", since: i.since };
        }
      }
      setStand({ map, enabled: r.enabled, stale: r.stale });
      setFehler(false);
    } catch {
      if (aktiv.current) setFehler(true); // letzter Stand bleibt stehen, Hinweis in der Karte
    }
  }, []);

  // Pausiert bei verstecktem Tab, laedt beim Sichtbarwerden sofort nach.
  useSichtbarPolling(tick, 15_000);

  if (!stand.enabled) return null;

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Radio size={18} />
          Funkstatus · Fahrzeuge
        </div>
        <span className="card-meta">{fehler ? "Abruf fehlgeschlagen — letzter Stand" : "Leitstelle (ELS)"}</span>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {IDS.map((id) => {
          const e = stand.map[id];
          const veraltet = stand.stale || !e;
          const kurz = e?.status ? funkstatusKurz(e.status) || `Funkstatus ${e.status}` : "";
          const label = veraltet ? "nicht verfügbar" : kurz || "Kein Funkstatus";
          const ton = veraltet ? "neutral" : e?.status ? funkstatusTon(e.status) : "neutral";
          const seit = !veraltet && e?.status ? hhmm(e.since) : "";
          return (
            <li key={id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{FAHRZEUGE[id].funkrufname}</span>
              <span
                className={`badge ${TON_KLASSE[ton]}`}
                title={e?.status ? `Funkstatus ${e.status}: ${funkstatusText(e.status)}` : undefined}
                style={{ gap: 5, whiteSpace: "nowrap" }}
              >
                {label}
                {seit ? ` · seit ${seit}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
