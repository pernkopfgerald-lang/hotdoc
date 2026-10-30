import { Activity, BarChart3, Calendar, Clock, Flame, GraduationCap, MapPin, RefreshCw, Siren, Truck, Users, Wind } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiCall } from "../api/client";
import { ErrorBanner } from "../components/ErrorBanner";

// Tabellen-Zellstile (Kopie der Archiv-Tabelle in Verwaltung.tsx — bewusst
// lokal, damit dieses lazy geladene Modul nicht von der Seite abhaengt).
const archTh: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--fg-3)",
};
const archTd: React.CSSProperties = {
  padding: "10px",
  fontSize: 13,
};

// ─────────────────────────────────────────────────────────────────────
// Statistik-Dashboard — Jahres-Übersicht für Bericht ans Kommando
// ─────────────────────────────────────────────────────────────────────

interface StatsResponse {
  range: { from: string; to: string };
  totals: {
    // U-09: bereinigt — zaehlt OHNE Uebungen und ohne verworfene Berichte
    einsaetze: number;
    // U-09: eigener Uebungs-Zaehler; optional, falls ein aelteres Backend
    // das Feld noch nicht liefert (dann Fallback auf pro_typ.uebung)
    uebungen?: number;
    pro_typ: { alarm: number; manuell: number; lotsendienst: number; uebung: number };
    mannschaftStunden: number;
    // U-09: Split der Mannschaftsstunden — optional (aeltere Backends)
    mannschaftStundenEinsatz?: number;
    mannschaftStundenUebung?: number;
    asTraeger: number;
    asStunden: number;
    kmGesamt: number;
    kmLotsendienst: number;
    fahrzeugberichte: number;
  };
  monate: Array<{ monat: string; alarm: number; manuell: number; lotsendienst: number; uebung: number }>;
  uebungsTypen: Array<{ typ: string; anzahl: number; stunden: number }>;
  topEinsatzarten: Array<{ art: string; anzahl: number }>;
  generatedAt: string;
}

export function StatistikPanel() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const from = `${year}-01-01`;
      const to = `${year + 1}-01-01`;
      const r = await apiCall<StatsResponse>(
        `/api/admin/stats?from=${from}&to=${to}`,
      );
      setStats(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  // U-09: Bezugsgroesse fuer die Pro-Typ-Prozente — totals.einsaetze ist
  // jetzt um Uebungen/verworfene bereinigt, daher die Summe aller Typen
  // separat bilden, damit die Anteile wieder 100 % ergeben.
  const proTypGesamt = stats
    ? stats.totals.pro_typ.alarm +
      stats.totals.pro_typ.manuell +
      stats.totals.pro_typ.lotsendienst +
      stats.totals.pro_typ.uebung
    : 0;

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <BarChart3 size={20} />
          Statistik · Jahresübersicht
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            className="themetoggle"
            style={{ width: 36, padding: 0, justifyContent: "center" }}
            aria-label="Vorheriges Jahr"
          >
            ‹
          </button>
          <strong style={{ fontSize: 16, minWidth: 60, textAlign: "center" }}>{year}</strong>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= currentYear}
            className="themetoggle"
            style={{ width: 36, padding: 0, justifyContent: "center" }}
            aria-label="Nächstes Jahr"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="themetoggle"
            style={{ width: "auto", padding: "0 12px", gap: 6 }}
            disabled={busy}
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{busy ? "lade …" : "Aktualisieren"}</span>
          </button>
        </div>
      </div>

      {err ? <ErrorBanner msg={err} /> : null}

      {!stats ? (
        <p style={{ color: "var(--fg-3)" }}>lade …</p>
      ) : (
        <>
          {/* KPI-Karten */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <KpiCard
              label="Einsätze gesamt"
              value={stats.totals.einsaetze}
              icon={<Calendar size={14} />}
              color="var(--info)"
            />
            {/* U-09: Uebungen zaehlen nicht mehr in "Einsaetze gesamt" —
                eigene KPI-Karte; Fallback auf pro_typ.uebung fuer aeltere
                Backend-Responses ohne totals.uebungen. */}
            <KpiCard
              label="Übungen"
              value={stats.totals.uebungen ?? stats.totals.pro_typ.uebung}
              icon={<GraduationCap size={14} />}
              color="var(--ok)"
            />
            <KpiCard
              label="Mannschaftsstunden gesamt"
              value={`${stats.totals.mannschaftStunden}`}
              unit="h"
              icon={<Users size={14} />}
              color="var(--fg)"
              // U-09: Einsatz/Uebung-Split als Unterzeile — nur wenn das
              // Backend die Split-Felder liefert; defensiv per ?? auf die
              // Gesamtsumme bzw. 0 zurueckfallen.
              sub={
                stats.totals.mannschaftStundenEinsatz != null ||
                stats.totals.mannschaftStundenUebung != null
                  ? `Einsatz ${stats.totals.mannschaftStundenEinsatz ?? stats.totals.mannschaftStunden} h · Übung ${stats.totals.mannschaftStundenUebung ?? 0} h`
                  : undefined
              }
            />
            <KpiCard
              label="AS-Träger"
              value={stats.totals.asTraeger}
              unit={stats.totals.asTraeger === 1 ? "Person" : "Personen"}
              icon={<Wind size={14} />}
              color="#1d4ed8"
            />
            <KpiCard
              label="AS-Stunden"
              value={`${stats.totals.asStunden}`}
              unit="h"
              icon={<Clock size={14} />}
              color="#1d4ed8"
            />
            <KpiCard
              label="KM Lotsendienst"
              value={`${stats.totals.kmLotsendienst}`}
              unit="km"
              icon={<MapPin size={14} />}
              color="var(--warn)"
            />
            <KpiCard
              label="KM gesamt"
              value={`${stats.totals.kmGesamt}`}
              unit="km"
              icon={<Truck size={14} />}
              color="var(--fg-2)"
            />
          </div>

          {/* Pro Typ Karten */}
          <h4 style={{ margin: "8px 0 10px", fontSize: 14, color: "var(--fg)" }}>Pro Typ</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <TypKpi
              label="Alarm-Einsätze"
              value={stats.totals.pro_typ.alarm}
              total={proTypGesamt}
              icon={<Flame size={14} />}
              color="var(--red)"
            />
            <TypKpi
              label="Manuelle Berichte"
              value={stats.totals.pro_typ.manuell}
              total={proTypGesamt}
              icon={<Activity size={14} />}
              color="var(--info)"
            />
            <TypKpi
              label="Lotsendienste"
              value={stats.totals.pro_typ.lotsendienst}
              total={proTypGesamt}
              icon={<Siren size={14} />}
              color="var(--warn)"
            />
            <TypKpi
              label="Übungen"
              value={stats.totals.pro_typ.uebung}
              total={proTypGesamt}
              icon={<GraduationCap size={14} />}
              color="var(--ok)"
            />
          </div>

          {/* Monats-Diagramm */}
          <h4 style={{ margin: "8px 0 10px", fontSize: 14, color: "var(--fg)" }}>
            Monatliche Verteilung
          </h4>
          <MonatsChart monate={stats.monate} jahr={year} />

          {/* Übungstypen */}
          {stats.uebungsTypen.length > 0 ? (
            <>
              <h4 style={{ margin: "20px 0 10px", fontSize: 14, color: "var(--fg)" }}>
                Übungsstunden pro Typ
              </h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--border)" }}>
                    <th style={archTh}>Übungstyp</th>
                    <th style={{ ...archTh, textAlign: "right" }}>Anzahl</th>
                    <th style={{ ...archTh, textAlign: "right" }}>Mannschaftsstunden</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.uebungsTypen.map((u) => (
                    <tr key={u.typ} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={archTd}>{u.typ}</td>
                      <td style={{ ...archTd, textAlign: "right", fontFamily: "var(--font-mono)" }}>{u.anzahl}</td>
                      <td style={{ ...archTd, textAlign: "right", fontFamily: "var(--font-mono)" }}>{u.stunden} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {/* Top-Einsatzarten */}
          {stats.topEinsatzarten.length > 0 ? (
            <>
              <h4 style={{ margin: "20px 0 10px", fontSize: 14, color: "var(--fg)" }}>
                Top-Einsatzarten (Alarm + Manuell)
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {stats.topEinsatzarten.map((a) => {
                  const max = stats.topEinsatzarten[0]?.anzahl ?? 1;
                  const pct = (a.anzahl / max) * 100;
                  return (
                    <div key={a.art} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                      <span style={{ flex: "0 0 200px", color: "var(--fg-2)" }}>{a.art}</span>
                      <div
                        style={{
                          flex: 1,
                          height: 22,
                          background: "var(--surface-2)",
                          borderRadius: 4,
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background:
                              "linear-gradient(90deg, var(--red) 0%, color-mix(in srgb, var(--red) 70%, transparent) 100%)",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          flex: "0 0 50px",
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          color: "var(--fg)",
                        }}
                      >
                        {a.anzahl}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <p
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px dashed var(--border)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Zeitraum {stats.range.from} bis {stats.range.to} · generiert {new Date(stats.generatedAt).toLocaleString("de-AT")}
          </p>
        </>
      )}
    </section>
  );
}

function KpiCard({
  label,
  value,
  unit,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
  /** U-09: optionale Unterzeile, z. B. Einsatz/Uebung-Split der Stunden.
   *  `| undefined` wegen exactOptionalPropertyTypes (bedingtes Prop). */
  sub?: string | undefined;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {icon} {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
        {value}
        {unit ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-2)", marginLeft: 4 }}>
            {unit}
          </span>
        ) : null}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            color: "var(--fg-3)",
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function TypKpi({
  label,
  value,
  total,
  icon,
  color,
}: {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: `color-mix(in srgb, ${color} 10%, var(--surface-2))`,
        border: `1px solid color-mix(in srgb, ${color} 40%, var(--border))`,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {icon} {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}>
          {pct}%
        </div>
      </div>
    </div>
  );
}

const MONATS_KURZ = ["Jän", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function MonatsChart({ monate, jahr }: { monate: StatsResponse["monate"]; jahr: number }) {
  // 12-Monats-Skelett damit alle Monate visualisiert sind, auch leere
  const monatsMap = new Map(monate.map((m) => [m.monat, m]));
  const fullYear = Array.from({ length: 12 }, (_, i) => {
    const key = `${jahr}-${String(i + 1).padStart(2, "0")}`;
    return monatsMap.get(key) ?? { monat: key, alarm: 0, manuell: 0, lotsendienst: 0, uebung: 0 };
  });
  const maxValue = Math.max(
    ...fullYear.map((m) => m.alarm + m.manuell + m.lotsendienst + m.uebung),
    1,
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: 6,
        padding: 14,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      {fullYear.map((m, i) => {
        const total = m.alarm + m.manuell + m.lotsendienst + m.uebung;
        const heightPct = (total / maxValue) * 100;
        return (
          <div key={m.monat} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: "100%",
                height: 120,
                display: "flex",
                flexDirection: "column-reverse",
                justifyContent: "flex-start",
                gap: 1,
                position: "relative",
              }}
              title={`${MONATS_KURZ[i]}: ${total} (Alarm ${m.alarm}, Manuell ${m.manuell}, Lotse ${m.lotsendienst}, Übung ${m.uebung})`}
            >
              {total === 0 ? (
                <div
                  style={{
                    height: 4,
                    width: "100%",
                    background: "var(--border)",
                    alignSelf: "flex-end",
                    borderRadius: 2,
                  }}
                />
              ) : (
                <div
                  style={{
                    height: `${heightPct}%`,
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    borderRadius: "4px 4px 2px 2px",
                    overflow: "hidden",
                  }}
                >
                  {m.alarm > 0 ? (
                    <div style={{ flex: m.alarm, background: "var(--red)" }} />
                  ) : null}
                  {m.manuell > 0 ? (
                    <div style={{ flex: m.manuell, background: "var(--info)" }} />
                  ) : null}
                  {m.lotsendienst > 0 ? (
                    <div style={{ flex: m.lotsendienst, background: "var(--warn)" }} />
                  ) : null}
                  {m.uebung > 0 ? (
                    <div style={{ flex: m.uebung, background: "var(--ok)" }} />
                  ) : null}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--fg-3)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {MONATS_KURZ[i]}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                color: total === 0 ? "var(--fg-3)" : "var(--fg)",
              }}
            >
              {total}
            </div>
          </div>
        );
      })}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
        <ChartLegend color="var(--red)" label="Alarm" />
        <ChartLegend color="var(--info)" label="Manuell" />
        <ChartLegend color="var(--warn)" label="Lotsendienst" />
        <ChartLegend color="var(--ok)" label="Übung" />
      </div>
    </div>
  );
}

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--fg-2)",
        fontWeight: 600,
      }}
    >
      <span style={{ width: 12, height: 12, background: color, borderRadius: 3 }} />
      {label}
    </span>
  );
}
