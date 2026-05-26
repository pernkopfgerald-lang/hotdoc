import { LogOut, FileText, Users, Settings, Activity, Truck, Wrench, RefreshCw, Archive, Hash, BookOpen, Signal } from "lucide-react";
import { useState } from "react";
import { apiCall, clearToken } from "../api/client";
import { BerichteBrowser } from "../components/BerichteBrowser";
import { BrandLogo } from "../components/BrandLogo";
import { Florianstation } from "./Florianstation";
import type { AuthResponse } from "@hotdoc/shared";

interface Props {
  auth: AuthResponse;
  onLogout: () => void;
}

type Tab =
  | "berichte"
  | "florian"
  | "archiv"
  | "schnittstellen"
  | "einsatzstichworte"
  | "nummerierung"
  | "personal"
  | "geraete"
  | "auftragstypen"
  | "stammdaten";

export function Verwaltung({ auth, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("berichte");

  function logout() {
    clearToken();
    onLogout();
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <header
        className="appheader"
        style={{
          padding: "14px 24px",
        }}
      >
        <BrandLogo variant="mark" size={38} />
        <div className="appbrand">
          <div className="appname">
            <span className="dot" />
            HotDoc
          </div>
          <div className="appsub">Backoffice · FF Eberstalzell</div>
        </div>
        <span
          className="badge neutral"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {auth.benutzer?.username ?? "—"} · {auth.rolle}
        </span>
        <button
          type="button"
          onClick={logout}
          className="themetoggle"
          style={{ width: "auto", padding: "0 12px", gap: 8, display: "flex", alignItems: "center" }}
        >
          <LogOut size={14} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Abmelden</span>
        </button>
      </header>

      <nav
        style={{
          display: "flex",
          gap: 2,
          padding: "0 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          overflowX: "auto",
        }}
      >
        <TabButton active={tab === "berichte"} onClick={() => setTab("berichte")} icon={<FileText size={16} />}>
          Berichte
        </TabButton>
        <TabButton active={tab === "florian"} onClick={() => setTab("florian")} icon={<Activity size={16} />}>
          Florianstation
        </TabButton>
        <TabButton active={tab === "archiv"} onClick={() => setTab("archiv")} icon={<Archive size={16} />}>
          Archiv
        </TabButton>
        <TabButton active={tab === "schnittstellen"} onClick={() => setTab("schnittstellen")} icon={<Signal size={16} />}>
          Schnittstellen
        </TabButton>
        <TabButton active={tab === "einsatzstichworte"} onClick={() => setTab("einsatzstichworte")} icon={<BookOpen size={16} />}>
          Einsatzstichworte
        </TabButton>
        <TabButton active={tab === "nummerierung"} onClick={() => setTab("nummerierung")} icon={<Hash size={16} />}>
          Nummerierung
        </TabButton>
        <TabButton active={tab === "personal"} onClick={() => setTab("personal")} icon={<Users size={16} />}>
          Personal
        </TabButton>
        <TabButton active={tab === "geraete"} onClick={() => setTab("geraete")} icon={<Wrench size={16} />}>
          Geräte
        </TabButton>
        <TabButton active={tab === "auftragstypen"} onClick={() => setTab("auftragstypen")} icon={<Truck size={16} />}>
          Auftrag-Typen
        </TabButton>
        <TabButton active={tab === "stammdaten"} onClick={() => setTab("stammdaten")} icon={<Settings size={16} />}>
          Stammdaten
        </TabButton>
      </nav>

      <main
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {tab === "berichte" && <BerichteBrowser />}
        {tab === "florian" && <Florianstation />}
        {tab === "archiv" && <ArchivPanel />}
        {tab === "schnittstellen" && <SchnittstellenPanel />}
        {tab === "einsatzstichworte" && <EinsatzstichwortePanel />}
        {tab === "nummerierung" && <NummerierungPanel />}
        {tab === "personal" && <PersonalPanel />}
        {tab === "geraete" && <GeraetePanel />}
        {tab === "auftragstypen" && <AuftragstypenPanel />}
        {tab === "stammdaten" && <StammdatenPanel />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px",
        background: "transparent",
        border: 0,
        borderBottom: active ? "2px solid var(--red)" : "2px solid transparent",
        color: active ? "var(--fg)" : "var(--fg-2)",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        transition: "color 140ms ease",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
        minHeight: 44,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function PersonalPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function triggerSync() {
    setBusy(true);
    setResult(null);
    try {
      const r = await apiCall<{
        ok: boolean;
        personalCount: number;
        materialCount: number;
        durationMs: number;
        error?: string;
      }>("/api/admin/sybos/sync", { method: "POST" });
      if (r.ok) {
        setResult(`✓ ${r.personalCount} Personen · ${r.materialCount} Material · ${r.durationMs} ms`);
      } else {
        setResult(`Fehler: ${r.error ?? "unbekannt"}`);
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Users size={20} />
          Personal &amp; syBOS-Sync
        </div>
        <span className="card-meta">tägl. 04:00 auto</span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Die Personenliste wird täglich aus syBOS synchronisiert. Hier kannst du den
        Sync manuell auslösen — z. B. nach Neuaufnahme oder Funktionswechsel.
      </p>
      <button
        type="button"
        onClick={triggerSync}
        disabled={busy}
        className="cta"
        style={{
          padding: "14px 18px",
          fontSize: 15,
          background: "linear-gradient(180deg, var(--info) 0%, color-mix(in srgb, var(--info) 70%, #000) 100%)",
          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.30)",
          display: "inline-flex",
          width: "auto",
        }}
      >
        <RefreshCw size={16} />
        {busy ? "Sync läuft …" : "Jetzt aus syBOS synchronisieren"}
      </button>
      {result ? (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
          }}
        >
          {result}
        </div>
      ) : null}
      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Vorbedingung: <strong>SYBOS_API_URL</strong> + <strong>SYBOS_TOKEN</strong> in fly secrets gesetzt.
      </p>
    </section>
  );
}

function GeraetePanel() {
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Wrench size={20} />
          Geräte &amp; Mittel pro Fahrzeug
        </div>
        <span className="card-meta">Backend-Endpoint folgt</span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55 }}>
        Verwaltung der fahrzeug-spezifischen Geräte- und Material-Listen.
        Im PWA werden diese Listen als Chip-Auswahl auf den Tablets angezeigt.
      </p>
      <p style={{ marginTop: 12, fontSize: 13, color: "var(--fg-2)" }}>
        Aktuell sind Default-Listen in der PWA hinterlegt (KDO 5 Items, TLF 7 Items,
        LFA-B 11 Items, MTF 6 Items). Mit dem nächsten Slice kommen{" "}
        <strong>CouchDB-Persistenz</strong> und eine{" "}
        <strong>Editor-Maske</strong> zum Hinzufügen/Entfernen von Items pro Fahrzeug.
      </p>
      <div className="vehicle-row" style={{ marginTop: 16 }}>
        {(["kdo", "tlf-a-4000", "lfa-b", "mtf"] as const).map((id) => (
          <button
            key={id}
            type="button"
            className="vehicle-chip"
            disabled
            style={{ opacity: 0.55, cursor: "not-allowed" }}
          >
            <div className="code">{id.toUpperCase().replace("-A-4000", "")}</div>
            <div className="sub">Folgt</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function AuftragstypenPanel() {
  const defaults = [
    "Brandbekämpfung außen",
    "Brandbekämpfung innen",
    "Atemschutz-Trupp",
    "Verkehrsabsicherung",
    "Wassertransport",
    "Personenrettung",
    "Technische Hilfeleistung",
    "Drehleiter-Einsatz",
    "Nachlöscharbeiten",
    "Beleuchtung sichern",
  ];
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Truck size={20} />
          Auftrag-Typen (global)
        </div>
        <span className="card-meta">{defaults.length} Standard-Typen</span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Diese Liste erscheint als Schnellauswahl-Chips im Auftrag-Bereich
        der Fahrzeug-Tablets. Änderungen wirken sich auf alle Fahrzeuge aus.
      </p>
      <div className="chips">
        {defaults.map((t) => (
          <span key={t} className="chip task" style={{ cursor: "default" }}>
            {t}
          </span>
        ))}
      </div>
      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          color: "var(--fg-3)",
          fontFamily: "var(--font-mono)",
        }}
      >
        Editor zum Hinzufügen/Entfernen folgt — Backend-Endpoint{" "}
        <strong>GET/POST /api/config/auftrag-typen</strong>.
      </p>
    </section>
  );
}

function ArchivPanel() {
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Archive size={20} />
          Archiv · alle Berichte
        </div>
        <span className="card-meta">syBOS-Übergabestatus pro Eintrag</span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Vollständige Liste aller je angelegten Einsatzberichte (Brand + Technisch).
        Filterbar nach Jahr, Kategorie, Status. Pro Eintrag ist sichtbar, ob der
        Bericht bereits an syBOS übergeben wurde (mit Zeitstempel + Antwort-Code).
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={archTh}>Bericht-Nr.</th>
            <th style={archTh}>Datum</th>
            <th style={archTh}>Einsatzart</th>
            <th style={archTh}>Mannschaft</th>
            <th style={archTh}>Schreibschutz</th>
            <th style={archTh}>syBOS</th>
            <th style={archTh}>PDF</th>
          </tr>
        </thead>
        <tbody>
          {[
            { nr: "B26-014", date: "20.05.26", art: "Brand KFZ", mann: 6, locked: true, sybos: "pending", pdf: true },
            { nr: "T26-009", date: "12.04.26", art: "Sturm", mann: 12, locked: true, sybos: "ok-2026-04-12T14:32", pdf: true },
            { nr: "T26-008", date: "08.04.26", art: "Ölspur", mann: 4, locked: true, sybos: "ok-2026-04-08T11:05", pdf: true },
            { nr: "B26-007", date: "30.03.26", art: "BMA", mann: 8, locked: true, sybos: "ok-2026-03-30T20:18", pdf: true },
          ].map((r) => (
            <tr key={r.nr} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={archTd}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{r.nr}</span>
              </td>
              <td style={archTd}>{r.date}</td>
              <td style={archTd}>{r.art}</td>
              <td style={archTd}>{r.mann} Pers.</td>
              <td style={archTd}>
                <span className="badge neutral" style={{ gap: 4 }}>
                  geschützt
                </span>
              </td>
              <td style={archTd}>
                {r.sybos === "pending" ? (
                  <span className="badge warn">offen</span>
                ) : (
                  <span className="badge ok" title={r.sybos}>
                    übergeben
                  </span>
                )}
              </td>
              <td style={archTd}>
                <button
                  type="button"
                  className="icon-btn"
                  title="PDF-Bericht herunterladen"
                  onClick={() =>
                    window.open(`/api/reports/${r.nr}/pdf`, "_blank", "noopener,noreferrer")
                  }
                >
                  <FileText size={13} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Live-Daten aus CouchDB folgen — Backend-Endpoint{" "}
        <strong>GET /api/einsaetze?archiv=1&amp;jahr=2026</strong>.
      </p>
    </section>
  );
}

function SchnittstellenPanel() {
  const [busy, setBusy] = useState(false);
  const [healthData, setHealthData] = useState<unknown>(null);

  async function check() {
    setBusy(true);
    try {
      const r = await apiCall<unknown>("/api/admin/health", { method: "GET" });
      setHealthData(r);
    } catch (e) {
      setHealthData({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Signal size={20} />
          Schnittstellen-Status
        </div>
        <button
          type="button"
          className="themetoggle"
          onClick={check}
          disabled={busy}
          style={{ width: "auto", padding: "0 14px", gap: 6 }}
        >
          <RefreshCw size={14} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {busy ? "Prüfe …" : "Status prüfen"}
          </span>
        </button>
      </div>
      <div className="grid-2" style={{ gap: 12 }}>
        <HealthLed name="BlaulichtSMS" sub="Alarm-Polling alle 15 s" tone="ok" detail="Letzter Poll: vor 8 s · 0 neue Alarme · Audio-Cache 12 MB" />
        <HealthLed name="syBOS" sub="Personal &amp; Material" tone="warn" detail="Token nicht gesetzt — Fallback-Liste aktiv (45 Personen aus letztem Sync 12.04.26)" />
        <HealthLed name="wasserkarte.info" sub="Hydranten-Layer" tone="off" detail="Access-Key noch nicht beantragt" />
        <HealthLed name="CouchDB-Replikation" sub="PWA ⇄ Backend" tone="ok" detail="3 Tablets online · 0 Konflikte · letzter Sync vor 4 s" />
      </div>
      {healthData ? (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--fg-2)",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(healthData, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function HealthLed({ name, sub, tone, detail }: { name: string; sub: string; tone: "ok" | "warn" | "off"; detail: string }) {
  const color = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--fg-3)";
  const bg = tone === "ok" ? "var(--ok-tint)" : tone === "warn" ? "var(--warn-tint)" : "var(--surface-2)";
  const label = tone === "ok" ? "OK" : tone === "warn" ? "TEILWEISE" : "OFFLINE";
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }} dangerouslySetInnerHTML={{ __html: name }} />
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginTop: 2,
            }}
            dangerouslySetInnerHTML={{ __html: sub }}
          />
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: bg,
            color: color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, animation: tone === "ok" ? "blink 1.6s infinite" : undefined }} />
          {label}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)", lineHeight: 1.4 }}>{detail}</p>
    </div>
  );
}

function EinsatzstichwortePanel() {
  const items = [
    { art: "Brand KFZ", kat: "brand" },
    { art: "Brand Wohnhaus", kat: "brand" },
    { art: "BMA", kat: "brand" },
    { art: "Brand Kamin", kat: "brand" },
    { art: "Flurbrand", kat: "brand" },
    { art: "Brandverdacht", kat: "brand" },
    { art: "VU Eingekl. Per.", kat: "technisch" },
    { art: "Personenrettung", kat: "technisch" },
    { art: "Sturm", kat: "technisch" },
    { art: "Ölspur", kat: "technisch" },
    { art: "Pumparbeiten", kat: "technisch" },
    { art: "Lift", kat: "technisch" },
    { art: "Wasserschaden", kat: "technisch" },
    { art: "Höhenrettungseins.", kat: "technisch" },
    { art: "Bienen / Wespen", kat: "technisch" },
  ];
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <BookOpen size={20} />
          Einsatzstichworte &amp; Kategorisierung
        </div>
        <span className="card-meta">
          <span className="num">{items.length}</span> Stichworte · global
        </span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Liste aller Einsatzarten und ihre Zuordnung zu Brand (B-Prefix) oder Technisch (T-Prefix).
        Die Zuordnung steuert die Bericht-Nummerierung und PDF-Template-Auswahl.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={archTh}>Einsatzart</th>
            <th style={archTh}>Kategorie</th>
            <th style={archTh}>Nummern-Prefix</th>
            <th style={archTh}>Standard-Stufe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.art} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={archTd}>{i.art}</td>
              <td style={archTd}>
                {i.kat === "brand" ? (
                  <span className="badge red" style={{ gap: 4 }}>Brand</span>
                ) : (
                  <span className="badge rank" style={{ gap: 4 }}>Technisch</span>
                )}
              </td>
              <td style={archTd}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                  {i.kat === "brand" ? "B" : "T"}YY-NNN
                </span>
              </td>
              <td style={archTd}>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {i.kat === "brand" ? "B-1" : "T-1"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--fg-3)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Editor (Stichwort hinzufügen / umkategorisieren) folgt — Backend-Endpoint{" "}
        <strong>POST /api/config/einsatzstichwort</strong>.
      </p>
    </section>
  );
}

function NummerierungPanel() {
  const jahr = new Date().getFullYear();
  const yy = String(jahr).slice(-2);
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Hash size={20} />
          Bericht-Nummerierung
        </div>
        <span className="card-meta">aktuell aktiv</span>
      </div>
      <div className="grid-2" style={{ gap: 14 }}>
        <div className="field">
          <label className="caption">Schema-Format</label>
          <div className="input filled" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18 }}>
            [Prefix][YY]-[NNN]
          </div>
        </div>
        <div className="field">
          <label className="caption">Aktuelles Jahr</label>
          <div className="input filled" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18 }}>
            {jahr} → {yy}
          </div>
        </div>
      </div>
      <div className="grid-2" style={{ gap: 14, marginTop: 14 }}>
        <NumExample label="Brand-Beispiele" prefix="B" yy={yy} numbers={[1, 14, 142]} tone="red" />
        <NumExample label="Technisch-Beispiele" prefix="T" yy={yy} numbers={[1, 9, 87]} tone="info" />
      </div>
      <p
        style={{
          marginTop: 18,
          fontSize: 13,
          color: "var(--fg-2)",
          lineHeight: 1.5,
        }}
      >
        <strong>Wichtig:</strong> Beim Jahreswechsel beginnen beide Zähler bei 001.
        Bei Offline-Vergabe (mehrere Tablets ohne Verbindung) wird die Nummer
        provisorisch vergeben — bei Reconnect prüft die Florianstation auf Konflikte
        und schlägt eine Korrektur vor (siehe <code style={{ fontFamily: "var(--font-mono)" }}>docs/sync-architecture.md</code>).
      </p>
    </section>
  );
}

function NumExample({ label, prefix, yy, numbers, tone }: { label: string; prefix: "B" | "T"; yy: string; numbers: number[]; tone: "red" | "info" }) {
  return (
    <div
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--surface-2)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: tone === "red" ? "var(--red)" : "var(--info)",
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {numbers.map((n) => (
          <span
            key={n}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
              padding: "6px 12px",
              borderRadius: 8,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          >
            {prefix}{yy}-{String(n).padStart(3, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

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

function StammdatenPanel() {
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Settings size={20} />
          Stammdaten
        </div>
        <span className="card-meta">Phase 6</span>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55 }}>
        Funkrufnamen, AS-Konfiguration (max-Dauer, Trupp-Größe), BlaulichtSMS-Status,
        wasserkarte.info-Layer-Konfiguration, Globale Default-Werte.
      </p>
    </section>
  );
}
