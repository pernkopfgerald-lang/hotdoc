import { Radio } from "lucide-react";
import { funkstatusKurz, funkstatusText, funkstatusTon, type FunkstatusTon } from "@hotdoc/shared";
import type { FunkstatusEintrag } from "../lib/use-funkstatus";

const TON_KLASSE: Record<FunkstatusTon, string> = {
  ok: "ok",
  info: "rank",
  warn: "warn",
  danger: "red",
  neutral: "neutral",
};

interface Props {
  eintrag: FunkstatusEintrag | undefined;
  /** Daten veraltet / nicht verfuegbar — dann grau mit Hinweis statt eines alten Status. */
  stale: boolean;
  /** "gross" fuer die Fahrzeug-Hauptseite. */
  gross?: boolean;
}

function hhmm(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
}

/** Funkstatus im Klartext ("Frei auf Wache", "Ausgerückt" …) mit Uhrzeit der letzten Änderung. */
export function FunkstatusBadge({ eintrag, stale, gross = false }: Props) {
  let label: string;
  let ton: FunkstatusTon = "neutral";
  let title: string;
  if (stale || !eintrag) {
    label = "Funkstatus nicht verfügbar";
    title = "Keine aktuellen Daten von der Leitstelle (ELS)";
  } else if (!eintrag.status) {
    label = "Kein Funkstatus";
    title = "Die Leitstelle (ELS) meldet für dieses Fahrzeug aktuell keinen Funkstatus";
  } else {
    const kurz = funkstatusKurz(eintrag.status);
    label = kurz || `Funkstatus ${eintrag.status}`;
    ton = funkstatusTon(eintrag.status);
    title = `Funkstatus ${eintrag.status}${funkstatusText(eintrag.status) ? `: ${funkstatusText(eintrag.status)}` : ""} (Leitstelle ELS)`;
  }
  const seit = !stale && eintrag?.status ? hhmm(eintrag.since) : "";
  return (
    <span
      className={`badge ${TON_KLASSE[ton]}`}
      title={title}
      style={{
        gap: gross ? 10 : 6,
        whiteSpace: "nowrap",
        ...(gross ? { fontSize: 22, padding: "8px 16px", fontWeight: 800 } : {}),
      }}
    >
      <Radio size={gross ? 22 : 13} />
      {label}
      {seit ? <span style={{ fontWeight: 600, opacity: 0.8 }}>· seit {seit}</span> : null}
    </span>
  );
}
