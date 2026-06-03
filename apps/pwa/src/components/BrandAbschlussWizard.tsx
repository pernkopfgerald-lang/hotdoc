// Issue 17 (Einsatz-Test 2026-06-02): Brand-Abschluss-Wizard.
//
// Wird auf der Florianstation VOR `handleAbschluss()` getriggert wenn der
// aktive Einsatz die Kategorie "brand" hat. 7 Steps fuehren den Einsatzleiter
// durch die syBOS Brand-Statistik-Felder; beim Abschliessen liefert
// onComplete() den fertigen brandStatistik-Block an die Page zurueck, die
// ihn dann via PUT /api/einsaetze/:id speichert + via PUT /api/objekte/:hash
// als Default-Cache fuer Folge-Einsaetze an derselben Adresse persistiert.
//
// Wichtige Eigenschaften:
//   - Cancel mid-flow → onCancel(), NICHTS wird geschrieben (Backwards-Compat
//     mit dem Standard-Abschluss-Workflow: User kann den Wizard schliessen
//     ohne dass ein leeres brandStatistik-Doc auf dem Einsatz landet).
//   - Wenn `lookupAdresse` gesetzt ist, holt der Wizard beim Open einen
//     objekt-Cache und belegt die Felder als Default vor.
//   - Personenrettung + Tierrettung verwenden dasselbe Shape wie die
//     Technische Statistik (syBOS-Maske spiegelt sich).

import { ArrowLeft, ArrowRight, CheckCircle2, Flame, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BRAND_AUSMASS,
  BRAND_BAUART,
  BRAND_ENTDECKUNG,
  BRAND_KATEGORIE,
  BRAND_KLASSE,
  BRAND_LAGE,
  BRAND_VERLAUF,
  OBJEKTART_1,
  OBJEKTART_2_BY_1,
} from "@hotdoc/shared";
import { apiCall } from "../lib/api";

export interface BrandStatistik {
  entdeckung: string[];
  ausmass?: string;
  klassen: string[];
  kategorie?: string;
  objektart1?: string;
  objektart2?: string;
  bauart?: string;
  lagen: string[];
  verlauf?: string;
  personenRettung: {
    anzahlPersonen: number;
    tot: number;
    verletzt: number;
    unverletzt: number;
  };
  tierRettung: { gross: number; klein: number };
}

const EMPTY: BrandStatistik = {
  entdeckung: [],
  klassen: [],
  lagen: [],
  personenRettung: { anzahlPersonen: 0, tot: 0, verletzt: 0, unverletzt: 0 },
  tierRettung: { gross: 0, klein: 0 },
};

interface Props {
  open: boolean;
  /** Adresse fuer Objekt-Lookup (Default-Vorbelegung bei Wiederholungs-Einsaetzen). */
  lookupAdresse?: string;
  /** Aktueller Stand vom Einsatz-Doc (Edit-Modus / 2. Durchlauf). */
  initial?: Partial<BrandStatistik> | null;
  onComplete: (data: BrandStatistik) => void;
  onCancel: () => void;
}

/**
 * 7-Step Brand-Statistik-Wizard. Cancel mid-flow → keine Datenpersistenz.
 * Lookup beim Open fuellt Defaults aus dem Objekt-Cache.
 */
export function BrandAbschlussWizard({
  open,
  lookupAdresse,
  initial,
  onComplete,
  onCancel,
}: Props) {
  const [step, setStep] = useState<number>(1);
  const [data, setData] = useState<BrandStatistik>(() => mergeInitial(EMPTY, initial));
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupBanner, setLookupBanner] = useState<string | null>(null);

  // Reset state + ggf. Objekt-Lookup beim (Re-)Open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setData(mergeInitial(EMPTY, initial));
    setLookupBanner(null);
    if (!lookupAdresse || lookupAdresse.trim().length < 5) return;
    let cancelled = false;
    setLookupLoading(true);
    (async () => {
      try {
        const url = `/api/objekte/lookup?adresse=${encodeURIComponent(lookupAdresse)}`;
        const r = await apiCall<{
          ok: true;
          found: boolean;
          data?: Partial<BrandStatistik>;
        }>(url);
        if (cancelled) return;
        if (r.found && r.data) {
          setData((prev) => mergeInitial(prev, r.data ?? null));
          setLookupBanner(
            "Objekt aus früherem Einsatz erkannt — Felder vorbelegt. Bitte prüfen und ggf. überschreiben.",
          );
        }
      } catch {
        // 401/403/404 – kein Default-Banner, einfach leer starten
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lookupAdresse]);

  const objektart2Choices = useMemo<readonly string[]>(() => {
    const k = data.objektart1 as keyof typeof OBJEKTART_2_BY_1 | undefined;
    if (!k) return [];
    return OBJEKTART_2_BY_1[k] ?? [];
  }, [data.objektart1]);

  if (!open) return null;

  const totalSteps = 7;
  const canBack = step > 1;
  const isLast = step === totalSteps;

  const toggle = <K extends "entdeckung" | "klassen" | "lagen">(
    key: K,
    item: string,
  ): void => {
    setData((p) => {
      const arr = p[key];
      return {
        ...p,
        [key]: arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item],
      };
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-wizard-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2600,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          maxWidth: 920,
          margin: "0 auto",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          maxHeight: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--surface-2)",
          }}
        >
          <Flame size={22} style={{ color: "var(--red)" }} />
          <div style={{ flex: 1 }}>
            <h2
              id="brand-wizard-title"
              style={{ margin: 0, fontSize: 22.5, fontWeight: 700 }}
            >
              Brand-Abschluss · syBOS-Statistik
            </h2>
            <div
              style={{ fontSize: 15, color: "var(--fg-3)", fontFamily: "var(--font-mono)" }}
            >
              Schritt {step} von {totalSteps}
              {lookupLoading ? " · Lade Objekt-Defaults …" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Abbrechen"
            style={{
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: "var(--fg)",
              padding: "8px 12px",
              borderRadius: 8,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 16.5,
            }}
          >
            <X size={14} /> Abbrechen
          </button>
        </div>

        {/* Progress */}
        <div style={{ padding: "0 24px", marginTop: 12 }}>
          <div
            style={{
              height: 4,
              background: "var(--surface-2)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${(step / totalSteps) * 100}%`,
                height: "100%",
                background: "var(--red)",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>

        {/* Lookup-Banner */}
        {lookupBanner && (
          <div
            style={{
              margin: "12px 24px 0",
              padding: "8px 12px",
              background: "var(--info-tint)",
              border: "1px solid var(--info-border)",
              color: "var(--info)",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {lookupBanner}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto" }}>
          {step === 1 && (
            <StepBlock
              title="1 · Brand-Entdeckung"
              hint="Wie wurde der Brand entdeckt? (Mehrfach möglich)"
            >
              <ChipMultiSelect
                options={BRAND_ENTDECKUNG}
                selected={data.entdeckung}
                onToggle={(s) => toggle("entdeckung", s)}
              />
            </StepBlock>
          )}

          {step === 2 && (
            <StepBlock title="2 · Brand-Ausmaß" hint="Welches Ausmaß hatte der Brand?">
              <RadioGroup
                options={BRAND_AUSMASS}
                value={data.ausmass}
                onChange={(v) => setData((p) => ({ ...p, ausmass: v }))}
              />
            </StepBlock>
          )}

          {step === 3 && (
            <StepBlock title="3 · Brand-Klassen" hint="Mehrfach möglich. Welche Brand-Klassen lagen vor?">
              <ChipMultiSelect
                options={BRAND_KLASSE}
                selected={data.klassen}
                onToggle={(s) => toggle("klassen", s)}
              />
            </StepBlock>
          )}

          {step === 4 && (
            <StepBlock title="4 · Kategorie + Objektart">
              <Label>Kategorie</Label>
              <RadioGroup
                options={BRAND_KATEGORIE}
                value={data.kategorie}
                onChange={(v) =>
                  setData((p) => {
                    // exactOptionalPropertyTypes: undefined explizit weglassen.
                    // Wenn Kategorie wechselt, droppen wir Objektart 1/2 komplett.
                    const next: BrandStatistik = { ...p, kategorie: v };
                    if (v !== "Gebäude") {
                      delete next.objektart1;
                      delete next.objektart2;
                    }
                    return next;
                  })
                }
              />
              {data.kategorie === "Gebäude" && (
                <>
                  <Label style={{ marginTop: 16 }}>Objektart 1</Label>
                  <RadioGroup
                    options={OBJEKTART_1}
                    value={data.objektart1}
                    onChange={(v) =>
                      setData((p) => {
                        // Wechsel der Objektart 1 → Objektart 2 zuruecksetzen.
                        const next: BrandStatistik = { ...p, objektart1: v };
                        delete next.objektart2;
                        return next;
                      })
                    }
                  />
                  {data.objektart1 && objektart2Choices.length > 0 && (
                    <>
                      <Label style={{ marginTop: 16 }}>Objektart 2</Label>
                      <RadioGroup
                        options={objektart2Choices}
                        value={data.objektart2}
                        onChange={(v) => setData((p) => ({ ...p, objektart2: v }))}
                      />
                    </>
                  )}
                </>
              )}
            </StepBlock>
          )}

          {step === 5 && (
            <StepBlock title="5 · Bauart + Lage">
              <Label>Bauart</Label>
              <RadioGroup
                options={BRAND_BAUART}
                value={data.bauart}
                onChange={(v) => setData((p) => ({ ...p, bauart: v }))}
              />
              <Label style={{ marginTop: 16 }}>Lage (mehrfach möglich)</Label>
              <ChipMultiSelect
                options={BRAND_LAGE}
                selected={data.lagen}
                onToggle={(s) => toggle("lagen", s)}
              />
            </StepBlock>
          )}

          {step === 6 && (
            <StepBlock title="6 · Verlauf" hint="Brand-Ausbreitung über den Verlauf des Einsatzes">
              <RadioGroup
                options={BRAND_VERLAUF}
                value={data.verlauf}
                onChange={(v) => setData((p) => ({ ...p, verlauf: v }))}
              />
            </StepBlock>
          )}

          {step === 7 && (
            <StepBlock title="7 · Personen- und Tierrettung">
              <Label>Personenrettung</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
                <NumberField
                  label="Anzahl"
                  value={data.personenRettung.anzahlPersonen}
                  onChange={(v) =>
                    setData((p) => ({
                      ...p,
                      personenRettung: { ...p.personenRettung, anzahlPersonen: v },
                    }))
                  }
                />
                <NumberField
                  label="Tot"
                  value={data.personenRettung.tot}
                  onChange={(v) =>
                    setData((p) => ({
                      ...p,
                      personenRettung: { ...p.personenRettung, tot: v },
                    }))
                  }
                />
                <NumberField
                  label="Verletzt"
                  value={data.personenRettung.verletzt}
                  onChange={(v) =>
                    setData((p) => ({
                      ...p,
                      personenRettung: { ...p.personenRettung, verletzt: v },
                    }))
                  }
                />
                <NumberField
                  label="Unverletzt"
                  value={data.personenRettung.unverletzt}
                  onChange={(v) =>
                    setData((p) => ({
                      ...p,
                      personenRettung: { ...p.personenRettung, unverletzt: v },
                    }))
                  }
                />
              </div>
              <Label style={{ marginTop: 16 }}>Tierrettung</Label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                <NumberField
                  label="Groß"
                  value={data.tierRettung.gross}
                  onChange={(v) =>
                    setData((p) => ({ ...p, tierRettung: { ...p.tierRettung, gross: v } }))
                  }
                />
                <NumberField
                  label="Klein"
                  value={data.tierRettung.klein}
                  onChange={(v) =>
                    setData((p) => ({ ...p, tierRettung: { ...p.tierRettung, klein: v } }))
                  }
                />
              </div>
            </StepBlock>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            disabled={!canBack}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            style={{
              padding: "10px 16px",
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: canBack ? "var(--fg)" : "var(--fg-3)",
              borderRadius: 10,
              fontWeight: 600,
              cursor: canBack ? "pointer" : "not-allowed",
              opacity: canBack ? 1 : 0.5,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
            }}
          >
            <ArrowLeft size={16} /> Zurück
          </button>
          {/* RISIKO-7 (Audit 2026-06-03): "Direkt abschließen"-Shortcut von
              jedem Step aus. Im Hochstress-Brandeinsatz will der EL den
              Hauptbericht oft sofort zumachen, ohne durch alle 7 Screens zu
              tippen. Ruft dasselbe onComplete(data) wie der finale Button —
              da alle Felder optional sind, ist auch ein leerer/Teil-Stand
              valide. Schreibt brandStatistik → der Wizard triggert beim
              nächsten Abschluss-Klick NICHT erneut. */}
          {!isLast ? (
            <button
              type="button"
              onClick={() => onComplete(data)}
              style={{
                padding: "10px 14px",
                background: "transparent",
                border: "1px solid var(--border-strong)",
                color: "var(--fg-2)",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 16.5,
                cursor: "pointer",
                minHeight: 44,
              }}
              title="Brand-Statistik überspringen und den Einsatz direkt abschließen"
            >
              Direkt abschließen
            </button>
          ) : null}
          {!isLast ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
              style={{
                padding: "10px 22px",
                background: "var(--red)",
                border: 0,
                color: "#fff",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
              }}
            >
              Weiter <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onComplete(data)}
              style={{
                padding: "10px 22px",
                background: "var(--red)",
                border: 0,
                color: "#fff",
                borderRadius: 10,
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
              }}
            >
              <CheckCircle2 size={16} /> Abschließen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mergeInitial(
  base: BrandStatistik,
  initial: Partial<BrandStatistik> | null | undefined,
): BrandStatistik {
  if (!initial) return base;
  return {
    entdeckung: initial.entdeckung ?? base.entdeckung,
    ...(initial.ausmass !== undefined ? { ausmass: initial.ausmass } : {}),
    klassen: initial.klassen ?? base.klassen,
    ...(initial.kategorie !== undefined ? { kategorie: initial.kategorie } : {}),
    ...(initial.objektart1 !== undefined ? { objektart1: initial.objektart1 } : {}),
    ...(initial.objektart2 !== undefined ? { objektart2: initial.objektart2 } : {}),
    ...(initial.bauart !== undefined ? { bauart: initial.bauart } : {}),
    lagen: initial.lagen ?? base.lagen,
    ...(initial.verlauf !== undefined ? { verlauf: initial.verlauf } : {}),
    personenRettung: {
      anzahlPersonen:
        initial.personenRettung?.anzahlPersonen ?? base.personenRettung.anzahlPersonen,
      tot: initial.personenRettung?.tot ?? base.personenRettung.tot,
      verletzt: initial.personenRettung?.verletzt ?? base.personenRettung.verletzt,
      unverletzt:
        initial.personenRettung?.unverletzt ?? base.personenRettung.unverletzt,
    },
    tierRettung: {
      gross: initial.tierRettung?.gross ?? base.tierRettung.gross,
      klein: initial.tierRettung?.klein ?? base.tierRettung.klein,
    },
  };
}

function StepBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 style={{ margin: 0, fontSize: 21.5, fontWeight: 700 }}>{title}</h3>
      {hint && (
        <p style={{ margin: "4px 0 16px", color: "var(--fg-3)", fontSize: 16.5 }}>{hint}</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function Label({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 15,
        fontWeight: 700,
        color: "var(--fg-2)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function ChipMultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (s: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onToggle(opt)}
            aria-pressed={on}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${on ? "var(--red)" : "var(--border-strong)"}`,
              background: on ? "var(--red)" : "transparent",
              color: on ? "#fff" : "var(--fg)",
              fontSize: 16.5,
              fontWeight: 600,
              cursor: "pointer",
              minHeight: 36,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RadioGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const on = value === opt;
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onChange(opt)}
            aria-pressed={on}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${on ? "var(--red)" : "var(--border-strong)"}`,
              background: on ? "var(--red-tint)" : "transparent",
              color: on ? "var(--red)" : "var(--fg)",
              fontSize: 16.5,
              fontWeight: on ? 700 : 600,
              cursor: "pointer",
              minHeight: 36,
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 15, color: "var(--fg-3)" }}>{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontSize: 17.5,
          textAlign: "right",
          width: "100%",
        }}
      />
    </div>
  );
}
