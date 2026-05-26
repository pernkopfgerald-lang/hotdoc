import { LogOut, FileText, Users, Settings, Activity, Truck, Wrench, RefreshCw, Archive, Hash, BookOpen, Signal, Plus, X, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiCall, clearToken } from "../api/client";
import { getConfig, putConfig, type AuftragstypenData, type EinsatzstichworteData, type GeraeteData, type StammdatenData } from "../api/config";
import { listEinsaetze, type EinsatzListItem } from "../api/einsaetze";
import { BerichteBrowser } from "../components/BerichteBrowser";
import { BrandLogo } from "../components/BrandLogo";
import { Florianstation } from "./Florianstation";
import type { AuthResponse } from "@hotdoc/shared";

/** Kleine Helper-Form für „Item hinzufügen"-Pattern. */
function AddItemForm({ onAdd, placeholder }: { onAdd: (text: string) => void; placeholder: string }) {
  const [text, setText] = useState("");
  return (
    <div className="freeform" style={{ marginTop: 0 }}>
      <input
        type="text"
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd(text);
            setText("");
          }
        }}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="add-btn"
        onClick={() => {
          onAdd(text);
          setText("");
        }}
        disabled={!text.trim()}
        aria-label="Hinzufügen"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--red-tint)",
        color: "var(--red)",
        fontSize: 13,
        border: "1px solid var(--red-border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <AlertTriangle size={14} /> {msg}
    </div>
  );
}

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
  const [data, setData] = useState<GeraeteData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeFzg, setActiveFzg] = useState<string>("lfa-b");

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<GeraeteData>("geraete");
        setData(r.data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function save() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await putConfig("geraete", data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function addItem(fzg: string, bezeichnung: string) {
    if (!data || !bezeichnung.trim()) return;
    const id = bezeichnung
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c]!)
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setData({
      ...data,
      byFahrzeug: {
        ...data.byFahrzeug,
        [fzg]: [...(data.byFahrzeug[fzg] ?? []), { id, bezeichnung: bezeichnung.trim() }],
      },
    });
  }

  function removeItem(fzg: string, id: string) {
    if (!data) return;
    setData({
      ...data,
      byFahrzeug: {
        ...data.byFahrzeug,
        [fzg]: (data.byFahrzeug[fzg] ?? []).filter((it) => it.id !== id),
      },
    });
  }

  const items = data?.byFahrzeug[activeFzg] ?? [];
  const fahrzeuge = ["kdo", "tlf-a-4000", "lfa-b", "mtf"] as const;
  const labels: Record<string, string> = {
    kdo: "KDO",
    "tlf-a-4000": "TANK",
    "lfa-b": "LFA-B",
    mtf: "MTF",
  };

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Wrench size={20} />
          Geräte &amp; Mittel pro Fahrzeug
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved ? <span className="badge ok">gespeichert</span> : null}
          <button
            type="button"
            className="cta"
            onClick={save}
            disabled={busy || !data}
            style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
          >
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>

      {err ? <ErrorBanner msg={err} /> : null}

      <div className="vehicle-row" style={{ marginBottom: 16 }}>
        {fahrzeuge.map((id) => (
          <button
            key={id}
            type="button"
            className={`vehicle-chip${activeFzg === id ? " active" : ""}`}
            onClick={() => setActiveFzg(id)}
          >
            <div className="code">{labels[id]}</div>
            <div className="sub">{(data?.byFahrzeug[id] ?? []).length} Items</div>
          </button>
        ))}
      </div>

      {data ? (
        <>
          <div className="chips" style={{ marginBottom: 12 }}>
            {items.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--fg-3)" }}>Noch keine Geräte für {labels[activeFzg]}</span>
            ) : (
              items.map((it) => (
                <span key={it.id} className="chip selected" style={{ gap: 8, cursor: "default" }}>
                  <span className="dot" />
                  {it.bezeichnung}
                  <button
                    type="button"
                    onClick={() => removeItem(activeFzg, it.id)}
                    aria-label="Entfernen"
                    style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, marginLeft: 4, display: "inline-flex" }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))
            )}
          </div>
          <AddItemForm onAdd={(t) => addItem(activeFzg, t)} placeholder={`Neues Gerät für ${labels[activeFzg]} …`} />
        </>
      ) : (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      )}
    </section>
  );
}

function AuftragstypenPanel() {
  const [data, setData] = useState<AuftragstypenData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<AuftragstypenData>("auftragstypen");
        setData(r.data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function save() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await putConfig("auftragstypen", data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add(text: string) {
    if (!data || !text.trim()) return;
    setData({ ...data, items: [...data.items, text.trim()] });
  }
  function remove(text: string) {
    if (!data) return;
    setData({ ...data, items: data.items.filter((t) => t !== text) });
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Truck size={20} />
          Auftrag-Typen (global)
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved ? <span className="badge ok">gespeichert</span> : null}
          <span className="card-meta">
            <span className="num">{data?.items.length ?? 0}</span> Typen
          </span>
          <button
            type="button"
            className="cta"
            onClick={save}
            disabled={busy || !data}
            style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
          >
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Diese Liste erscheint als Schnellauswahl-Chips im Auftrag-Bereich der Fahrzeug-Tablets. Änderungen wirken sich auf alle Fahrzeuge aus, sobald die Tablets das nächste Mal online sind.
      </p>
      {err ? <ErrorBanner msg={err} /> : null}
      {data ? (
        <>
          <div className="chips" style={{ marginBottom: 12 }}>
            {data.items.map((t) => (
              <span key={t} className="chip task selected" style={{ gap: 8 }}>
                <span className="dot" />
                {t}
                <button
                  type="button"
                  onClick={() => remove(t)}
                  aria-label="Entfernen"
                  style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, marginLeft: 4, display: "inline-flex" }}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <AddItemForm onAdd={add} placeholder="Neuer Auftrag-Typ …" />
        </>
      ) : (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      )}
    </section>
  );
}

function ArchivPanel() {
  const [items, setItems] = useState<EinsatzListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | "aktiv" | "abgeschlossen">("alle");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await listEinsaetze(filter === "alle" ? undefined : filter);
      setItems(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Archive size={20} />
          Archiv · alle Berichte
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="chips">
            {(["alle", "aktiv", "abgeschlossen"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="chip"
                style={
                  filter === f
                    ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
                    : undefined
                }
              >
                {f === "alle" ? "Alle" : f === "aktiv" ? "Aktiv" : "Abgeschlossen"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="themetoggle"
            onClick={() => void load()}
            style={{ width: "auto", padding: "0 12px", gap: 6 }}
          >
            <RefreshCw size={13} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Refresh</span>
          </button>
        </div>
      </div>
      {err ? <ErrorBanner msg={err} /> : null}
      {!items ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13, padding: 16, textAlign: "center" }}>
          Keine Einsätze gefunden ({filter}).
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={archTh}>Bericht-Nr / ID</th>
              <th style={archTh}>Datum</th>
              <th style={archTh}>Einsatzart</th>
              <th style={archTh}>Ort</th>
              <th style={archTh}>Status</th>
              <th style={archTh}>Quelle</th>
              <th style={archTh}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it._id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={archTd}>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11 }}>
                    {it._id.replace(/^einsatz:/, "").slice(0, 18)}
                    {it._id.length > 24 ? "…" : ""}
                  </span>
                </td>
                <td style={archTd}>{formatDate(it.alarmierungZeit)}</td>
                <td style={archTd}>{it.einsatzart ?? it.einsatzartFreitext ?? "—"}</td>
                <td style={archTd} title={it.einsatzort}>
                  {it.einsatzort.length > 32 ? it.einsatzort.slice(0, 32) + "…" : it.einsatzort}
                </td>
                <td style={archTd}>
                  {it.status === "aktiv" ? (
                    <span className="badge ok" style={{ gap: 4 }}>aktiv</span>
                  ) : (
                    <span className="badge neutral" style={{ gap: 4 }}>geschützt</span>
                  )}
                </td>
                <td style={archTd}>
                  <span className="badge neutral" style={{ fontSize: 9 }}>
                    {it.einsatzTyp === "manuell" ? "MAN" : "BLM"}
                  </span>
                </td>
                <td style={archTd}>
                  <button
                    type="button"
                    className="icon-btn"
                    title="PDF-Bericht herunterladen"
                    onClick={() =>
                      window.open(
                        `/api/einsaetze/${encodeURIComponent(it._id)}/pdf`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <FileText size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p
        style={{
          marginTop: 16,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {items?.length ?? 0} Einträge · syBOS-Übergabe-Tracking folgt mit Phase 7
      </p>
    </section>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return iso;
  }
}

interface HealthItem {
  key: "blaulichtsms" | "sybos" | "wasserkarte" | "couch";
  name: string;
  sub: string;
  state: "ok" | "warn" | "off" | "error";
  detail: string;
  metrics?: Record<string, number | string>;
}

function SchnittstellenPanel() {
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiCall<{ items: HealthItem[]; checkedAt: string }>("/api/admin/health");
      setItems(r.items);
      setCheckedAt(r.checkedAt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Signal size={20} />
          Schnittstellen-Status
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {checkedAt ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              geprüft {formatChecked(checkedAt)}
            </span>
          ) : null}
          <button
            type="button"
            className="themetoggle"
            onClick={() => void load()}
            disabled={busy}
            style={{ width: "auto", padding: "0 14px", gap: 6 }}
          >
            <RefreshCw size={14} className={busy ? "spin" : undefined} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {busy ? "Prüfe …" : "Status prüfen"}
            </span>
          </button>
        </div>
      </div>
      {err ? (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "var(--red-tint)",
            color: "var(--red)",
            fontSize: 13,
            border: "1px solid var(--red-border)",
          }}
        >
          {err}
        </div>
      ) : null}
      <div className="grid-2" style={{ gap: 12 }}>
        {items
          ? items.map((it) => <HealthLed key={it.key} item={it} />)
          : !err
            ? Array.from({ length: 4 }).map((_, i) => <HealthSkeleton key={i} />)
            : null}
      </div>
    </section>
  );
}

function HealthLed({ item }: { item: HealthItem }) {
  const color =
    item.state === "ok"
      ? "var(--ok)"
      : item.state === "warn"
        ? "var(--warn)"
        : item.state === "error"
          ? "var(--red)"
          : "var(--fg-3)";
  const bg =
    item.state === "ok"
      ? "var(--ok-tint)"
      : item.state === "warn"
        ? "var(--warn-tint)"
        : item.state === "error"
          ? "var(--red-tint)"
          : "var(--surface-2)";
  const label =
    item.state === "ok"
      ? "OK"
      : item.state === "warn"
        ? "TEILWEISE"
        : item.state === "error"
          ? "FEHLER"
          : "OFF";
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
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg)" }}>{item.name}</div>
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
          >
            {item.sub}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            borderRadius: 999,
            background: bg,
            color,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: color,
              animation: item.state === "ok" ? "blink 1.6s infinite" : undefined,
            }}
          />
          {label}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--fg-2)", lineHeight: 1.45 }}>{item.detail}</p>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div
      style={{
        padding: 14,
        height: 96,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--surface-2)",
        opacity: 0.6,
      }}
    />
  );
}

function formatChecked(iso: string): string {
  const ageSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (ageSec < 30) return "gerade";
  if (ageSec < 60) return `vor ${ageSec} s`;
  if (ageSec < 3600) return `vor ${Math.floor(ageSec / 60)} min`;
  return new Date(iso).toLocaleString("de-AT");
}

function EinsatzstichwortePanel() {
  const [data, setData] = useState<EinsatzstichworteData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<EinsatzstichworteData>("einsatzstichworte");
        setData(r.data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function save() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await putConfig("einsatzstichworte", data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add(art: string) {
    if (!data || !art.trim()) return;
    if (data.items.find((i) => i.art === art.trim())) return;
    setData({ ...data, items: [...data.items, { art: art.trim(), kategorie: "technisch" }] });
  }
  function remove(art: string) {
    if (!data) return;
    setData({ ...data, items: data.items.filter((i) => i.art !== art) });
  }
  function toggleKategorie(art: string) {
    if (!data) return;
    setData({
      ...data,
      items: data.items.map((i) =>
        i.art === art ? { ...i, kategorie: i.kategorie === "brand" ? "technisch" : "brand" } : i,
      ),
    });
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <BookOpen size={20} />
          Einsatzstichworte &amp; Kategorisierung
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved ? <span className="badge ok">gespeichert</span> : null}
          <span className="card-meta">
            <span className="num">{data?.items.length ?? 0}</span> Stichworte
          </span>
          <button
            type="button"
            className="cta"
            onClick={save}
            disabled={busy || !data}
            style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
          >
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Klick auf die Kategorie-Pille toggelt zwischen Brand und Technisch. Steuert das Nummerierungs-Prefix (B / T) und das PDF-Template.
      </p>
      {err ? <ErrorBanner msg={err} /> : null}
      {data ? (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={archTh}>Einsatzart</th>
                <th style={archTh}>Kategorie</th>
                <th style={archTh}>Nr-Prefix</th>
                <th style={archTh}>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.art} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={archTd}>{i.art}</td>
                  <td style={archTd}>
                    <button
                      type="button"
                      onClick={() => toggleKategorie(i.art)}
                      className={i.kategorie === "brand" ? "badge red" : "badge rank"}
                      style={{
                        gap: 4,
                        cursor: "pointer",
                        border: "1px solid currentColor",
                        background: "transparent",
                        fontFamily: "var(--font-mono)",
                      }}
                      title="Klick zum Umschalten"
                    >
                      {i.kategorie === "brand" ? "Brand" : "Technisch"}
                    </button>
                  </td>
                  <td style={archTd}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                      {i.kategorie === "brand" ? "B" : "T"}YY-NNN
                    </span>
                  </td>
                  <td style={archTd}>
                    <button
                      type="button"
                      onClick={() => remove(i.art)}
                      className="icon-btn danger"
                      aria-label="Entfernen"
                    >
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <AddItemForm onAdd={add} placeholder="Neue Einsatzart (Default-Kategorie: technisch) …" />
        </>
      ) : (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      )}
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
  const [data, setData] = useState<StammdatenData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<StammdatenData>("stammdaten");
        setData(r.data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function save() {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await putConfig("stammdaten", data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="card">
        <p style={{ color: "var(--fg-3)" }}>lade …</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Settings size={20} />
          Stammdaten
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved ? <span className="badge ok">gespeichert</span> : null}
          <button
            type="button"
            className="cta"
            onClick={save}
            disabled={busy}
            style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}
          >
            {busy ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </div>
      {err ? <ErrorBanner msg={err} /> : null}

      <h4 style={{ margin: "8px 0 12px", fontSize: 14, color: "var(--fg)" }}>Funkrufnamen</h4>
      <div className="grid-2" style={{ gap: 12, marginBottom: 18 }}>
        {(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"] as const).map((id) => (
          <div className="field" key={id}>
            <label className="caption">{id.toUpperCase()}</label>
            <input
              className="input"
              value={data.funkrufnamen?.[id] ?? ""}
              onChange={(e) =>
                setData({
                  ...data,
                  funkrufnamen: { ...(data.funkrufnamen ?? {}), [id]: e.target.value },
                })
              }
            />
          </div>
        ))}
      </div>

      <h4 style={{ margin: "8px 0 12px", fontSize: 14, color: "var(--fg)" }}>Atemschutz-Konfiguration</h4>
      <div className="grid-2" style={{ gap: 12, marginBottom: 18 }}>
        <div className="field">
          <label className="caption">Max. AS-Dauer (min)</label>
          <input
            type="number"
            className="input num"
            min={1}
            max={120}
            value={data.atemschutz?.maxDauerMin ?? 30}
            onChange={(e) =>
              setData({
                ...data,
                atemschutz: {
                  schritteMin: data.atemschutz?.schritteMin ?? 5,
                  maxDauerMin: Number(e.target.value) || 30,
                },
              })
            }
          />
        </div>
        <div className="field">
          <label className="caption">Stepper-Schritte (min)</label>
          <input
            type="number"
            className="input num"
            min={1}
            max={15}
            value={data.atemschutz?.schritteMin ?? 5}
            onChange={(e) =>
              setData({
                ...data,
                atemschutz: {
                  maxDauerMin: data.atemschutz?.maxDauerMin ?? 30,
                  schritteMin: Number(e.target.value) || 5,
                },
              })
            }
          />
        </div>
      </div>

      <h4 style={{ margin: "8px 0 12px", fontSize: 14, color: "var(--fg)" }}>Standort</h4>
      <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
        <div className="field">
          <label className="caption">Feuerwehrhaus-Adresse</label>
          <input
            className="input"
            value={data.feuerwehrhausAdresse ?? ""}
            onChange={(e) => setData({ ...data, feuerwehrhausAdresse: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="caption">Bezirk</label>
          <input
            className="input"
            value={data.bezirk ?? ""}
            onChange={(e) => setData({ ...data, bezirk: e.target.value })}
          />
        </div>
      </div>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label className="caption">Heim-Koordinaten · Lat</label>
          <input
            type="number"
            className="input num"
            step="0.0001"
            value={data.heimkoord?.lat ?? 48.0884}
            onChange={(e) =>
              setData({
                ...data,
                heimkoord: {
                  lng: data.heimkoord?.lng ?? 13.9586,
                  lat: Number(e.target.value),
                },
              })
            }
          />
        </div>
        <div className="field">
          <label className="caption">Heim-Koordinaten · Lng</label>
          <input
            type="number"
            className="input num"
            step="0.0001"
            value={data.heimkoord?.lng ?? 13.9586}
            onChange={(e) =>
              setData({
                ...data,
                heimkoord: {
                  lat: data.heimkoord?.lat ?? 48.0884,
                  lng: Number(e.target.value),
                },
              })
            }
          />
        </div>
      </div>
    </section>
  );
}
