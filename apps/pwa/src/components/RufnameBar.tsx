import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  fahrzeugId: FahrzeugId;
}

export function RufnameBar({ fahrzeugId }: Props) {
  const f = FAHRZEUGE[fahrzeugId];
  return (
    <div className="px-4 pt-2">
      <div className="flex items-center gap-2.5 rounded-m border border-border bg-surface-2 px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-3">
          Funkrufname
        </span>
        <span className="flex-1 text-[15px] font-semibold text-text-1">{f.funkrufname}</span>
        <span className="rounded-full border border-border bg-surface-3 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-text-2">
          {f.bezeichnung} · {f.besatzung.typ}
        </span>
      </div>
    </div>
  );
}
