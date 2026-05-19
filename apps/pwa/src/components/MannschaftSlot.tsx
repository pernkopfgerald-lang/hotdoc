import { AS_DEFAULT, AS_MAX, AS_MIN, AS_STEP, clampAsDauer } from "@hotdoc/shared";
import { Plus } from "lucide-react";
import type { PickPerson } from "./PersonPickerModal";

export interface MannschaftSlotData {
  slot: number;
  person?: PickPerson | null;
  atemschutzAktiv: boolean;
  atemschutzDauerMin: number;
}

interface Props {
  data: MannschaftSlotData;
  onPickPerson: () => void;
  onToggleAs: () => void;
  onChangeAs: (newValue: number) => void;
}

export function MannschaftSlot({ data, onPickPerson, onToggleAs, onChangeAs }: Props) {
  const filled = !!data.person;
  return (
    <li
      className={`grid grid-cols-[28px_1fr_auto_auto] items-center gap-2 rounded-s border p-1 ${
        filled
          ? "border-border bg-surface-2"
          : "border-border bg-transparent"
      }`}
      style={!filled ? { borderStyle: "dashed" } : undefined}
    >
      <span className="pl-1 text-center font-mono text-[13px] font-semibold text-text-3">
        {data.slot}
      </span>

      <button
        type="button"
        onClick={onPickPerson}
        className="flex items-center gap-2 rounded-s px-2 py-1.5 text-left transition hover:bg-surface-3"
      >
        {data.person ? (
          <>
            <span className="flex-1 text-[15px] font-medium text-text-1">
              {data.person.nachname} {data.person.vorname}
            </span>
            <span className="rounded border border-blue/25 bg-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.10em] text-blue">
              {data.person.dienstgrad}
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 text-[14px] text-text-3">Person wählen</span>
            <Plus size={14} className="text-text-3" />
          </>
        )}
      </button>

      {filled ? (
        <button
          type="button"
          aria-pressed={data.atemschutzAktiv}
          onClick={onToggleAs}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition ${
            data.atemschutzAktiv
              ? "border-amber/45 bg-amber/15"
              : "border-border bg-surface-1 hover:border-border-strong"
          }`}
        >
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
              data.atemschutzAktiv ? "text-amber" : "text-text-3"
            }`}
          >
            AS
          </span>
          {data.atemschutzAktiv ? (
            <span className="border-l border-amber/35 pl-1.5 font-mono text-[11px] font-semibold tabular-nums text-amber">
              <span className="font-bold text-text-1">{data.atemschutzDauerMin}</span> min
            </span>
          ) : null}
        </button>
      ) : (
        <span aria-hidden />
      )}

      {filled && data.atemschutzAktiv ? (
        <div className="flex gap-0.5">
          <button
            type="button"
            aria-label="Minus"
            onClick={() => onChangeAs(clampAsDauer(data.atemschutzDauerMin - AS_STEP))}
            disabled={data.atemschutzDauerMin <= AS_MIN}
            className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-1 font-mono text-base font-semibold text-text-2 transition hover:bg-surface-3 disabled:opacity-30"
          >
            −
          </button>
          <button
            type="button"
            aria-label="Plus"
            onClick={() => onChangeAs(clampAsDauer(data.atemschutzDauerMin + AS_STEP))}
            disabled={data.atemschutzDauerMin >= AS_MAX}
            className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-1 font-mono text-base font-semibold text-text-2 transition hover:bg-surface-3 disabled:opacity-30"
          >
            +
          </button>
        </div>
      ) : (
        <span aria-hidden />
      )}
    </li>
  );
}

export function emptySlot(slot: number): MannschaftSlotData {
  return {
    slot,
    person: null,
    atemschutzAktiv: false,
    atemschutzDauerMin: AS_DEFAULT,
  };
}
