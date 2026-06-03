import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiCall } from "../lib/api";

interface HealthItem {
  key: string;
  name: string;
  state: "ok" | "warn" | "off" | "error";
  detail: string;
}

/**
 * Live-Status-Banner. Holt /api/admin/health und zeigt:
 *  - alle Integrationen ok → grünes LIVE-Banner
 *  - mind. eine im warn/error → amber-Banner mit Liste
 *  - mind. eine off → blaues TEIL-LIVE
 *  - Endpoint nicht erreichbar → grauer Offline-Hinweis
 *
 * Refresht alle 60 s.
 */
export function StatusBanner() {
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await apiCall<{ items: HealthItem[] }>("/api/admin/health");
        if (!cancelled) {
          setItems(r.items);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) setUnreachable(true);
      }
    };
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (unreachable) {
    return (
      <Banner
        tone="warn"
        tag="OFFLINE"
        text="Backend nicht erreichbar — Tablet läuft lokal weiter, sync nach Reconnect"
      />
    );
  }
  if (!items) return null;

  const offline = items.filter((i) => i.state === "off");
  const errors = items.filter((i) => i.state === "error" || i.state === "warn");
  const ok = items.filter((i) => i.state === "ok");

  if (offline.length === 0 && errors.length === 0) {
    return (
      <Banner
        tone="ok"
        tag="LIVE"
        text={`Alle ${ok.length} Schnittstellen aktiv · ${ok.map((i) => i.name).join(" · ")}`}
      />
    );
  }

  const offlineNames = offline.map((i) => i.name).join(" · ");
  const okNames = ok.map((i) => i.name).join(" · ");
  return (
    <Banner
      tone={errors.length > 0 ? "warn" : "info"}
      tag={offline.length > 0 && errors.length === 0 ? "TEIL-LIVE" : "STATUS"}
      text={
        errors.length > 0
          ? `Beeinträchtigt: ${errors.map((i) => i.name).join(" · ")}`
          : `Live: ${okNames} · Inaktiv: ${offlineNames}`
      }
    />
  );
}

function Banner({
  tone,
  tag,
  text,
}: {
  tone: "ok" | "warn" | "info";
  tag: string;
  text: string;
}) {
  const styles = {
    ok: { color: "var(--ok)", border: "var(--emerald-border)", bg: "var(--ok-tint)", icon: CheckCircle2 },
    warn: { color: "var(--warn)", border: "var(--amber-border)", bg: "var(--warn-tint)", icon: AlertTriangle },
    info: { color: "var(--info)", border: "var(--blue-border)", bg: "var(--info-tint)", icon: CheckCircle2 },
  }[tone];
  const Icon = styles.icon;
  return (
    <div
      style={{
        margin: "6px 16px 0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 10px",
        borderRadius: 8,
        border: `1px dashed ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        fontSize: 15,
      }}
    >
      <Icon size={13} />
      <span
        style={{
          padding: "2px 6px",
          borderRadius: 4,
          background: `${styles.color}26`,
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
        }}
      >
        {tag}
      </span>
      <span style={{ color: "var(--fg-2)", flex: 1 }}>{text}</span>
    </div>
  );
}
