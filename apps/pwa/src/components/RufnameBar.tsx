import { Radio } from "lucide-react";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  fahrzeugId: FahrzeugId;
}

export function RufnameBar({ fahrzeugId }: Props) {
  const f = FAHRZEUGE[fahrzeugId];
  return (
    <div className="px-4 pt-2.5">
      <div
        className="relative flex items-center gap-3 overflow-hidden rounded-m border px-3.5 py-2"
        style={{
          borderColor: "var(--amber-border)",
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--amber-soft) 80%, transparent) 0%, var(--surface-2) 50%, var(--surface-2) 100%)",
        }}
      >
        {/* High-Vis-Kante links */}
        <span
          aria-hidden
          className="absolute left-0 top-0 h-full w-[3px]"
          style={{ background: "var(--amber)", boxShadow: "0 0 14px var(--amber-glow)" }}
        />

        <span
          className="grid h-7 w-7 place-items-center rounded-md"
          style={{
            background: "var(--amber-soft)",
            border: "1px solid var(--amber-border)",
            color: "var(--amber)",
          }}
        >
          <Radio size={14} />
        </span>

        <div className="flex flex-1 flex-col leading-tight">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-text-3">
            Funkrufname
          </span>
          <span className="font-condensed text-[17px] font-bold tracking-tight text-text-1">
            {f.funkrufname}
          </span>
        </div>

        <span
          className="rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.14em] text-text-2"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-1)" }}
        >
          {f.bezeichnung} · {f.besatzung.typ}
        </span>
      </div>
    </div>
  );
}
