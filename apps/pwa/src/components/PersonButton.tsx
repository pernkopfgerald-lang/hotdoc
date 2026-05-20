import { ChevronDown, Plus } from "lucide-react";
import type { PickPerson } from "./PersonPickerModal";

interface Props {
  label: string;
  person?: PickPerson | null;
  onOpen: () => void;
}

/**
 * PersonButton — Design-Vorlage `.person` mit `.avatar` (Initialen) +
 * `.name` + Dienstgrad-`.badge.rank` + chevron. Avatar-Farbe wird
 * deterministisch aus der syBosId abgeleitet (color-a … color-f).
 */
export function PersonButton({ label, person, onOpen }: Props) {
  return (
    <div className="field">
      <label className="caption">{label}</label>
      <button
        type="button"
        onClick={onOpen}
        className={`person${person ? " filled" : ""}`}
      >
        {person ? (
          <>
            <span className={`avatar ${avatarColor(person.syBosId)}`}>
              {initials(person)}
            </span>
            <div className="name">
              {person.nachname} {person.vorname}
            </div>
            <div className="badges">
              <span className="badge rank">{person.dienstgrad}</span>
            </div>
            <div className="chev" style={{ marginLeft: 4 }}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </div>
          </>
        ) : (
          <>
            <span className="avatar">
              <Plus size={16} />
            </span>
            <div className="name placeholder">Person wählen</div>
            <div className="chev" style={{ marginLeft: 4 }}>
              <ChevronDown size={14} strokeWidth={2.5} />
            </div>
          </>
        )}
      </button>
    </div>
  );
}

/** Initialen aus Nachname + Vorname. "Eder Christoph" → "EC" */
export function initials(p: PickPerson): string {
  const n = p.nachname?.[0] ?? "";
  const v = p.vorname?.[0] ?? "";
  return (n + v).toUpperCase() || "?";
}

/** Deterministische Avatar-Farbe aus syBosId — bleibt stabil über Sessions */
export function avatarColor(id: number): string {
  const colors = ["color-a", "color-b", "color-c", "color-d", "color-e", "color-f"];
  return colors[Math.abs(id) % colors.length]!;
}
