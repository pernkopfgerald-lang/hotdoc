export interface ChronikEintrag {
  id: string;
  zeitstempel: string;
  funkrufname: string;
  text: string;
  pending?: boolean;
  source: "blaulichtsms" | "fahrzeug" | "manuell";
}

interface Props {
  eintraege: ChronikEintrag[];
}

export function ChronikTimeline({ eintraege }: Props) {
  return (
    <ol className="relative m-0 list-none p-0">
      <span
        className="absolute bottom-1.5 left-[48px] top-1.5 w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent, var(--border) 8%, var(--border) 92%, transparent)",
        }}
        aria-hidden
      />
      {eintraege.map((e) => (
        <li key={e.id} className="relative grid grid-cols-[44px_1fr] gap-3 py-1 pb-2">
          <span
            aria-hidden
            className="absolute left-[46px] top-[10px] h-[5px] w-[5px] rounded-full"
            style={{
              background:
                e.source === "blaulichtsms"
                  ? "var(--blue)"
                  : e.pending
                    ? "var(--amber)"
                    : "var(--text-3)",
              boxShadow:
                e.source === "blaulichtsms"
                  ? "0 0 0 3px var(--bg-page), 0 0 8px var(--blue-bg)"
                  : e.pending
                    ? "0 0 0 3px var(--bg-page), 0 0 8px var(--amber-soft)"
                    : "0 0 0 3px var(--bg-page)",
            }}
          />
          <time className="pt-0.5 font-mono text-[13px] font-semibold tabular-nums text-text-2">
            {formatTime(e.zeitstempel)}
          </time>
          <div className="pl-3.5">
            <span
              className={`mb-0.5 block font-mono text-[9px] font-semibold uppercase tracking-[0.18em] ${
                e.source === "blaulichtsms" ? "text-blue" : "text-text-3"
              }`}
            >
              {e.source === "blaulichtsms" ? "BlaulichtSMS" : e.funkrufname}
            </span>
            <p
              className={`m-0 text-[14px] leading-[1.45] ${
                e.pending ? "italic text-amber" : "text-text-1"
              }`}
            >
              {e.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
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
