import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { apiCall } from "../lib/api";

interface HealthItem {
  key: string;
  name: string;
  state: "ok" | "warn" | "off" | "error";
  detail: string;
}

interface Props {
  /**
   * I-06 (Audit 2026-09): Im OK-Fall gar nichts rendern. Auf dem Fahrzeug-
   * Tablet ist ein dauerhaft grünes "LIVE · 5 Schnittstellen"-Band nur
   * Rauschen — es soll nur etwas erscheinen, wenn wirklich etwas hakt.
   * "OK" heißt hier: keine rote und keine amber Meldung (inaktive
   * Integrationen und unkritische Hinweise zählen nicht als Störung).
   */
  quietWhenOk?: boolean;
}

/**
 * Integrationen, deren Ausfall den Einsatzbetrieb direkt trifft: ohne
 * BlaulichtSMS kommt kein Alarm, ohne CouchDB kein Bericht. NUR diese
 * beiden dürfen den Banner rot färben (I-06). syBOS, wasserkarte und FCM
 * sind Komfort — ein syBOS-"warn" (z. B. Sync älter als X h) ist keine
 * Beeinträchtigung des Einsatzes und wird nur als Hinweis geführt.
 */
const KRITISCH = new Set(["blaulichtsms", "couch"]);

/**
 * Live-Status-Banner. Holt /api/admin/health und zeigt:
 *  - rot      → blaulichtsms/couch im state "error" (Einsatzbetrieb betroffen)
 *  - amber    → blaulichtsms/couch im "warn" ODER eine Komfort-Integration
 *               (syBOS, wasserkarte, FCM) im "error"
 *  - grün     → sonst alles ok (Komfort-"warn" nur als Hinweis im Text)
 *  - blau     → TEIL-LIVE: nur inaktive (off) Integrationen, kein Fehler
 *  - grau/amber OFFLINE → Endpoint nicht erreichbar
 *
 * Refresht alle 60 s.
 */
export function StatusBanner({ quietWhenOk = false }: Props = {}) {
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

  // I-06: Schweregrad pro Integration — nur kritische Fehler werden rot.
  const rot = items.filter((i) => i.state === "error" && KRITISCH.has(i.key));
  const amber = items.filter(
    (i) =>
      (i.state === "warn" && KRITISCH.has(i.key)) ||
      (i.state === "error" && !KRITISCH.has(i.key)),
  );
  const hinweise = items.filter((i) => i.state === "warn" && !KRITISCH.has(i.key));
  const offline = items.filter((i) => i.state === "off");
  const ok = items.filter((i) => i.state === "ok");

  const gestoert = rot.length > 0 || amber.length > 0;

  if (!gestoert) {
    // OK-Fall (ggf. mit inaktiven Integrationen / unkritischen Hinweisen).
    if (quietWhenOk) return null;
    const hinweisText =
      hinweise.length > 0 ? ` · Hinweis: ${hinweise.map((i) => i.name).join(", ")}` : "";
    if (offline.length === 0) {
      return (
        <Banner
          tone="ok"
          tag="LIVE"
          text={`Alle ${ok.length} Schnittstellen aktiv · ${ok.map((i) => i.name).join(" · ")}${hinweisText}`}
        />
      );
    }
    return (
      <Banner
        tone="info"
        tag="TEIL-LIVE"
        text={`Live: ${ok.map((i) => i.name).join(" · ")} · Inaktiv: ${offline.map((i) => i.name).join(" · ")}${hinweisText}`}
      />
    );
  }

  // Störung: rot hat Vorrang, sonst amber. Beide Listen im Text nennen.
  const betroffen = [...rot, ...amber].map((i) => i.name).join(" · ");
  return (
    <Banner
      tone={rot.length > 0 ? "danger" : "warn"}
      tag={rot.length > 0 ? "STÖRUNG" : "STATUS"}
      text={
        rot.length > 0
          ? `Einsatzbetrieb beeinträchtigt: ${betroffen}`
          : `Beeinträchtigt: ${betroffen}`
      }
    />
  );
}

function Banner({
  tone,
  tag,
  text,
}: {
  tone: "ok" | "warn" | "info" | "danger";
  tag: string;
  text: string;
}) {
  const styles = {
    ok: { color: "var(--ok)", border: "var(--emerald-border)", bg: "var(--ok-tint)", icon: CheckCircle2 },
    warn: { color: "var(--warn)", border: "var(--amber-border)", bg: "var(--warn-tint)", icon: AlertTriangle },
    info: { color: "var(--info)", border: "var(--blue-border)", bg: "var(--info-tint)", icon: CheckCircle2 },
    danger: { color: "var(--red)", border: "var(--red-border)", bg: "var(--red-tint)", icon: XCircle },
  }[tone];
  const Icon = styles.icon;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        margin: "6px 16px 0",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 10px",
        borderRadius: 8,
        border: `1px ${tone === "danger" ? "solid" : "dashed"} ${styles.border}`,
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
