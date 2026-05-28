import { useState } from "react";
import { cycleMode, getState, labelFor, type FxMode } from "../lib/fx-mode";

/**
 * Mini-Badge im Footer — zeigt den aktuellen Performance-Modus und cyclt
 * bei Klick durch Auto → Lite → Full → Auto. Ältere Tablets (Lenovo
 * TB-X606X, Galaxy Tab A) landen via Auto-Detection auf Lite — der User
 * kann das hier overriden falls die Detection daneben liegt.
 */
export function FxToggle() {
  const [state, setState] = useState(() => getState());

  function onClick() {
    const next = cycleMode();
    setState({ override: next.override, effective: next.effective });
  }

  const label = labelFor(state.override, state.effective);
  const cls = `fx-badge ${state.override}`;

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      title={
        state.override === "auto"
          ? `Performance-Modus: Auto — System hat ${state.effective === "lite" ? "Lite (schwaches Tablet erkannt)" : "Full (starkes Gerät)"} gewählt. Klick: manuell wechseln.`
          : state.override === "lite"
            ? "Performance-Modus: Lite (manuell). Ohne Glas-Blur, ohne Animations — flüssig auf älteren Tablets. Klick: Full"
            : "Performance-Modus: Full (manuell). Volle Glas-Optik. Klick: Auto"
      }
      style={{ minHeight: 0 }}
    >
      <span className="dot" />
      {label}
    </button>
  );
}

export type { FxMode };
