import {
  Archive,
  Calendar,
  Download,
  FileText,
  Flame,
  GraduationCap,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiCall, getTabletToken } from "../lib/api";

interface ArchivItem {
  _id: string;
  einsatzId?: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  einsatzort?: string;
  alarmierungZeit?: string;
  einsatzende?: string;
  einsatzTyp?: "alarm" | "manuell" | "lotsendienst" | "uebung";
  status?: string;
  /** Fahrzeug-Bericht-spezifische Felder (nur im Fahrzeug-Modus gefuellt). */
  kmGefahrenKm?: number;
  mannschaftAnzahl?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Wenn gesetzt, zeigt das Modal nur Fahrzeugberichte dieses Fahrzeugs
   *  (eigene Berichte). Ohne diese Prop zeigt es Einsatz-Hauptberichte
   *  fuer die Florianstation. */
  fahrzeugId?: string;
  /** Anzeige-Name fuer den Header (z. B. Funkrufname). */
  fahrzeugName?: string;
}

const TYP_LABEL: Record<NonNullable<ArchivItem["einsatzTyp"]>, { label: string; icon: typeof Flame; color: string }> = {
  alarm:        { label: "Alarm",        icon: Flame,         color: "var(--red)"  },
  manuell:      { label: "Manuell",      icon: FileText,      color: "var(--info)" },
  lotsendienst: { label: "Lotsendienst", icon: MapPin,        color: "var(--warn)" },
  uebung:       { label: "Übung",        icon: GraduationCap, color: "var(--ok)"   },
};

/**
 * Read-only Archiv-Browser für das Tablet.
 *
 * Lädt /api/einsaetze?status=abgeschlossen, zeigt eine Liste mit
 * Stichwort, Ort, Datum und Typ-Badge. PDF-Download je Eintrag.
 * Filter-Suche über Stichwort + Ort + Datum.
 *
 * Bewusst minimal — die Tablets sind nicht für Recherche-Sessions
 * gedacht. Wer länger im Archiv arbeitet, soll das Backoffice nutzen.
 */
export function ArchivTabletModal({ open, onClose, fahrzeugId, fahrzeugName }: Props) {
  const [items, setItems] = useState<ArchivItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        // Fahrzeug-Modus: eigene Fahrzeugberichte (mit Einsatz-Stammdaten
        // bereits gemerged). Florian-Modus: globale Einsatz-Hauptberichte.
        const url = fahrzeugId
          ? `/api/fahrzeugberichte/meine?fahrzeugId=${encodeURIComponent(fahrzeugId)}&status=abgeschlossen`
          : "/api/einsaetze?status=abgeschlossen";
        const r = await apiCall<{ items: ArchivItem[] }>(url);
        if (cancelled) return;
        // Sort DESC nach Alarmierungszeit, max 50 Einträge auf dem Tablet
        const sorted = [...r.items].sort((a, b) => {
          const ta = new Date(a.alarmierungZeit ?? 0).getTime();
          const tb = new Date(b.alarmierungZeit ?? 0).getTime();
          return tb - ta;
        });
        setItems(sorted.slice(0, 50));
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fahrzeugId]);

  const filtered = useMemo(() => {
    const norm = query.trim().toLowerCase();
    if (!norm) return items;
    return items.filter((i) => {
      const hay = [
        i.einsatzart ?? "",
        i.einsatzartFreitext ?? "",
        i.einsatzort ?? "",
        formatDate(i.alarmierungZeit),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(norm);
    });
  }, [items, query]);

  async function downloadPdf(item: ArchivItem) {
    setDownloadBusy(item._id);
    try {
      const token = getTabletToken();
      // Im Fahrzeug-Modus hat item._id Form "fzgber:..." — wir muessen den
      // Einsatz-Hauptberich-PDF holen, also einsatzId verwenden. Im Florian-
      // Modus ist item._id bereits die Einsatz-Doc-ID.
      const pdfId = item.einsatzId ?? item._id;
      const res = await fetch(`/api/einsaetze/${encodeURIComponent(pdfId)}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // URL.revokeObjectURL nach kurzem Delay — Browser braucht ihn für den Tab
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadBusy(null);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archiv-title"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(880px, calc(100% - 24px))",
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: "var(--glass-shadow-1)",
          padding: 22,
          gap: 14,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 42,
              height: 42,
              borderRadius: 12,
              background:
                "linear-gradient(135deg, var(--fg) 0%, var(--fg-2) 100%)",
              color: "var(--bg)",
              boxShadow: "0 8px 20px -6px rgba(0,0,0,0.35)",
            }}
          >
            <Archive size={20} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <h2
              id="archiv-title"
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: "var(--tracking-tight)",
              }}
            >
              {fahrzeugId ? `Archiv · ${fahrzeugName ?? fahrzeugId}` : "Archiv"}
            </h2>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginTop: 2,
              }}
            >
              {fahrzeugId
                ? "Eigene Fahrzeugberichte · max 50"
                : "Letzte abgeschlossene Berichte · max 50"}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        <div className="input-row filled" style={{ paddingLeft: 14 }}>
          <Search size={16} color="var(--fg-3)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche · Stichwort, Ort, Datum"
            autoFocus
          />
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingRight: 4,
            minHeight: 0,
          }}
        >
          {loading ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "var(--fg-3)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
              }}
            >
              lädt …
            </div>
          ) : err ? (
            <div
              role="alert"
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-s)",
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 13,
                border: "1px solid var(--red-border)",
              }}
            >
              Archiv konnte nicht geladen werden: {err}
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "40px 0",
                textAlign: "center",
                color: "var(--fg-3)",
                fontSize: 13,
              }}
            >
              {query ? "Keine Treffer für die Suche." : "Noch keine abgeschlossenen Berichte."}
            </div>
          ) : (
            filtered.map((i) => {
              const typ = TYP_LABEL[i.einsatzTyp ?? "alarm"];
              const Icon = typ.icon;
              const title = i.einsatzart || i.einsatzartFreitext || "Einsatz";
              return (
                <div
                  key={i._id}
                  className="person filled"
                  style={{
                    cursor: "default",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    className="avatar"
                    style={{
                      background:
                        `color-mix(in srgb, ${typ.color} 18%, var(--glass-2))`,
                      color: typ.color,
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                    }}
                  >
                    <Icon size={18} />
                  </span>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-2)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {i.einsatzort ?? "—"}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "var(--tracking-caps)",
                        textTransform: "uppercase",
                        color: "var(--fg-3)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Calendar size={10} /> {formatDate(i.alarmierungZeit)} ·{" "}
                      <span style={{ color: typ.color }}>{typ.label}</span>
                      {fahrzeugId && i.kmGefahrenKm !== undefined ? (
                        <>
                          {" · "}
                          <span>
                            {i.kmGefahrenKm.toFixed(1).replace(".", ",")} km
                          </span>
                        </>
                      ) : null}
                      {fahrzeugId && i.mannschaftAnzahl !== undefined ? (
                        <>
                          {" · "}
                          <span>{i.mannschaftAnzahl} Pers.</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={downloadBusy === i._id}
                    onClick={() => void downloadPdf(i)}
                    aria-label="PDF öffnen"
                    title="PDF öffnen"
                  >
                    <Download size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
