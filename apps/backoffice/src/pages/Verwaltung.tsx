import { LogOut, FileText, Users, Settings, Activity, Truck, Wrench, RefreshCw } from "lucide-react";
import { useState } from "react";
import { apiCall, clearToken } from "../api/client";
import { BerichteBrowser } from "../components/BerichteBrowser";
import { Florianstation } from "./Florianstation";
import type { AuthResponse } from "@hotdoc/shared";

interface Props {
  auth: AuthResponse;
  onLogout: () => void;
}

type Tab = "berichte" | "florian" | "personal" | "geraete" | "auftragstypen" | "stammdaten";

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
        <span
          className="applogo"
          aria-hidden
          style={{ width: 38, height: 38, borderRadius: 11 }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={22} height={22}>
            <path
              d="M12 2c.5 4 4 5.5 4 9.5 0 3.6-1.8 6.5-4 6.5s-4-2.9-4-6.5C8 9 9.5 8 12 2z"
              fill="#E63946"
            />
            <path
              d="M12 7c0 3 2 4 2 6.5s-1 3.5-2 3.5-2-1-2-3.5S12 10 12 7z"
              fill="#FFB703"
            />
            <circle cx="12" cy="20.5" r="1.8" fill="#FFB703" />
          </svg>
        </span>
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
