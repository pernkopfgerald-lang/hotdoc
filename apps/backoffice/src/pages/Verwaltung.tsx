import { LogOut, FileText, Users, Settings, Activity } from "lucide-react";
import { useState } from "react";
import { apiCall, clearToken } from "../api/client";
import { BerichteBrowser } from "../components/BerichteBrowser";
import { Florianstation } from "./Florianstation";
import type { AuthResponse } from "@hotdoc/shared";

interface Props {
  auth: AuthResponse;
  onLogout: () => void;
}

type Tab = "berichte" | "personal" | "stammdaten" | "florian";

export function Verwaltung({ auth, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("berichte");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function triggerSyBosSync() {
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const result = await apiCall<{ ok: boolean; personalCount: number; materialCount: number; durationMs: number; error?: string }>(
        "/api/admin/sybos/sync",
        { method: "POST" },
      );
      if (result.ok) {
        setSyncResult(
          `✓ ${result.personalCount} Personen · ${result.materialCount} Material · ${result.durationMs} ms`,
        );
      } else {
        setSyncResult(`Fehler: ${result.error ?? "unbekannt"}`);
      }
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusy(false);
    }
  }

  function logout() {
    clearToken();
    onLogout();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-page/95 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-condensed text-xl font-bold tracking-tight">
            <span className="text-red">Hot</span>
            <span className="text-text-1">Doc</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-3">
            Backoffice
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-2">
            {auth.benutzer?.username ?? "—"} ·{" "}
            <span className="font-mono uppercase">{auth.rolle}</span>
          </span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-s border border-border bg-surface-2 px-3 py-1.5 text-sm hover:bg-surface-3"
          >
            <LogOut size={14} /> Abmelden
          </button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-border bg-surface-1 px-6">
        <TabButton active={tab === "berichte"} onClick={() => setTab("berichte")} icon={<FileText size={16} />}>
          Berichte
        </TabButton>
        <TabButton active={tab === "florian"} onClick={() => setTab("florian")} icon={<Activity size={16} />}>
          Florianstation
        </TabButton>
        <TabButton active={tab === "personal"} onClick={() => setTab("personal")} icon={<Users size={16} />}>
          Personal
        </TabButton>
        <TabButton active={tab === "stammdaten"} onClick={() => setTab("stammdaten")} icon={<Settings size={16} />}>
          Stammdaten
        </TabButton>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {tab === "berichte" && <BerichteBrowser />}
        {tab === "florian" && <Florianstation />}
        {tab === "personal" && <PersonalPanel onSyncSyBos={triggerSyBosSync} busy={syncBusy} result={syncResult} />}
        {tab === "stammdaten" && <StammdatenPlaceholder />}
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
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-red text-text-1"
          : "border-transparent text-text-2 hover:text-text-1"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function PersonalPanel({
  onSyncSyBos,
  busy,
  result,
}: {
  onSyncSyBos: () => void;
  busy: boolean;
  result: string | null;
}) {
  return (
    <section className="rounded-m border border-border bg-surface-1 p-6">
      <h2 className="text-lg font-semibold">Personal & syBOS-Sync</h2>
      <p className="mt-2 text-sm text-text-2">
        Die Personenliste wird täglich um 04:00 aus syBOS synchronisiert.
        Hier kannst du den Sync manuell auslösen — z.B. nach Neuaufnahme oder Funktionswechsel.
      </p>

      <button
        type="button"
        onClick={onSyncSyBos}
        disabled={busy}
        className="mt-4 flex items-center gap-2 rounded-m bg-blue px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? "Sync läuft …" : "Jetzt aus syBOS synchronisieren"}
      </button>

      {result && (
        <div className="mt-4 rounded-s border border-border bg-surface-2 p-3 font-mono text-xs">
          {result}
        </div>
      )}

      <p className="mt-6 text-xs text-text-3">
        Vorbedingung: syBOS-Token + IP-Whitelist sind in den fly secrets gesetzt
        (<code className="font-mono">SYBOS_API_URL</code>, <code className="font-mono">SYBOS_TOKEN</code>).
      </p>
    </section>
  );
}

function StammdatenPlaceholder() {
  return (
    <section className="rounded-m border border-border bg-surface-1 p-6">
      <h2 className="text-lg font-semibold">Stammdaten</h2>
      <p className="mt-2 text-sm text-text-2">
        Phase 6 — Fahrzeug-Geräte-Listen, Funkrufnamen, AS-Konfig, BlaulichtSMS-Status, wasserkarte.info-Layer.
      </p>
    </section>
  );
}
