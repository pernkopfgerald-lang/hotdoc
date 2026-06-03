import {
  AlertTriangle,
  Archive,
  Calendar,
  Download,
  FileText,
  Flame,
  GraduationCap,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiCall, ApiError, getTabletToken } from "../lib/api";

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
  /**
   * Reaktivierungs-Dialog — wenn der EL (Florianstation) einen
   * abgeschlossenen Einsatz wieder öffnen will. Inline-State mit
   * der ID des Einsatzes der gerade bestätigt wird + Grund-Input.
   * Backend braucht Grund (mind. 10 Zeichen) fuer den Audit-Trail.
   */
  const [reaktivOpen, setReaktivOpen] = useState<{ id: string; title: string } | null>(null);
  const [reaktivGrund, setReaktivGrund] = useState("");
  const [reaktivBusy, setReaktivBusy] = useState(false);
  const [reaktivErr, setReaktivErr] = useState<string | null>(null);

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
      const { resolveApiUrl } = await import("../lib/api");
      const res = await fetch(resolveApiUrl(`/api/einsaetze/${encodeURIComponent(pdfId)}/pdf`), {
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
          // D-18: Modal-Width Stufe lg (880px) — Multi-Spalten-View (Archiv).
          width: "min(var(--modal-w-lg), calc(100% - 24px))",
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
                fontSize: 21.5,
                fontWeight: 700,
                letterSpacing: "var(--tracking-tight)",
              }}
            >
              {fahrzeugId ? `Archiv · ${fahrzeugName ?? fahrzeugId}` : "Archiv"}
            </h2>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12.5,
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
            /* U-15: echter Loading-Spinner statt nur Text "laedt …" */
            <div
              style={{
                padding: "48px 0",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                color: "var(--fg-3)",
              }}
            >
              <Loader2 size={24} className="animate-spin" />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 14,
                  letterSpacing: "var(--tracking-caps)",
                  textTransform: "uppercase",
                }}
              >
                Archiv wird geladen …
              </span>
            </div>
          ) : err ? (
            /* U-15: rotes Banner mit AlertTriangle — "Verbindung pruefen"
               als handlungsanleitender Hinweis (statt blosser Fehlertext). */
            <div
              role="alert"
              style={{
                padding: "14px 16px",
                borderRadius: "var(--radius-s)",
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 16.5,
                border: "1px solid var(--red-border)",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Verbindung pruefen.</strong> Das Archiv konnte nicht
                geladen werden — WLAN/Mobilfunk checken und neu oeffnen.
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "var(--font-mono)",
                    fontSize: 12.5,
                    opacity: 0.85,
                    wordBreak: "break-word",
                  }}
                >
                  {err}
                </div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            /* U-15: Empty-State klar unterscheiden — Suche leer vs. echtes
               leeres Archiv. */
            <div
              style={{
                padding: "48px 0",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                color: "var(--fg-3)",
              }}
            >
              <Archive size={28} strokeWidth={1.6} style={{ opacity: 0.5 }} />
              <div style={{ fontSize: 17.5, fontWeight: 600, color: "var(--fg-2)" }}>
                {query ? "Keine Treffer fuer die Suche." : "Keine Berichte im Archiv gefunden."}
              </div>
              {!query && (
                <div style={{ fontSize: 15, opacity: 0.85 }}>
                  Abgeschlossene Berichte erscheinen hier nach dem Einsatz.
                </div>
              )}
            </div>
          ) : (
            filtered.map((i) => {
              const typ = TYP_LABEL[i.einsatzTyp ?? "alarm"];
              const Icon = typ.icon;
              const title = i.einsatzart || i.einsatzartFreitext || "Einsatz";
              // Reaktivieren-Ziel ist IMMER die Einsatz-Doc-ID. Im Fahrzeug-
              // Modus ist item._id ein "fzgber:…" — dort die mitgelieferte
              // einsatzId nehmen; im Florian-Modus ist _id bereits der Einsatz.
              // Issue 10: Mannschaft darf reaktivieren → Button auch im
              // Fahrzeug-Archiv (vorzeitig abgeschlossener Bericht wieder auf).
              const reaktivId = fahrzeugId ? i.einsatzId : i._id;
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
                        fontSize: 19,
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
                        fontSize: 15,
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
                        fontSize: 12.5,
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
                  {reaktivId && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setReaktivOpen({ id: reaktivId, title })
                      }
                      aria-label="Bericht reaktivieren"
                      title="Bericht reaktivieren"
                      style={{
                        background: "var(--warn-tint)",
                        color: "var(--warn)",
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
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
      {/* ─── Reaktivierungs-Dialog (Florianstation only) ─── */}
      {reaktivOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reaktiv-dialog-title"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1600,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(540px, calc(100% - 32px))",
              background: "var(--glass-1)",
              border: "1px solid var(--glass-border-strong)",
              borderRadius: 16,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              animation: "glass-reveal 200ms var(--ease-decel) both",
            }}
          >
            <h3
              id="reaktiv-dialog-title"
              style={{ margin: 0, fontSize: 22.5, fontWeight: 700 }}
            >
              Bericht reaktivieren
            </h3>
            <div style={{ fontSize: 16.5, color: "var(--fg-2)", lineHeight: 1.5 }}>
              <strong>{reaktivOpen.title}</strong> wird wieder geöffnet.
              Bitte einen Grund angeben (mind. 10 Zeichen) — wird ins
              Audit-Log eingetragen und auf dem PDF als Reaktivierungs-Hinweis
              gerendert.
            </div>
            <textarea
              className="input"
              rows={3}
              placeholder="z. B. Nachtrag Atemschutz-Daten · syBOS-Korrektur · …"
              value={reaktivGrund}
              onChange={(e) => setReaktivGrund(e.target.value)}
              style={{ resize: "vertical", fontSize: 17.5 }}
              autoFocus
            />
            {reaktivErr && (
              <div
                style={{
                  fontSize: 15,
                  color: "var(--red)",
                  padding: "6px 8px",
                  background: "var(--red-tint)",
                  borderRadius: 6,
                }}
              >
                {reaktivErr}
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                className="btn"
                disabled={reaktivBusy}
                onClick={() => {
                  setReaktivOpen(null);
                  setReaktivGrund("");
                  setReaktivErr(null);
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={reaktivBusy}
                onClick={async () => {
                  if (reaktivGrund.trim().length < 10) {
                    setReaktivErr("Grund mind. 10 Zeichen.");
                    return;
                  }
                  setReaktivBusy(true);
                  setReaktivErr(null);
                  try {
                    await apiCall(
                      `/api/einsaetze/${encodeURIComponent(reaktivOpen.id)}/reaktivieren`,
                      { method: "POST", body: { grund: reaktivGrund.trim() } },
                    );
                    setReaktivOpen(null);
                    setReaktivGrund("");
                    // Modal schliessen → ZentralePage holt den
                    // reaktivierten Einsatz beim naechsten Poll.
                    onClose();
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 409) {
                      // not_closed: Einsatz läuft bereits (nur der Fahrzeug-
                      // bericht war abgeschlossen) oder wurde schon reaktiviert.
                      setReaktivErr(
                        "Der Einsatz ist nicht (mehr) abgeschlossen — er läuft bereits oder wurde schon reaktiviert. Öffne ihn über den Einsatz-Tab.",
                      );
                    } else {
                      setReaktivErr(
                        e instanceof Error ? e.message : "Reaktivierung fehlgeschlagen",
                      );
                    }
                  } finally {
                    setReaktivBusy(false);
                  }
                }}
                style={{
                  background: "var(--warn)",
                  borderColor: "var(--warn)",
                  color: "#fff",
                  fontWeight: 700,
                  minWidth: 140,
                }}
              >
                {reaktivBusy ? "…" : "Reaktivieren"}
              </button>
            </div>
          </div>
        </div>
      )}
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
