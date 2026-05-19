import { ChevronDown, Plus } from "lucide-react";
import type { PickPerson } from "./PersonPickerModal";

interface Props {
  label: string;
  person?: PickPerson | null;
  onOpen: () => void;
}

export function PersonButton({ label, person, onOpen }: Props) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-2.5 rounded-s border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:bg-surface-3"
      >
        {person ? (
          <>
            <span className="flex-1 text-[15px] font-medium text-text-1">
              {person.nachname} {person.vorname}
            </span>
            <span className="rounded border border-blue/25 bg-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.10em] text-blue">
              {person.dienstgrad}
            </span>
            <ChevronDown size={14} className="text-text-3" />
          </>
        ) : (
          <>
            <span className="flex-1 text-[15px] text-text-3">Person wählen</span>
            <Plus size={14} className="text-text-3" />
          </>
        )}
      </button>
    </label>
  );
}
