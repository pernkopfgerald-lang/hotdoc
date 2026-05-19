import { ChevronRight, Radio } from "lucide-react";
import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  fahrzeugId: FahrzeugId;
  /** Optional: macht die Bar klickbar → öffnet den VehicleSwitcher. */
  onSwitch?: () => void;
}

export function RufnameBar({ fahrzeugId, onSwitch }: Props) {
  const f = FAHRZEUGE[fahrzeugId];
  const Wrapper = onSwitch ? "button" : ("div" as const);
  const wrapperProps = onSwitch
    ? { type: "button" as const, onClick: onSwitch, "aria-label": "Fahrzeug wechseln" }
    : {};
  return (
    <div className="px-4 pt-2.5">
      <Wrapper
        {...wrapperProps}
        className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-m border px-3.5 py-2 text-left transition ${
          onSwitch ? "hover:brightness-110 active:translate-y-px" : ""
        }`}
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
        {onSwitch ? (
          <ChevronRight
            size={16}
            className="text-text-3 transition group-hover:text-amber"
            aria-hidden
          />
        ) : null}
      </Wrapper>
    </div>
  );
}
