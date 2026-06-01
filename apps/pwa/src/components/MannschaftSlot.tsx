import { AS_DEFAULT, AS_MAX, AS_MIN, AS_STEP, clampAsDauer } from "@hotdoc/shared";
import { Minus, Plus, X } from "lucide-react";
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
  /** Slot leeren (Person raus, AS aus). */
  onClearPerson: () => void;
}

/**
 * MannschaftSlot — Design `.crew-row` mit `.crew-num`, `.avatar`,
 * `.crew-name`, `.crew-meta` (Rank-Badge + AS-Timer + Icon-Buttons).
 * Leere Plätze: `.crew-row.empty` (dashed border, "Person hinzufügen").
 */
export function MannschaftSlot({ data, onPickPerson, onToggleAs, onChangeAs, onClearPerson }: Props) {
  const filled = !!data.person;

  if (!filled) {
    // D-13: Die ganze Row ist klickbar (role="button" + onClick + Enter/Space).
    // Das Plus-Icon ist rein visuell — kein nested Button mit eigenem onClick.
    // Frueher war der Plus-Button doppelt verkabelt was Screen-Reader irrefuehrt
    // ("Person waehlen" + parent Row-Klick = zwei semantische Aktionen).
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onPickPerson}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onPickPerson();
        }}
        className="crew-row empty"
        aria-label={`Person fuer Slot ${data.slot} waehlen`}
      >
        <div className="crew-num">{data.slot}</div>
        <div className="crew-name placeholder">Person hinzufügen</div>
        <div className="crew-meta" aria-hidden="true">
          <span
            className="icon-btn"
            style={{ pointerEvents: "none" }}
          >
            <Plus size={14} strokeWidth={2.5} />
          </span>
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
        {/* Mit aktivem AS: Minus = AS beenden. Sonst: roter X = Slot leeren
            (Person raus). Versehentlich gewaehlt war frueher ein Wechsel-
            Button mit Plus-Icon — das war irrefuehrend und der Slot liess
            sich nicht mehr leeren wenn die Person gar nicht mitgefahren ist. */}
        {data.atemschutzAktiv ? (
          <button
            type="button"
            className="icon-btn"
            aria-label="AS beenden"
            onClick={onToggleAs}
            title="Atemschutz beenden"
          >
            <Minus size={14} strokeWidth={2.5} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Person aus Slot entfernen"
            title="Person aus Slot entfernen"
            onClick={onClearPerson}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
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
