import { Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { FAHRZEUGE, funkstatusKurz, funkstatusText, funkstatusTon, type FahrzeugId } from "@hotdoc/shared";
import { apiCall } from "../api/client";

const IDS = ["kdo", "tlf-a-4000", "lfa-b", "mtf"] as const satisfies ReadonlyArray<FahrzeugId>;

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

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiCall<{
          enabled: boolean;
          stale: boolean;
          items: Array<{ fahrzeugId: string; status: string; since: string | null }>;
        }>("/api/els/status");
        if (cancelled) return;
        const map: Stand["map"] = {};
        for (const i of r.items) {
          if ((IDS as ReadonlyArray<string>).includes(i.fahrzeugId)) {
            map[i.fahrzeugId as FahrzeugId] = { status: i.status ?? "", since: i.since };
          }
        }
        setStand({ map, enabled: r.enabled, stale: r.stale });
        setFehler(false);
      } catch {
        if (!cancelled) setFehler(true); // letzter Stand bleibt stehen, Hinweis in der Karte
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

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
          // Kein Status von der Leitstelle = Fahrzeug steht frei auf Wache.
          const label = veraltet ? "nicht verfügbar" : kurz || "Frei auf Wache";
          const ton = veraltet ? "neutral" : e?.status ? funkstatusTon(e.status) : "ok";
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
