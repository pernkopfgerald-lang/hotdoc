import { Euro, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TARIFORDNUNG_2026,
  euroText,
  findeTarifPosition,
  type VerrechnungEingaben,
  type VerrechnungErgebnis,
  type VerrechnungFzgEingabe,
  type VerrechnungsGruppe,
  type VerrechnungsArt,
} from "@hotdoc/shared";
import { getVerrechnung, speichereVerrechnung, vorschauVerrechnung } from "../api/verrechnung";

/**
 * Verrechnung nach Feuerwehr-Tarifordnung 2026 im Bericht-Detail.
 *
 * Das Verrechnungsblatt am Ende des Einsatzberichts (PDF) wird IMMER erzeugt —
 * hoheitlich oder nicht-hoheitlich. Hier legt der Funktionaer die Verrechnungsart
 * fest, korrigiert Fahrzeugzeiten, markiert nicht erforderliche/nur
 * bereitgestellte Fahrzeuge und erfasst Zusatzleistungen und Verbrauchsmaterial.
 * Die Vorschau rechnet live am Server (gleiche Regeln wie das PDF).
 *
 * Auf Fahrzeugen verlastete Geraete werden NICHT erfasst/ausgewiesen
 * (Tarifordnung Pkt. 2 Abs. 6) — Zusatzpositionen sind nur fuer Geraete gedacht,
 * die nicht zur Standard-Beladung gehoeren.
 */

interface FahrzeugOption {
  id: string;
  label: string;
}

interface Props {
  einsatzId: string;
  fahrzeuge: FahrzeugOption[];
  staplerEingesetzt: boolean;
  /** Mindestens Funktionaer darf speichern. */
  darfSchreiben: boolean;
  onGespeichert?: () => void;
}

const GRUPPEN_TITEL: Record<VerrechnungsGruppe, string> = {
  fahrzeuge: "Fahrzeuge und Anhänger",
  mannschaft: "Mannschaft",
  zusatz: "Zusatzleistungen",
  verbrauch: "Verbrauchsmaterial",
};

const POSITIONEN_AUSWAHL = TARIFORDNUNG_2026.filter((p) => p.gruppe < 14).map((p) => ({
  pos: p.pos,
  label: `${p.pos} · ${p.bezeichnung.slice(0, 70)}`,
}));

const VERBRAUCH_POS: Array<{ pos: "14.01" | "14.02" | "14.03" | "14.04"; label: string }> = [
  { pos: "14.01", label: "14.01 Kraftstoffe, Öle, Reinigungsmittel" },
  { pos: "14.02", label: "14.02 Pölzmaterial" },
  { pos: "14.03", label: "14.03 Atemschutzmaterial" },
  { pos: "14.04", label: "14.04 Sonstiges Verbrauchsmaterial" },
];

function neueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function zahl(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function VerrechnungPanel({ einsatzId, fahrzeuge, staplerEingesetzt, darfSchreiben, onGespeichert }: Props) {
  const [eingaben, setEingabenRaw] = useState<VerrechnungEingaben | null>(null);
  const [ergebnis, setErgebnis] = useState<VerrechnungErgebnis | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const vorschauSeq = useRef(0);

  useEffect(() => {
    let abgebrochen = false;
    setEingabenRaw(null);
    setErgebnis(null);
    setDirty(false);
    void (async () => {
      try {
        const r = await getVerrechnung(einsatzId);
        if (abgebrochen) return;
        setEingabenRaw(r.eingaben ?? {});
        setErgebnis(r.ergebnis);
      } catch (e) {
        if (!abgebrochen) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [einsatzId]);

  // Live-Vorschau: 600 ms nach der letzten Aenderung am Server rechnen.
  const setEingaben = useCallback(
    (next: VerrechnungEingaben) => {
      setEingabenRaw(next);
      setDirty(true);
      setSaved(false);
      const seq = ++vorschauSeq.current;
      window.setTimeout(() => {
        if (seq !== vorschauSeq.current) return;
        void vorschauVerrechnung(einsatzId, next)
          .then((r) => {
            if (seq === vorschauSeq.current) setErgebnis(r.ergebnis);
          })
          .catch((e: unknown) => {
            if (seq === vorschauSeq.current) setErr(e instanceof Error ? e.message : String(e));
          });
      }, 600);
    },
    [einsatzId],
  );

  const fzgListe = useMemo(
    () => [...fahrzeuge, ...(staplerEingesetzt ? [{ id: "stapler", label: "Gabelstapler" }] : [])],
    [fahrzeuge, staplerEingesetzt],
  );

  if (!eingaben) {
    return (
      <section style={{ marginTop: 20 }}>
        <p style={{ color: "var(--fg-3)", fontSize: 13 }}>{err ?? "Verrechnung lädt …"}</p>
      </section>
    );
  }

  const aendereFzg = (id: string, patch: { [K in keyof VerrechnungFzgEingabe]?: VerrechnungFzgEingabe[K] | undefined }) => {
    const alt = eingaben.fahrzeuge?.[id] ?? {};
    const roh: Record<string, unknown> = { ...alt, ...patch };
    // leere Felder entfernen
    for (const k of Object.keys(roh)) {
      if (roh[k] === undefined || roh[k] === false || roh[k] === "") delete roh[k];
    }
    const neu = roh as VerrechnungFzgEingabe;
    const fz = { ...(eingaben.fahrzeuge ?? {}) };
    if (Object.keys(neu).length === 0) delete fz[id];
    else fz[id] = neu;
    setEingaben({ ...eingaben, fahrzeuge: fz });
  };

  async function speichern() {
    if (!eingaben) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await speichereVerrechnung(einsatzId, eingaben);
      setEingabenRaw(r.eingaben);
      setErgebnis(r.ergebnis);
      setDirty(false);
      setSaved(true);
      onGespeichert?.();
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const feldStil = { width: "100%" } as const;

  return (
    <section
      style={{
        marginTop: 20,
        padding: 14,
        borderRadius: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        <Euro size={12} /> Verrechnung · Feuerwehr-Tarifordnung 2026
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {saved ? <span className="badge ok">gespeichert</span> : dirty ? <span className="badge neutral">ungespeichert</span> : null}
          {darfSchreiben ? (
            <button
              type="button"
              className="cta"
              onClick={() => void speichern()}
              disabled={busy || !dirty}
              style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
            >
              {busy ? "Speichert …" : "Speichern"}
            </button>
          ) : null}
        </span>
      </header>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.5 }}>
        Das Verrechnungsblatt steht am Ende jedes Einsatzberichts – hoheitlich oder nicht. Geräte, die auf den Fahrzeugen
        verlastet sind, werden nicht gesondert ausgewiesen (Pkt. 2 Abs. 6).
      </p>

      {err ? (
        <div role="alert" style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--red-border)", background: "var(--red-tint)", color: "var(--red)", fontSize: 13 }}>
          {err}
        </div>
      ) : null}

      <fieldset disabled={!darfSchreiben} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {/* Art */}
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Verrechnungsart</label>
        <select
          className="input"
          value={eingaben.art ?? ""}
          onChange={(e) => {
            const v = e.target.value as VerrechnungsArt | "";
            const { art: _alt, ...rest } = eingaben;
            void _alt;
            setEingaben(v ? { ...rest, art: v } : rest);
          }}
          style={{ ...feldStil, maxWidth: 420 }}
        >
          <option value="">noch nicht festgelegt</option>
          <option value="hoheitlich">Hoheitlicher Einsatz (Kosten werden ausgewiesen)</option>
          <option value="nicht-hoheitlich">Nicht-hoheitlicher Einsatz (zu verrechnen)</option>
        </select>

        {/* Fahrzeuge */}
        <h4 style={{ margin: "16px 0 6px", fontSize: 13 }}>Fahrzeuge</h4>
        {fzgListe.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: 0 }}>Keine Fahrzeugberichte vorhanden.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fzgListe.map((f) => {
              const e = eingaben.fahrzeuge?.[f.id] ?? {};
              return (
                <div key={f.id} style={{ display: "grid", gridTemplateColumns: "minmax(110px,1fr) auto auto 130px", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <strong>{f.label}</strong>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }} title="Nicht für den Einsatz erforderlich – nicht verrechnen (Pkt. 2 Abs. 10)">
                    <input type="checkbox" checked={e.nichtErforderlich === true} onChange={(ev) => aendereFzg(f.id, { nichtErforderlich: ev.target.checked })} />
                    nicht erforderlich
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center" }} title="Nur bereitgestellt, nicht im Einsatz – 60 % (Pkt. 2 Abs. 7)">
                    <input type="checkbox" checked={e.nurBereitgestellt === true} onChange={(ev) => aendereFzg(f.id, { nurBereitgestellt: ev.target.checked })} />
                    nur bereitgestellt (60 %)
                  </label>
                  <input
                    className="input num"
                    inputMode="numeric"
                    placeholder="Dauer (Min.)"
                    title="Dauer in Minuten überschreiben (sonst Fahrzeugzeit von/bis)"
                    value={e.minuten ?? ""}
                    onChange={(ev) => {
                      const n = zahl(ev.target.value);
                      aendereFzg(f.id, { minuten: n !== undefined && n >= 1 ? Math.round(n) : undefined });
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Zusatzpositionen */}
        <h4 style={{ margin: "16px 0 4px", fontSize: 13 }}>Zusatzleistungen (Tarif A/B/C)</h4>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--fg-3)" }}>
          z. B. 12.01 Wohnungsöffnung, 12.08 Liftöffnung, 13.04 Fehlalarm – oder ein Gerät, das <strong>nicht</strong> zur Standard-Beladung gehört.
        </p>
        <datalist id="vr-positionen">
          {POSITIONEN_AUSWAHL.map((p) => (
            <option key={p.pos} value={p.pos} label={p.label} />
          ))}
        </datalist>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(eingaben.zusatz ?? []).map((z) => {
            const t = findeTarifPosition(z.pos);
            const nachAufwand = t?.einheit === "nach_aufwand";
            const zeitbezogen = t?.einheit === "stunde" || t?.einheit === "zeit" || t?.einheit === "viertelstunde" || t?.einheit === "tagessatz";
            const upd = (patch: Partial<typeof z>) =>
              setEingaben({ ...eingaben, zusatz: (eingaben.zusatz ?? []).map((x) => (x.id === z.id ? { ...x, ...patch } : x)) });
            return (
              <div key={z.id} style={{ display: "grid", gridTemplateColumns: "90px 70px 90px 100px 1fr auto", gap: 8, alignItems: "start" }}>
                <input className="input" list="vr-positionen" placeholder="Pos." value={z.pos} onChange={(ev) => upd({ pos: ev.target.value })} />
                <input className="input num" placeholder="Menge" inputMode="decimal" value={z.menge ?? ""} onChange={(ev) => { const n = zahl(ev.target.value); const { menge: _m, ...rest } = z; void _m; setEingaben({ ...eingaben, zusatz: (eingaben.zusatz ?? []).map((x) => (x.id === z.id ? (n && n > 0 ? { ...rest, menge: n } : rest) : x)) }); }} />
                <input className="input num" placeholder={zeitbezogen ? "Dauer (Min.)" : "—"} disabled={!zeitbezogen} inputMode="numeric" value={z.minuten ?? ""} onChange={(ev) => { const n = zahl(ev.target.value); const { minuten: _m, ...rest } = z; void _m; setEingaben({ ...eingaben, zusatz: (eingaben.zusatz ?? []).map((x) => (x.id === z.id ? (n && n >= 1 ? { ...rest, minuten: Math.round(n) } : rest) : x)) }); }} />
                <input className="input num" placeholder={nachAufwand ? "Betrag €" : "—"} disabled={!nachAufwand} inputMode="decimal" value={z.betrag ?? ""} onChange={(ev) => { const n = zahl(ev.target.value); const { betrag: _b, ...rest } = z; void _b; setEingaben({ ...eingaben, zusatz: (eingaben.zusatz ?? []).map((x) => (x.id === z.id ? (n !== undefined ? { ...rest, betrag: n } : rest) : x)) }); }} />
                <div>
                  <input className="input" placeholder="Bemerkung (optional)" value={z.bemerkung ?? ""} onChange={(ev) => upd({ bemerkung: ev.target.value })} />
                  <div style={{ fontSize: 11.5, color: t ? "var(--fg-3)" : "var(--red)", marginTop: 2 }}>
                    {t ? `${t.bezeichnung.slice(0, 90)}` : "Unbekannte Position"}
                  </div>
                </div>
                <button type="button" className="add-btn" aria-label="Entfernen" onClick={() => setEingaben({ ...eingaben, zusatz: (eingaben.zusatz ?? []).filter((x) => x.id !== z.id) })}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="cta" style={{ width: "auto", marginTop: 8, padding: "6px 12px", fontSize: 12, background: "transparent", color: "var(--info)", border: "1px solid var(--info)" }}
          onClick={() => setEingaben({ ...eingaben, zusatz: [...(eingaben.zusatz ?? []), { id: neueId(), pos: "12.01" }] })}>
          <Plus size={14} /> Position hinzufügen
        </button>

        {/* Verbrauch */}
        <h4 style={{ margin: "16px 0 4px", fontSize: 13 }}>Verbrauchsmaterial (Tarif D, nach Tagespreis)</h4>
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--fg-3)" }}>
          Ölbindemittel aus den Fahrzeugberichten wird automatisch angeführt (Preis je Sack unter Verwaltung → Tarifordnung).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(eingaben.verbrauch ?? []).map((v) => {
            const upd = (patch: Partial<typeof v>) =>
              setEingaben({ ...eingaben, verbrauch: (eingaben.verbrauch ?? []).map((x) => (x.id === v.id ? { ...x, ...patch } : x)) });
            return (
              <div key={v.id} style={{ display: "grid", gridTemplateColumns: "230px 1fr 110px auto", gap: 8 }}>
                <select className="input" value={v.pos} onChange={(ev) => upd({ pos: ev.target.value as typeof v.pos })}>
                  {VERBRAUCH_POS.map((o) => (
                    <option key={o.pos} value={o.pos}>{o.label}</option>
                  ))}
                </select>
                <input className="input" placeholder="Bezeichnung (z. B. Diesel für Stromerzeuger)" value={v.text} onChange={(ev) => upd({ text: ev.target.value })} />
                <input className="input num" placeholder="Betrag €" inputMode="decimal" value={v.betrag ?? ""} onChange={(ev) => { const n = zahl(ev.target.value); const { betrag: _b, ...rest } = v; void _b; setEingaben({ ...eingaben, verbrauch: (eingaben.verbrauch ?? []).map((x) => (x.id === v.id ? (n !== undefined ? { ...rest, betrag: n } : rest) : x)) }); }} />
                <button type="button" className="add-btn" aria-label="Entfernen" onClick={() => setEingaben({ ...eingaben, verbrauch: (eingaben.verbrauch ?? []).filter((x) => x.id !== v.id) })}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="cta" style={{ width: "auto", marginTop: 8, padding: "6px 12px", fontSize: 12, background: "transparent", color: "var(--info)", border: "1px solid var(--info)" }}
          onClick={() => setEingaben({ ...eingaben, verbrauch: [...(eingaben.verbrauch ?? []), { id: neueId(), pos: "14.04", text: "" }] })}>
          <Plus size={14} /> Verbrauchsmaterial hinzufügen
        </button>

        <h4 style={{ margin: "16px 0 4px", fontSize: 13 }}>Bemerkung (erscheint auf dem Verrechnungsblatt)</h4>
        <textarea className="input" rows={2} style={{ width: "100%", resize: "vertical" }} value={eingaben.bemerkung ?? ""} onChange={(ev) => { const { bemerkung: _b, ...rest } = eingaben; void _b; setEingaben(ev.target.value ? { ...rest, bemerkung: ev.target.value } : rest); }} />
      </fieldset>

      {/* Vorschau */}
      <h4 style={{ margin: "18px 0 6px", fontSize: 13 }}>Vorschau Verrechnungsblatt</h4>
      {ergebnis ? <VorschauTabelle e={ergebnis} /> : <p style={{ fontSize: 12.5, color: "var(--fg-3)" }}>Keine Vorschau verfügbar (Übungen werden nicht verrechnet).</p>}
    </section>
  );
}

function VorschauTabelle({ e }: { e: VerrechnungErgebnis }) {
  const gruppen: VerrechnungsGruppe[] = ["fahrzeuge", "mannschaft", "zusatz", "verbrauch"];
  const th = { textAlign: "left" as const, fontSize: 11, padding: "4px 6px", background: "var(--surface-3)", borderBottom: "1px solid var(--border)" };
  const td = { padding: "4px 6px", fontSize: 12.5, borderBottom: "1px solid var(--border)", verticalAlign: "top" as const };
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{e.artText}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Pos.</th>
              <th style={th}>Leistung</th>
              <th style={th}>Dauer / Menge</th>
              <th style={th}>Tarif</th>
              <th style={{ ...th, textAlign: "right" }}>Betrag</th>
            </tr>
          </thead>
          <tbody>
            {gruppen.map((g) => {
              const z = e.zeilen.filter((x) => x.gruppe === g);
              if (z.length === 0) return null;
              return (
                <FragmentGruppe key={g} titel={GRUPPEN_TITEL[g]} zeilen={z} td={td} />
              );
            })}
            {e.zeilen.length === 0 ? (
              <tr><td colSpan={5} style={{ ...td, color: "var(--fg-3)" }}>Keine verrechenbaren Leistungen erfasst.</td></tr>
            ) : null}
            <tr>
              <td colSpan={4} style={{ ...td, textAlign: "right", fontWeight: 800 }}>
                Summe gemäß Tarifordnung{e.hatOffenePositionen ? " (vorläufig)" : ""}
              </td>
              <td style={{ ...td, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }}>€ {euroText(e.summe)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {e.warnungen.length > 0 ? (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--warn)" }}>
          {e.warnungen.map((w) => (<li key={w}>{w}</li>))}
        </ul>
      ) : null}
    </div>
  );
}

function FragmentGruppe({ titel, zeilen, td }: { titel: string; zeilen: VerrechnungErgebnis["zeilen"]; td: React.CSSProperties }) {
  return (
    <>
      <tr>
        <td colSpan={5} style={{ ...td, background: "var(--info-tint)", fontWeight: 700, fontSize: 12 }}>{titel}</td>
      </tr>
      {zeilen.map((z, i) => (
        <tr key={`${z.pos}-${i}`}>
          <td style={{ ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{z.pos}</td>
          <td style={td}>
            {z.text}
            {z.hinweis ? <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{z.hinweis}</div> : null}
          </td>
          <td style={td}>{z.mengeText}</td>
          <td style={td}>{z.tarifText}</td>
          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
            {z.betrag === null ? <strong style={{ color: "var(--warn)" }}>offen</strong> : `€ ${euroText(z.betrag)}`}
          </td>
        </tr>
      ))}
    </>
  );
}
