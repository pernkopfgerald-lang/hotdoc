import { LogOut, FileText, Users, Settings, Activity, Truck, Wrench, RefreshCw, Archive, Hash, BookOpen, Signal, Plus, X, AlertTriangle, CheckCircle2, History, Smartphone, Monitor, LogIn, ArrowRightLeft, Undo2, BarChart3, Calendar, Clock, GraduationCap, MapPin, Siren, Flame, Wind, Pencil, Download, Trash2, Info } from "lucide-react";
import { AboutPanel } from "../components/AboutPanel";
import {
  listDevices,
  deleteDevice,
  getAppVersionConfig,
  setAppVersionConfig,
  type DeviceListItem,
  type AppVersionConfig,
} from "../api/devices";
import { useCallback, useEffect, useState } from "react";
import { apiCall, clearToken, fetchAndOpenBlob } from "../api/client";
import {
  getConfig,
  putConfig,
  type AuftragstypenData,
  type ConfigKey,
  type EinsatzstichworteData,
  type GeraeteData,
  type StammdatenData,
  type StringListData,
} from "../api/config";
import { listEinsaetze, type EinsatzListItem, type EinsatzTyp } from "../api/einsaetze";
import { BerichteBrowser } from "../components/BerichteBrowser";
import { BrandLogo } from "../components/BrandLogo";
import { EditableChip } from "../components/EditableChip";
import { Florianstation } from "./Florianstation";
import { FLORIAN_ADDRESS, deriveBerichtNrFromId, type AuthResponse } from "@hotdoc/shared";

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

/**
 * Inline-Edit für Tabellen-Zellen. Klick auf den Text → Input.
 * Enter / Blur = commit · Escape = abort.
 */
function InlineTextEdit({
  value,
  onCommit,
  validate,
}: {
  value: string;
  onCommit: (next: string) => void;
  validate?: (next: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function commit() {
    const cleaned = draft.trim();
    if (!cleaned) {
      setEditing(false);
      setDraft(value);
      return;
    }
    if (validate) {
      const e = validate(cleaned);
      if (e) {
        setErr(e);
        return;
      }
    }
    setErr(null);
    setEditing(false);
    if (cleaned !== value) onCommit(cleaned);
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft(value);
              setErr(null);
            }
          }}
          onBlur={commit}
          title={err ?? undefined}
          style={{
            background: err ? "var(--red-tint)" : "var(--info-tint)",
            border: `1px solid ${err ? "var(--red)" : "var(--info)"}`,
            borderRadius: 6,
            padding: "2px 6px",
            font: "inherit",
            color: "inherit",
            minWidth: 140,
          }}
        />
      </span>
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      title="Klick zum Bearbeiten"
      style={{
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: 6,
        borderBottom: "1px dashed transparent",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = "var(--border-strong)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
    >
      {value}
      <Pencil size={10} style={{ opacity: 0.4 }} />
    </span>
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
  | "statistik"
  | "aktivitaet"
  | "schnittstellen"
  | "einsatzstichworte"
  | "nummerierung"
  | "personal"
  | "geraete"
  | "auftragstypen"
  | "beteiligte-stellen"
  | "sonstige-ff"
  | "gefaehrliche-stoffe"
  | "stammdaten"
  | "devices"
  | "app-version"
  | "about";

export function Verwaltung({ auth, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("berichte");
  // AUDIT-15 (SF-07): Listen-Panels melden ungespeicherte Aenderungen nach
  // oben — der Tab-Wechsel fragt VOR dem Unmount nach, sonst sind die
  // Eingaben kommentarlos weg.
  const [panelDirty, setPanelDirty] = useState(false);

  function switchTab(next: Tab) {
    if (next === tab) return;
    if (panelDirty && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setPanelDirty(false);
    setTab(next);
  }

  function logout() {
    clearToken();
    onLogout();
  }

  // Menü-Gruppierung: die 18 Einzel-Tabs waren zu viele und mussten horizontal
  // gescrollt werden. Jetzt 5 thematische Ober-Gruppen + eine Unterzeile mit
  // den Tabs der aktiven Gruppe — klarer strukturiert, kein endloses Scrollen.
  // Der aktive Leaf-Tab bestimmt die aktive Gruppe.
  const GROUPS: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }>;
  }> = [
    {
      key: "einsaetze",
      label: "Einsätze",
      icon: <FileText size={16} />,
      tabs: [
        { key: "berichte", label: "Berichte", icon: <FileText size={15} /> },
        { key: "florian", label: "Florian Eberstalzell", icon: <Activity size={15} /> },
        { key: "archiv", label: "Archiv", icon: <Archive size={15} /> },
      ],
    },
    {
      key: "auswertung",
      label: "Auswertung",
      icon: <BarChart3 size={16} />,
      tabs: [
        { key: "statistik", label: "Statistik", icon: <BarChart3 size={15} /> },
        { key: "aktivitaet", label: "Aktivität", icon: <History size={15} /> },
        { key: "schnittstellen", label: "Schnittstellen", icon: <Signal size={15} /> },
      ],
    },
    {
      key: "stammdaten-grp",
      label: "Stammdaten",
      icon: <Users size={16} />,
      tabs: [
        { key: "personal", label: "Personal", icon: <Users size={15} /> },
        { key: "geraete", label: "Geräte", icon: <Wrench size={15} /> },
        { key: "nummerierung", label: "Nummerierung", icon: <Hash size={15} /> },
        { key: "stammdaten", label: "Stammdaten", icon: <Settings size={15} /> },
      ],
    },
    {
      key: "listen",
      label: "Listen & Stichworte",
      icon: <BookOpen size={16} />,
      tabs: [
        { key: "einsatzstichworte", label: "Einsatzstichworte", icon: <BookOpen size={15} /> },
        { key: "auftragstypen", label: "Auftrag-Typen", icon: <Truck size={15} /> },
        { key: "beteiligte-stellen", label: "Beteiligte Stellen", icon: <Siren size={15} /> },
        { key: "sonstige-ff", label: "Sonstige FF", icon: <Flame size={15} /> },
        { key: "gefaehrliche-stoffe", label: "Gefährliche Stoffe", icon: <AlertTriangle size={15} /> },
      ],
    },
    {
      key: "system",
      label: "System",
      icon: <Settings size={16} />,
      tabs: [
        { key: "devices", label: "Registrierte Geräte", icon: <Smartphone size={15} /> },
        { key: "app-version", label: "App-Version", icon: <Download size={15} /> },
        { key: "about", label: "Über", icon: <Info size={15} /> },
      ],
    },
  ];
  const activeGroup = GROUPS.find((g) => g.tabs.some((t) => t.key === tab)) ?? GROUPS[0]!;

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

      {/* Ober-Gruppen (Reiter-Mappen). Klick auf eine Gruppe öffnet ihren
          ersten Tab — die aktive Gruppe ergibt sich aus dem aktiven Tab. */}
      <nav
        style={{
          display: "flex",
          gap: 4,
          padding: "8px 24px 0",
          background: "var(--surface)",
          overflowX: "auto",
        }}
      >
        {GROUPS.map((g) => {
          const active = g.key === activeGroup.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => {
                if (!active) switchTab(g.tabs[0]!.key);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 16px",
                borderRadius: "10px 10px 0 0",
                border: 0,
                background: active ? "var(--surface-2)" : "transparent",
                color: active ? "var(--fg)" : "var(--fg-2)",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
                minHeight: 42,
              }}
            >
              {g.icon}
              {g.label}
            </button>
          );
        })}
      </nav>

      {/* Unterzeile: die Tabs der aktiven Gruppe. */}
      <nav
        style={{
          display: "flex",
          gap: 2,
          padding: "0 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
          overflowX: "auto",
        }}
      >
        {activeGroup.tabs.map((t) => (
          <TabButton
            key={t.key}
            active={tab === t.key}
            onClick={() => switchTab(t.key)}
            icon={t.icon}
          >
            {t.label}
          </TabButton>
        ))}
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
        {tab === "statistik" && <StatistikPanel />}
        {tab === "aktivitaet" && <AktivitaetPanel />}
        {tab === "schnittstellen" && <SchnittstellenPanel />}
        {tab === "einsatzstichworte" && <EinsatzstichwortePanel onDirtyChange={setPanelDirty} />}
        {tab === "nummerierung" && <NummerierungPanel />}
        {tab === "personal" && <PersonalPanel />}
        {tab === "geraete" && <GeraetePanel onDirtyChange={setPanelDirty} />}
        {tab === "auftragstypen" && <AuftragstypenPanel onDirtyChange={setPanelDirty} />}
        {tab === "beteiligte-stellen" && (
          <StringListPanel
            configKey="beteiligte-stellen"
            title="Beteiligte Stellen (global)"
            icon={<Siren size={20} />}
            description="Diese Liste erscheint im Editor von Florian Eberstalzell als anhakbare Chips, wenn der Einsatzleiter dokumentiert, wer noch auf der Einsatzstelle anwesend war (Polizei, Rotes Kreuz, Notarzt, …). Änderungen wirken sich sofort aus."
            placeholder="Neue Stelle …"
            onDirtyChange={setPanelDirty}
          />
        )}
        {tab === "sonstige-ff" && (
          <StringListPanel
            configKey="sonstige-ff"
            title="Sonstige Feuerwehren (global)"
            icon={<Flame size={20} />}
            description="Liste der ueblichen Nachbar-Feuerwehren. Im Editor von Florian Eberstalzell als Schnellauswahl-Chips verfügbar (Sturm, BMA-Übergreifend, Personenrettung-Mitarbeit …)."
            placeholder="Neue FF …"
            onDirtyChange={setPanelDirty}
          />
        )}
        {/* Issue 16 (Follow-up Einsatz-Test 2026-06-02): Gefährliche-Stoffe-
            Liste pflegbar. Erscheint im Florian-Editor (Technisch-Statistik)
            als Chip-Mehrfachauswahl. */}
        {tab === "gefaehrliche-stoffe" && (
          <StringListPanel
            configKey="gefaehrliche-stoffe"
            title="Gefährliche Stoffe (global)"
            icon={<AlertTriangle size={20} />}
            description="Liste der gefährlichen Stoffe für die syBOS-Technisch-Statistik (z. B. Diesel, Benzin, Säuren, Gase). Erscheint im Florian-Editor bei technischen Einsätzen als anhakbare Chips. Frei erweiterbar — auch der Einsatzleiter kann im Editor eigene Stoffe per Freitext ergänzen."
            placeholder="Neuen Stoff …"
            onDirtyChange={setPanelDirty}
          />
        )}
        {tab === "stammdaten" && <StammdatenPanel onDirtyChange={setPanelDirty} />}
        {tab === "devices" && <DevicesPanel />}
        {tab === "app-version" && <AppVersionPanel onDirtyChange={setPanelDirty} />}
        {tab === "about" && <AboutPanel />}
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

function GeraetePanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  // AUDIT-15 (SF-07): setData ist ein Wrapper um den State-Setter, der jede
  // Mutation als "ungespeichert" markiert und das nach oben meldet — der
  // Lade-Effekt nutzt setDataRaw direkt und bleibt sauber.
  const [data, setDataRaw] = useState<GeraeteData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeFzg, setActiveFzg] = useState<string>("lfa-b");

  function setData(next: GeraeteData) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<GeraeteData>("geraete");
        setDataRaw(r.data);
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
      setDirty(false);
      onDirtyChange?.(false);
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
    const bez = bezeichnung.trim();
    const id = bezeichnung
      .toLowerCase()
      .replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c]!)
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    // AUDIT-15 (SF-14): Duplikat-Check VOR dem Hinzufuegen — gleiche slug-id
    // ODER gleiche Bezeichnung im selben Fahrzeug. Wortlaut identisch zur
    // EditableChip-validate-Meldung, damit beide Pfade gleich klingen.
    const vorhanden = (data.byFahrzeug[fzg] ?? []).some(
      (it) => it.id === id || it.bezeichnung === bez,
    );
    if (vorhanden) {
      setErr(`"${bez}" existiert bereits für ${labels[fzg] ?? fzg}`);
      return;
    }
    setErr(null);
    setData({
      ...data,
      byFahrzeug: {
        ...data.byFahrzeug,
        [fzg]: [...(data.byFahrzeug[fzg] ?? []), { id, bezeichnung: bez }],
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
  function renameItem(fzg: string, id: string, newBezeichnung: string) {
    if (!data) return;
    setData({
      ...data,
      byFahrzeug: {
        ...data.byFahrzeug,
        [fzg]: (data.byFahrzeug[fzg] ?? []).map((it) =>
          it.id === id ? { ...it, bezeichnung: newBezeichnung } : it,
        ),
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
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
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
                <EditableChip
                  key={it.id}
                  text={it.bezeichnung}
                  onUpdate={(next) => renameItem(activeFzg, it.id, next)}
                  onRemove={() => removeItem(activeFzg, it.id)}
                  className="chip selected"
                  validate={(next) =>
                    next !== it.bezeichnung &&
                    items.some((x) => x.bezeichnung === next)
                      ? `"${next}" existiert bereits für ${labels[activeFzg]}`
                      : null
                  }
                />
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

function AuftragstypenPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  // AUDIT-15 (SF-07): setData-Wrapper markiert jede Mutation als
  // "ungespeichert" — der Lade-Effekt nutzt setDataRaw direkt.
  const [data, setDataRaw] = useState<AuftragstypenData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setData(next: AuftragstypenData) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<AuftragstypenData>("auftragstypen");
        setDataRaw(r.data);
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
      setDirty(false);
      onDirtyChange?.(false);
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
  function rename(oldText: string, newText: string) {
    if (!data) return;
    setData({
      ...data,
      items: data.items.map((t) => (t === oldText ? newText : t)),
    });
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Truck size={20} />
          Auftrag-Typen (global)
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
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
              <EditableChip
                key={t}
                text={t}
                onUpdate={(next) => rename(t, next)}
                onRemove={() => remove(t)}
                validate={(next) =>
                  next !== t && data.items.includes(next)
                    ? `"${next}" existiert bereits`
                    : null
                }
              />
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

/**
 * Generisches Listen-CRUD-Panel fuer einfache String-Listen (config-Key
 * mit Format `{ items: string[] }`). Wird fuer "beteiligte-stellen" und
 * "sonstige-ff" eingesetzt — die Inhalts-Sets erscheinen im Florianstation-
 * Editor als Schnellauswahl-Chips. Aenderungen wirken sich beim naechsten
 * PWA-Start auf den Editor aus.
 */
function StringListPanel({
  configKey,
  title,
  icon,
  description,
  placeholder,
  onDirtyChange,
}: {
  configKey: Extract<ConfigKey, "beteiligte-stellen" | "sonstige-ff" | "gefaehrliche-stoffe">;
  title: string;
  icon: React.ReactNode;
  description: string;
  placeholder: string;
  /** AUDIT-15 (SF-07): meldet ungespeicherte Aenderungen nach oben. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  // setData-Wrapper markiert jede Mutation als "ungespeichert" —
  // der Lade-Effekt nutzt setDataRaw direkt.
  const [data, setDataRaw] = useState<StringListData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setData(next: StringListData) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<StringListData>(configKey);
        // Defensive: data kann fehlen wenn das Doc noch leer ist
        setDataRaw({ items: Array.isArray(r.data?.items) ? r.data.items : [] });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [configKey]);

  async function save(): Promise<void> {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await putConfig(configKey, data);
      setDirty(false);
      onDirtyChange?.(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function add(text: string): void {
    if (!data || !text.trim()) return;
    const t = text.trim();
    if (data.items.includes(t)) return;
    setData({ ...data, items: [...data.items, t] });
  }
  function remove(text: string): void {
    if (!data) return;
    setData({ ...data, items: data.items.filter((x) => x !== text) });
  }
  function rename(oldText: string, newText: string): void {
    if (!data) return;
    setData({
      ...data,
      items: data.items.map((x) => (x === oldText ? newText : x)),
    });
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          {icon}
          {title}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
          <span className="card-meta">
            <span className="num">{data?.items.length ?? 0}</span> Einträge
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
        {description}
      </p>
      {err ? <ErrorBanner msg={err} /> : null}
      {data ? (
        <>
          <div className="chips" style={{ marginBottom: 12 }}>
            {data.items.map((t) => (
              <EditableChip
                key={t}
                text={t}
                onUpdate={(next) => rename(t, next)}
                onRemove={() => remove(t)}
                validate={(next) =>
                  next !== t && data.items.includes(next)
                    ? `"${next}" existiert bereits`
                    : null
                }
              />
            ))}
          </div>
          <AddItemForm onAdd={add} placeholder={placeholder} />
        </>
      ) : (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      )}
    </section>
  );
}

type StatusFilter = "alle" | "aktiv" | "abgeschlossen";
type TypFilter = "alle" | "alarm" | "manuell" | "lotsendienst" | "uebung";

function ArchivPanel() {
  const [items, setItems] = useState<EinsatzListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("alle");
  const [typFilter, setTypFilter] = useState<TypFilter>("alle");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await listEinsaetze(statusFilter === "alle" ? undefined : statusFilter);
      setItems(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = (items ?? []).filter((it) => {
    if (typFilter === "alle") return true;
    return (it.einsatzTyp ?? "alarm") === typFilter;
  });

  // Aggregation pro Type für die Statistik-Anzeige
  const counts = (items ?? []).reduce<Record<string, number>>((acc, it) => {
    const k = it.einsatzTyp ?? "alarm";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Archive size={20} />
          Archiv · alle Berichte
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

      {/* Filter-Reihen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              minWidth: 60,
            }}
          >
            Status
          </span>
          {(["alle", "aktiv", "abgeschlossen"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className="chip"
              style={
                statusFilter === f
                  ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
                  : undefined
              }
            >
              {f === "alle" ? "Alle" : f === "aktiv" ? "Aktiv" : "Abgeschlossen"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              minWidth: 60,
            }}
          >
            Typ
          </span>
          {(
            [
              ["alle", "Alle"],
              ["alarm", `Alarm (${counts.alarm ?? 0})`],
              ["manuell", `Manuell (${counts.manuell ?? 0})`],
              ["lotsendienst", `Lotsendienst (${counts.lotsendienst ?? 0})`],
              ["uebung", `Übung (${counts.uebung ?? 0})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypFilter(key)}
              className="chip"
              style={
                typFilter === key
                  ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {err ? <ErrorBanner msg={err} /> : null}
      {!items ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13, padding: 16, textAlign: "center" }}>
          Keine Einsätze gefunden ({statusFilter}, {typFilter}).
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={archTh}>Typ</th>
              <th style={archTh}>Bericht-Nr / ID</th>
              <th style={archTh}>Datum</th>
              <th style={archTh}>Bezeichnung</th>
              <th style={archTh}>Ort</th>
              <th style={archTh}>Status</th>
              <th style={archTh}>PDF</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((it) => (
              <tr key={it._id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={archTd}>
                  <TypBadge typ={(it.einsatzTyp ?? "alarm") as EinsatzTyp} />
                </td>
                <td style={archTd}>
                  {/* AUDIT-15 (SF-03): echte berichtNummer (vergeben beim
                      Abschluss, AUDIT-11) mit Ableitungs-Fallback fuer
                      Altberichte; die Couch-ID nur noch als Tooltip. */}
                  <span
                    style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11 }}
                    title={it._id}
                  >
                    {(it as EinsatzListItem & { berichtNummer?: string }).berichtNummer ??
                      deriveBerichtNrFromId(it._id, it.einsatzart, it.alarmierungZeit)}
                  </span>
                </td>
                <td style={archTd}>{formatDate(it.alarmierungZeit)}</td>
                <td style={archTd}>
                  {it.einsatzTyp === "uebung"
                    ? it.uebungThema ?? "—"
                    : it.einsatzTyp === "lotsendienst"
                      ? it.lotsendienstAuftraggeber ?? "—"
                      : it.einsatzart ?? it.einsatzartFreitext ?? "—"}
                </td>
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
                  <button
                    type="button"
                    className="icon-btn"
                    title="PDF-Bericht herunterladen"
                    onClick={() => {
                      // Issue 13 (Einsatz-Test 2026-06-02): window.open ohne
                      // Bearer-Token → 403 vom Backend. Stattdessen Blob-Fetch.
                      void fetchAndOpenBlob(
                        `/api/einsaetze/${encodeURIComponent(it._id)}/pdf`,
                      ).catch((err: unknown) => {
                        alert(
                          `PDF-Download fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
                        );
                      });
                    }}
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
        {filtered.length} angezeigt · {items?.length ?? 0} gesamt
      </p>
    </section>
  );
}

/** AUDIT-15: exportiert, damit BerichteBrowser/BerichtDetail dasselbe
 *  Badge rendern wie das Archiv — eine Wahrheit fuer alle Ansichten. */
export function TypBadge({ typ }: { typ: EinsatzTyp }) {
  const meta: Record<EinsatzTyp, { label: string; color: string }> = {
    alarm: { label: "ALARM", color: "var(--red)" },
    manuell: { label: "MANUELL", color: "var(--info)" },
    lotsendienst: { label: "LOTSE", color: "var(--warn)" },
    uebung: { label: "ÜBUNG", color: "var(--ok)" },
  };
  const m = meta[typ];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 6,
        background: `color-mix(in srgb, ${m.color} 18%, transparent)`,
        color: m.color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.12em",
        border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`,
      }}
    >
      {m.label}
    </span>
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
  // wasserkarte ausgeklammert in V1.0 — Key bleibt zur Vorwärts-Kompat im Typ
  key: "blaulichtsms" | "sybos" | "wasserkarte" | "couch";
  // (Backend liefert "wasserkarte" aktuell nicht mehr — die Variante bleibt nur
  // damit alte gecachte Responses nicht crashen.)
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

function EinsatzstichwortePanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  // AUDIT-15 (SF-07): setData-Wrapper markiert jede Mutation als
  // "ungespeichert" — der Lade-Effekt nutzt setDataRaw direkt.
  const [data, setDataRaw] = useState<EinsatzstichworteData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setData(next: EinsatzstichworteData) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<EinsatzstichworteData>("einsatzstichworte");
        setDataRaw(r.data);
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
      setDirty(false);
      onDirtyChange?.(false);
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
  function renameArt(oldArt: string, newArt: string) {
    if (!data) return;
    setData({
      ...data,
      items: data.items.map((i) => (i.art === oldArt ? { ...i, art: newArt } : i)),
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
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
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
                  <td style={archTd}>
                    <InlineTextEdit
                      value={i.art}
                      onCommit={(next) => renameArt(i.art, next)}
                      validate={(next) =>
                        next !== i.art && data.items.some((x) => x.art === next)
                          ? `"${next}" existiert bereits`
                          : null
                      }
                    />
                  </td>
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
      {/* AUDIT-15: Text an die echte Counter-Logik (AUDIT-11, services/
          bericht-nummer.ts) angepasst — die frueheren Aussagen zu
          provisorischer Offline-Vergabe und Reconnect-Konfliktpruefung
          waren Phantome, so etwas gibt es nicht. */}
      <p
        style={{
          marginTop: 18,
          fontSize: 13,
          color: "var(--fg-2)",
          lineHeight: 1.5,
        }}
      >
        <strong>So funktioniert die Vergabe:</strong> Die laufende Nummer wird beim
        Einsatz-Abschluss <strong>serverseitig</strong> aus dem zentralen Zähler
        (<code style={{ fontFamily: "var(--font-mono)" }}>config:bericht-counter</code>)
        vergeben — je Kategorie (B/T) und Jahr ein eigener Zähler, der mit dem
        Jahreswechsel automatisch wieder bei 001 beginnt. Die Reihenfolge entspricht
        der Verarbeitungsreihenfolge am Server: offline nachgereichte Abschlüsse
        erhalten ihre Nummer erst, wenn der Server sie verarbeitet. Doppelvergaben
        sind ausgeschlossen; schlägt ein Abschluss nach dem Ziehen der Nummer fehl,
        kann eine Lücke entstehen. Altberichte ohne gespeicherte Nummer zeigen im
        Archiv eine aus Kategorie und Anlagedatum abgeleitete Nummer.
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

function StammdatenPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  // AUDIT-15 (SF-07): setData-Wrapper markiert jede Mutation als
  // "ungespeichert" — alle Inline-onChange-Handler laufen darueber,
  // der Lade-Effekt nutzt setDataRaw direkt.
  const [data, setDataRaw] = useState<StammdatenData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  function setData(next: StammdatenData) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<StammdatenData>("stammdaten");
        setDataRaw(r.data);
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
      setDirty(false);
      onDirtyChange?.(false);
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
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
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
            placeholder={FLORIAN_ADDRESS}
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

      <h4 style={{ margin: "18px 0 12px", fontSize: 14, color: "var(--fg)" }}>
        Notfall-Übergabe (QR-Handoff)
      </h4>
      <div className="grid-2" style={{ gap: 12 }}>
        <div className="field">
          <label className="caption">Auto-Release nach</label>
          <select
            className="input"
            value={String(data.handoffAutoReleaseHours ?? 24)}
            onChange={(e) =>
              setData({ ...data, handoffAutoReleaseHours: Number(e.target.value) })
            }
          >
            <option value="1">1 Stunde</option>
            <option value="4">4 Stunden</option>
            <option value="12">12 Stunden</option>
            <option value="24">24 Stunden (Default)</option>
            <option value="48">48 Stunden</option>
            <option value="0">Nie (Token bleibt bis Standard-Login-TTL gültig)</option>
          </select>
        </div>
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px dashed var(--border)",
            fontSize: 12,
            color: "var(--fg-2)",
            lineHeight: 1.55,
          }}
        >
          Nach einer Notfall-Übergabe Tablet → Handy wird die Handy-Sitzung nach
          dieser Zeit automatisch ungültig. Das Tablet kann sich dann wieder mit
          PIN einloggen.
        </div>
      </div>
    </section>
  );
}

/**
 * Aktivitäts-Tab — letzte Audit-Events (Handoff-Flow, Logins, Config-Änderungen).
 * Funktionär+ Berechtigung. Auto-Refresh alle 30 s.
 */
interface AuditEventItem {
  _id: string;
  type: string;
  timestamp: string;
  code?: string;
  actorUsername?: string;
  actorRolle?: string;
  fahrzeugId?: string;
  einsatzId?: string;
  ipAddress?: string;
  autoReleaseAt?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

function AktivitaetPanel() {
  const [items, setItems] = useState<AuditEventItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | "handoff" | "login" | "config">("alle");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await apiCall<{ ok: boolean; items: AuditEventItem[] }>(
        "/api/admin/audit?limit=100",
      );
      setItems(r.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = (items ?? []).filter((it) => {
    if (filter === "alle") return true;
    if (filter === "handoff") return it.type.startsWith("handoff");
    if (filter === "login") return it.type.startsWith("login");
    if (filter === "config") return it.type === "config-changed";
    return true;
  });

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <History size={20} />
          Aktivität · Audit-Trail
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void load()}
            className="cta"
            style={{ width: "auto", padding: "6px 12px", fontSize: 12, gap: 6 }}
            title="Aktualisieren"
          >
            <RefreshCw size={12} /> Aktualisieren
          </button>
        </div>
      </div>

      {err ? <ErrorBanner msg={err} /> : null}

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(
          [
            ["alle", "Alle"],
            ["handoff", "Handoff"],
            ["login", "Login"],
            ["config", "Config"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? "var(--info)" : "var(--surface-2)",
              color: filter === key ? "#fff" : "var(--fg-2)",
              border: `1px solid ${filter === key ? "var(--info)" : "var(--border)"}`,
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 32,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {!items ? (
        <p style={{ color: "var(--fg-3)" }}>lade …</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--fg-3)", padding: "20px 8px", textAlign: "center" }}>
          Keine Events gefunden.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((it) => (
            <AuditEventRow key={it._id} event={it} />
          ))}
        </div>
      )}
    </section>
  );
}

function AuditEventRow({ event }: { event: AuditEventItem }) {
  const meta = describeEvent(event.type);
  const d = new Date(event.timestamp);
  const dateStr = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 120px 1fr auto",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        alignItems: "center",
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${meta.color}26`,
          color: meta.color,
        }}
      >
        {meta.Icon}
      </span>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          {dateStr}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--fg)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeStr}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{meta.label}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--fg-3)",
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[
            event.actorUsername && `User: ${event.actorUsername}`,
            event.fahrzeugId && `Fahrzeug: ${event.fahrzeugId}`,
            event.code && `Code: ${event.code}`,
            event.einsatzId && `Einsatz: ${event.einsatzId.replace(/^einsatz:/, "").slice(0, 12)}…`,
            event.ipAddress && `IP: ${event.ipAddress}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: meta.color,
          padding: "3px 8px",
          borderRadius: 99,
          background: `${meta.color}1A`,
          whiteSpace: "nowrap",
        }}
      >
        {event.type}
      </span>
    </div>
  );
}

function describeEvent(type: string): { Icon: React.ReactNode; label: string; color: string } {
  switch (type) {
    case "handoff-create":
      return { Icon: <Smartphone size={16} />, label: "QR-Code für Übergabe erzeugt", color: "var(--red)" };
    case "handoff-claim":
      return { Icon: <ArrowRightLeft size={16} />, label: "Sitzung am Handy übernommen", color: "var(--warn)" };
    case "handoff-release":
      return { Icon: <Undo2 size={16} />, label: "Sitzung manuell freigegeben", color: "var(--ok)" };
    case "handoff-reverse-create":
      return { Icon: <Monitor size={16} />, label: "QR fürs Tablet erzeugt", color: "var(--info)" };
    case "handoff-reverse-claim":
      return { Icon: <ArrowRightLeft size={16} />, label: "Sitzung ans Tablet zurückgegeben", color: "var(--info)" };
    case "login-success":
      return { Icon: <LogIn size={16} />, label: "Login erfolgreich", color: "var(--ok)" };
    case "login-failed":
      return { Icon: <AlertTriangle size={16} />, label: "Login fehlgeschlagen", color: "var(--red)" };
    case "einsatz-abschluss":
      return { Icon: <CheckCircle2 size={16} />, label: "Einsatz abgeschlossen", color: "var(--ok)" };
    case "einsatz-reaktivierung":
      return { Icon: <RefreshCw size={16} />, label: "Einsatz reaktiviert", color: "var(--warn)" };
    case "config-changed":
      return { Icon: <Settings size={16} />, label: "Konfiguration geändert", color: "var(--info)" };
    default:
      return { Icon: <History size={16} />, label: type, color: "var(--fg-2)" };
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ─────────────────────────────────────────────────────────────────────
// Statistik-Dashboard — Jahres-Übersicht für Bericht ans Kommando
// ─────────────────────────────────────────────────────────────────────

interface StatsResponse {
  range: { from: string; to: string };
  totals: {
    einsaetze: number;
    pro_typ: { alarm: number; manuell: number; lotsendienst: number; uebung: number };
    mannschaftStunden: number;
    asTrupps: number;
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

function StatistikPanel() {
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
            <KpiCard
              label="Mannschaftsstunden"
              value={`${stats.totals.mannschaftStunden}`}
              unit="h"
              icon={<Users size={14} />}
              color="var(--fg)"
            />
            <KpiCard
              label="AS-Trupps"
              value={stats.totals.asTrupps}
              unit={stats.totals.asTrupps === 1 ? "Trupp" : "Trupps"}
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
              total={stats.totals.einsaetze}
              icon={<Flame size={14} />}
              color="var(--red)"
            />
            <TypKpi
              label="Manuelle Berichte"
              value={stats.totals.pro_typ.manuell}
              total={stats.totals.einsaetze}
              icon={<Activity size={14} />}
              color="var(--info)"
            />
            <TypKpi
              label="Lotsendienste"
              value={stats.totals.pro_typ.lotsendienst}
              total={stats.totals.einsaetze}
              icon={<Siren size={14} />}
              color="var(--warn)"
            />
            <TypKpi
              label="Übungen"
              value={stats.totals.pro_typ.uebung}
              total={stats.totals.einsaetze}
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
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color: string;
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

// ─── DevicesPanel ───────────────────────────────────────────────────────
// Liste der via /api/devices/register registrierten Tablets. Zeigt
// Funkrufname (aus fahrzeugId-Lookup), Modell, OS-Version, installierte
// App-Version, FCM-Token-Preview, letztes Update + Erstell-Datum.
// Delete-Button entfernt den Eintrag — Tablet kann sich beim naechsten
// Start neu registrieren.

const FAHRZEUG_LABELS: Record<string, string> = {
  kdo: "KDO",
  "tlf-a-4000": "TANK",
  "lfa-b": "LFA-B",
  mtf: "MTF",
  zentrale: "FLORIAN",
};

function DevicesPanel() {
  const [items, setItems] = useState<DeviceListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const r = await listDevices();
        // Sort by fahrzeugId then letztesUpdateAm DESC
        r.sort((a, b) => {
          if (a.fahrzeugId !== b.fahrzeugId) return a.fahrzeugId.localeCompare(b.fahrzeugId);
          return new Date(b.letztesUpdateAm).getTime() - new Date(a.letztesUpdateAm).getTime();
        });
        setItems(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [refreshTick]);

  async function handleDelete(d: DeviceListItem): Promise<void> {
    if (!confirm(`Eintrag wirklich loeschen?\n${d.model} (${d.fahrzeugId})`)) return;
    try {
      await deleteDevice(d._id);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      alert("Loeschen fehlgeschlagen: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Smartphone size={20} />
          Registrierte Tablets / Geräte
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="card-meta">
            <span className="num">{items?.length ?? 0}</span> Geräte
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRefreshTick((t) => t + 1)}
            aria-label="Aktualisieren"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.55, marginBottom: 16 }}>
        Sobald ein Tablet die HotDoc-Android-App startet und sich einloggt, registriert es sich
        automatisch. Web-Tablets (PWA) erscheinen ohne FCM-Token. Lösche einen Eintrag wenn ein
        Tablet ausgemustert / verloren / gestohlen ist — die App fragt beim nächsten Start neu
        nach Berechtigungen.
      </p>
      {err ? <ErrorBanner msg={err} /> : null}
      {!items ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      ) : items.length === 0 ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>Noch kein Tablet registriert.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((d) => {
            const fzgLabel = FAHRZEUG_LABELS[d.fahrzeugId] ?? d.fahrzeugId.toUpperCase();
            const hasFcm = !d.fcmTokenPreview.startsWith("no-fcm");
            return (
              <div
                key={d._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr auto",
                  gap: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--glass-3)",
                  border: "1px solid var(--glass-border)",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--fg-2)",
                  }}
                >
                  {fzgLabel}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {d.manufacturer} {d.model}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--fg-3)",
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {d.platform} {d.osVersion} · App {d.appVersion} · {hasFcm ? (
                      <span style={{ color: "var(--ok)" }}>FCM ok</span>
                    ) : (
                      <span style={{ color: "var(--warn)" }}>FCM fehlt</span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--fg-3)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    Last seen: {formatTimestamp(d.letztesUpdateAm)}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => void handleDelete(d)}
                  aria-label="Eintrag löschen"
                  title="Eintrag löschen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── AppVersionPanel ────────────────────────────────────────────────────
// Pflegt die config:app-version. Der Funktionaer setzt die aktuelle
// empfohlene Version + URL — Tablets ziehen das beim 6h-Update-Check.

function AppVersionPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  // AUDIT-15 (SF-07): setData-Wrapper markiert jede Mutation als
  // "ungespeichert" — der Lade-Effekt nutzt setDataRaw direkt.
  const [data, setDataRaw] = useState<AppVersionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setData(next: AppVersionConfig) {
    setDataRaw(next);
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    void (async () => {
      try {
        const r = await getAppVersionConfig();
        setDataRaw(r);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function save(): Promise<void> {
    if (!data) return;
    setBusy(true);
    setErr(null);
    try {
      await setAppVersionConfig(data);
      setDirty(false);
      onDirtyChange?.(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Download size={20} />
          App-Version-Management
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* AUDIT-15 (SF-07): Dirty-Badge — Muster Florianstation. */}
          {saved ? (
            <span className="badge ok">gespeichert</span>
          ) : dirty ? (
            <span className="badge neutral">ungespeicherte Änderungen</span>
          ) : null}
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
        Aktuell empfohlene HotDoc-Android-App-Version. Die installierte App vergleicht das alle
        6 Stunden und zeigt dem Funkrufnamen einen dezenten Update-Banner mit Klick zum
        Download. Beim Release einer neuen Version: APK auf hotdoc-apk.fly.dev hochladen,
        hier die Version + URL aktualisieren, Speichern.
      </p>
      {err ? <ErrorBanner msg={err} /> : null}
      {!data ? (
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>lade …</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <AppVersionField
            label="Aktuelle Version (semver)"
            value={data.currentVersion}
            onChange={(v) => setData({ ...data, currentVersion: v })}
            placeholder="0.1.0"
          />
          <AppVersionField
            label="APK-Download-URL"
            value={data.apkUrl}
            onChange={(v) => setData({ ...data, apkUrl: v })}
            placeholder="https://hotdoc-apk.fly.dev/hotdoc-v0.1.5-debug.apk"
          />
          <AppVersionField
            label="Mindestens unterstützte Version"
            value={data.minSupported}
            onChange={(v) => setData({ ...data, minSupported: v })}
            placeholder="0.1.0"
          />
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
              }}
            >
              Release-Notes
            </span>
            <textarea
              value={data.releaseNotes}
              onChange={(e) => setData({ ...data, releaseNotes: e.target.value })}
              rows={5}
              placeholder="Bugfixes, Performance, neue Features …"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--glass-border)",
                background: "var(--surface)",
                outline: "none",
                fontFamily: "inherit",
                fontSize: 13,
                lineHeight: 1.5,
                resize: "vertical",
              }}
            />
          </label>
        </div>
      )}
    </section>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AppVersionField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--glass-border)",
          background: "var(--surface)",
          outline: "none",
          fontFamily: "inherit",
          fontSize: 13,
        }}
      />
    </label>
  );
}
