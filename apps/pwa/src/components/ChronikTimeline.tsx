export interface ChronikEintrag {
  id: string;
  zeitstempel: string;
  funkrufname: string;
  text: string;
  pending?: boolean;
  source: "blaulichtsms" | "fahrzeug" | "manuell" | "atemschutz";
}

interface Props {
  eintraege: ChronikEintrag[];
}

/**
 * ChronikTimeline — Design `.timeline` / `.tl-row` / `.tl-body` mit
 * Border-Linie links und Dot. Farbe nach Source: rot=BlaulichtSMS,
 * blau=Fahrzeug-default, grün=Atemschutz, amber=pending.
 */
export function ChronikTimeline({ eintraege }: Props) {
  return (
    <div className="timeline">
      {eintraege.map((e) => {
        const variant =
          e.source === "blaulichtsms"
            ? "red"
            : e.source === "atemschutz"
              ? "ok"
              : e.pending
                ? "warn"
                : "";
        const sourceLabel = e.source === "blaulichtsms" ? "BlaulichtSMS" : e.funkrufname;
        return (
          <div className="tl-row" key={e.id}>
            <div className="tl-time">{formatTime(e.zeitstempel)}</div>
            <div className="tl-body">
              <span className={`tl-dot${variant ? " " + variant : ""}`} />
              <div className={`tl-source${variant ? " " + variant : ""}`}>{sourceLabel}</div>
              <div className="tl-text">{e.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
