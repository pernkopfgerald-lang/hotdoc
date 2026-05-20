import { AS_DEFAULT, AS_MAX, AS_MIN, AS_STEP, clampAsDauer } from "@hotdoc/shared";
import { Minus, Plus } from "lucide-react";
import type { PickPerson } from "./PersonPickerModal";
import { avatarColor, initials } from "./PersonButton";

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

/**
 * MannschaftSlot — Design `.crew-row` mit `.crew-num`, `.avatar`,
 * `.crew-name`, `.crew-meta` (Rank-Badge + AS-Timer + Icon-Buttons).
 * Leere Plätze: `.crew-row.empty` (dashed border, "Person hinzufügen").
 */
export function MannschaftSlot({ data, onPickPerson, onToggleAs, onChangeAs }: Props) {
  const filled = !!data.person;

  if (!filled) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onPickPerson}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onPickPerson();
        }}
        className="crew-row empty"
      >
        <div className="crew-num">{data.slot}</div>
        <div className="crew-name placeholder">Person hinzufügen</div>
        <div className="crew-meta">
          <button
            type="button"
            className="icon-btn"
            aria-label="Person wählen"
            onClick={(e) => {
              e.stopPropagation();
              onPickPerson();
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    );
  }

  const p = data.person!;
  return (
    <div className="crew-row filled">
      <div className="crew-num">{data.slot}</div>
      <button
        type="button"
        onClick={onPickPerson}
        className={`avatar ${avatarColor(p.syBosId)}`}
        title="Person wechseln"
      >
        {initials(p)}
      </button>
      <button
        type="button"
        onClick={onPickPerson}
        className="crew-name"
        style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        {p.nachname} {p.vorname}
      </button>
      <div className="crew-meta">
        <span className="badge rank">{p.dienstgrad}</span>
        {data.atemschutzAktiv ? (
          <AsTimer
            minutes={data.atemschutzDauerMin}
            onMinus={() => onChangeAs(clampAsDauer(data.atemschutzDauerMin - AS_STEP))}
            onPlus={() => onChangeAs(clampAsDauer(data.atemschutzDauerMin + AS_STEP))}
            minusDisabled={data.atemschutzDauerMin <= AS_MIN}
            plusDisabled={data.atemschutzDauerMin >= AS_MAX}
          />
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label="Atemschutz aktivieren"
            onClick={onToggleAs}
            title="Atemschutz aktivieren"
            style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11, letterSpacing: "0.06em" }}
          >
            AS
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={data.atemschutzAktiv ? "AS beenden" : "Person entfernen"}
          onClick={data.atemschutzAktiv ? onToggleAs : onPickPerson}
        >
          {data.atemschutzAktiv ? <Minus size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}

function AsTimer({
  minutes,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  minutes: number;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled: boolean;
  plusDisabled: boolean;
}) {
  return (
    <span className="as-timer">
      <span className="tag">AS</span>
      <span className="val">{minutes} min</span>
      <button
        type="button"
        aria-label="AS-Dauer minus"
        onClick={onMinus}
        disabled={minusDisabled}
        className="icon-btn"
        style={{
          background: "transparent",
          border: 0,
          width: 24,
          height: 24,
          minHeight: 24,
          color: "var(--as)",
          marginLeft: 2,
          opacity: minusDisabled ? 0.3 : 1,
        }}
      >
        <Minus size={11} strokeWidth={3} />
      </button>
      <button
        type="button"
        aria-label="AS-Dauer plus"
        onClick={onPlus}
        disabled={plusDisabled}
        className="icon-btn"
        style={{
          background: "transparent",
          border: 0,
          width: 24,
          height: 24,
          minHeight: 24,
          color: "var(--as)",
          opacity: plusDisabled ? 0.3 : 1,
        }}
      >
        <Plus size={11} strokeWidth={3} />
      </button>
    </span>
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
