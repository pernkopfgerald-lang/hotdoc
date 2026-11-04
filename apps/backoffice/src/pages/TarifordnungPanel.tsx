import { Euro, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  FAHRZEUGE,
  GEBUEHREN_TEXT_STANDARD,
  TARIFORDNUNG_2026,
  TARIFORDNUNG_JAHR,
  TARIFORDNUNG_STAND,
  TARIF_GRUPPEN,
  euroText,
  normalisiereTarifEinstellungen,
  tarifAbschnitt,
  wirksamePosition,
  type PreisUeberschreibung,
  type TarifEinstellungen,
  type TarifPosition,
  type VerbrauchListenEintrag,
} from "@hotdoc/shared";
import { getConfig, putConfig } from "../api/config";
import { FAHRZEUG_IDS } from "../lib/fahrzeuge";

/**
 * Feuerwehr-Tarifordnung 2026 (Oö. LFV, Richtlinie 6.3.006) im Backoffice:
 *  - Fahrzeug-/Anhaenger-/Stapler-Zuordnung zu den Tarifpositionen (Tarif A, Pkt. 2)
 *  - Tagespreis fuer Verbrauchsmaterial (Oelbindemittel)
 *  - komplettes Tarifverzeichnis (nur Ansicht; Preise koennen bei einer neuen
 *    Tarifordnung ueberschrieben und zurueckgesetzt werden)
 * Die Berechnung selbst (Mindeststunden, Pauschalen, Bereitstellung 60 %) laeuft
 * zentral am Server und ist im Verrechnungsblatt jedes Einsatzberichts sichtbar.
 */

const FAHRZEUG_TARIFE = TARIFORDNUNG_2026.filter((p) => p.gruppe === 2);

function satzText(p: TarifPosition | undefined): string {
  if (!p) return "—";
  const teile: string[] = [];
  if (p.satzStunde !== undefined) teile.push(`${euroText(p.satzStunde)} / Std.`);
  if (p.satzPauschal !== undefined) teile.push(`Pauschale ${euroText(p.satzPauschal)} (${p.pauschalZeitraumStd ?? 24} Std.)`);
  if (p.festbetrag !== undefined) teile.push(`${euroText(p.festbetrag)}`);
  if (p.mindestbetrag !== undefined) teile.push(`mind. ${euroText(p.mindestbetrag)}`);
  return teile.length ? teile.join(" · ") : "nach Aufwand / Tagespreis";
}

const EINHEIT_TEXT: Record<TarifPosition["einheit"], string> = {
  stunde: "je Std.",
  viertelstunde: "je Viertelstd.",
  zeit: "je Std. + Pauschale",
  tagessatz: "Tagessatz",
  stueck: "je Stück",
  pauschal: "pauschal",
  je_fahrt: "je Fahrt",
  je_monat: "je Monat",
  je_fall: "je Fall",
  nach_aufwand: "nach Aufwand",
};

function parseZahl(v: string): number | undefined {
  const n = Number(v.replace(",", "."));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function TarifordnungPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [cfg, setCfgRaw] = useState<TarifEinstellungen | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [suche, setSuche] = useState("");
  const [gruppe, setGruppe] = useState<number | "alle">("alle");

  useEffect(() => {
    void (async () => {
      try {
        const r = await getConfig<Partial<TarifEinstellungen>>("tarifordnung");
        setCfgRaw(normalisiereTarifEinstellungen(r.data));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  function setCfg(next: TarifEinstellungen) {
    setCfgRaw(next);
    setDirty(true);
    setSaved(false);
    onDirtyChange?.(true);
  }

  async function save() {
    if (!cfg) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await putConfig<TarifEinstellungen>("tarifordnung", cfg);
      setCfgRaw(normalisiereTarifEinstellungen(r.data));
      setDirty(false);
      onDirtyChange?.(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const verzeichnis = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return TARIFORDNUNG_2026.filter(
      (p) =>
        (gruppe === "alle" || p.gruppe === gruppe) &&
        (!q || p.pos.includes(q) || p.bezeichnung.toLowerCase().includes(q)),
    );
  }, [suche, gruppe]);

  if (!cfg) {
    return <p style={{ color: "var(--fg-3)", fontSize: 13 }}>{err ?? "lade …"}</p>;
  }

  const ueberschriebene = Object.keys(cfg.preise).length;

  function setPreis(pos: string, feld: keyof PreisUeberschreibung, wert: number | undefined) {
    if (!cfg) return;
    const basis = TARIFORDNUNG_2026.find((p) => p.pos === pos);
    if (!basis) return;
    const alt = { ...(cfg.preise[pos] ?? {}) };
    if (wert === undefined || wert === basis[feld]) delete alt[feld];
    else alt[feld] = wert;
    const preise = { ...cfg.preise };
    if (Object.keys(alt).length === 0) delete preise[pos];
    else preise[pos] = alt;
    setCfg({ ...cfg, preise });
  }

  const zuordnung = (wert: string, onChange: (pos: string) => void) => (
    <select className="input" value={wert} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
      {FAHRZEUG_TARIFE.map((p) => (
        <option key={p.pos} value={p.pos}>
          {p.pos} · {p.bezeichnung.replace(/\s*\(ausgenommen Sonderfahrzeuge\)/, "").slice(0, 80)}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Euro size={20} />
            Feuerwehr-Tarifordnung {TARIFORDNUNG_JAHR}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {saved ? <span className="badge ok">gespeichert</span> : dirty ? <span className="badge neutral">ungespeicherte Änderungen</span> : null}
            <button type="button" className="cta" onClick={() => void save()} disabled={busy || !dirty} style={{ width: "auto", padding: "8px 14px", fontSize: 13 }}>
              {busy ? "Speichert …" : "Speichern"}
            </button>
          </div>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--fg-2)", lineHeight: 1.55 }}>
          Richtsätze für die Verrechnung häufiger anfallender Leistungen gem. § 2 Abs. 4 Oö. FWG 2015 ({TARIFORDNUNG_STAND}).
          Am Ende <strong>jedes Einsatzberichts</strong> steht ein <strong>Verrechnungsblatt</strong> mit den Kosten gemäß
          Tarifordnung – egal ob hoheitlicher oder nicht-hoheitlicher Einsatz. Die Verrechnungsart legst du im jeweiligen
          Bericht fest.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>
          <li><strong>Mindestverrechnung:</strong> die erste Stunde wird immer voll verrechnet; jede weitere angefangene Stunde bis 30 Min. zum halben, darüber zum vollen Stundensatz (Pkt. 2 Abs. 4).</li>
          <li><strong>Pauschale:</strong> ab der angefangenen 5. Stunde der Pauschaltarif – 12 Std. bei Fahrzeugen und Motorgeräten, sonst 24 Std. (Pkt. 2 Abs. 4/5).</li>
          <li><strong>Verlastete Geräte:</strong> Geräte auf dem Einsatzfahrzeug werden <u>nicht</u> gesondert ausgewiesen (Pkt. 2 Abs. 6) – nur zusätzlich mitgeführte Geräte und Verbrauchsmaterial (Tarif D).</li>
          <li><strong>Bereitstellung:</strong> Fahrzeuge, die nur bereitgestellt wurden, mit 60 % (Pkt. 2 Abs. 7). Nur erforderliche Fahrzeuge/Mannschaft (Pkt. 2 Abs. 10).</li>
          <li><strong>Mannschaft</strong> nach Pos. 1.01 je Person und Stunde; USt: nicht umsatzsteuerpflichtig (§ 2 Abs. 3 UStG).</li>
        </ul>
      </section>

      {err ? (
        <div role="alert" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--red-border)", background: "var(--red-tint)", color: "var(--red)", fontSize: 13.5 }}>
          {err}
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div className="card-title">Gebührenhinweis am Verrechnungsblatt</div>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
          Dieser Text wird auf <strong>jedem Verrechnungsblatt</strong> als „Rechtsgrundlage der Gebühren“ angedruckt (und im
          Markdown-Export geführt). Trage hier Tarifordnung und das <strong>Datum des Gemeinderatsbeschlusses</strong> ein.
        </p>
        <textarea
          className="input"
          rows={3}
          maxLength={600}
          style={{ width: "100%", resize: "vertical" }}
          value={cfg.gebuehrenText}
          onChange={(e) => setCfg({ ...cfg, gebuehrenText: e.target.value })}
        />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6, fontSize: 12.5, flexWrap: "wrap" }}>
          {/_{2,}/.test(cfg.gebuehrenText) ? (
            <span style={{ color: "var(--warn)" }}>
              Das Datum ist noch ein Platzhalter („__.__.____“) – bitte durch das Datum des Gemeinderatsbeschlusses ersetzen.
            </span>
          ) : (
            <span style={{ color: "var(--ok)" }}>Text vollständig</span>
          )}
          <button
            type="button"
            onClick={() => setCfg({ ...cfg, gebuehrenText: GEBUEHREN_TEXT_STANDARD })}
            style={{ marginLeft: "auto", border: 0, background: "transparent", color: "var(--info)", cursor: "pointer", fontSize: 12.5, textDecoration: "underline" }}
          >
            Standardtext einsetzen
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">Zuordnung der Fahrzeuge zu den Tarifpositionen (Tarif A, Pkt. 2)</div>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--fg-2)" }}>
          Vorbelegung nach Fahrzeugart – bitte gegen das <strong>Gesamtgewicht laut Zulassung</strong> prüfen (z. B. MTF: bis 3,5 t = 2.01, bis 5,5 t = 2.02).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(160px, 220px) 1fr", gap: "8px 14px", alignItems: "center" }}>
          {FAHRZEUG_IDS.map((id) => (
            <FzgZeile key={id} label={`${FAHRZEUGE[id].funkrufname}`} sub={FAHRZEUGE[id].bezeichnung}>
              {zuordnung(cfg.fahrzeugTarif[id] ?? "", (pos) => setCfg({ ...cfg, fahrzeugTarif: { ...cfg.fahrzeugTarif, [id]: pos } }))}
              <SatzZeile pos={cfg.fahrzeugTarif[id]} cfg={cfg} />
            </FzgZeile>
          ))}
          <FzgZeile label="HR-Anhänger" sub="Nutzlast bitte prüfen">
            {zuordnung(cfg.anhaengerTarif["HR-Anhaenger"] ?? "", (pos) => setCfg({ ...cfg, anhaengerTarif: { ...cfg.anhaengerTarif, "HR-Anhaenger": pos } }))}
            <SatzZeile pos={cfg.anhaengerTarif["HR-Anhaenger"]} cfg={cfg} />
          </FzgZeile>
          <FzgZeile label="PKW-Anhänger" sub="bis 750 kg Nutzlast = 2.21">
            {zuordnung(cfg.anhaengerTarif["PKW-Anhaenger"] ?? "", (pos) => setCfg({ ...cfg, anhaengerTarif: { ...cfg.anhaengerTarif, "PKW-Anhaenger": pos } }))}
            <SatzZeile pos={cfg.anhaengerTarif["PKW-Anhaenger"]} cfg={cfg} />
          </FzgZeile>
          <FzgZeile label="Gabelstapler" sub="vergleichbare Leistung (Pkt. 4 Abs. 1)">
            {zuordnung(cfg.staplerTarif, (pos) => setCfg({ ...cfg, staplerTarif: pos }))}
            <SatzZeile pos={cfg.staplerTarif} cfg={cfg} />
          </FzgZeile>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">Verbrauchsmaterial (Tarif D) – Tagespreise</div>
        </div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--fg-2)" }}>
          Verbrauchsmaterial wird getrennt nach Tagespreisen vorgeschrieben. Ist hier ein Preis hinterlegt, rechnet HotDoc die in den Fahrzeugberichten erfassten Ölbindemittel-Säcke automatisch.
        </p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
          Ölbindemittel, Preis je Sack (€)
          <input
            className="input num"
            style={{ width: 120 }}
            inputMode="decimal"
            placeholder="z. B. 12,50"
            value={cfg.verbrauchspreise.oelbindemittelSack ?? ""}
            onChange={(e) => {
              const n = parseZahl(e.target.value);
              const vp = { ...cfg.verbrauchspreise };
              if (n === undefined) delete vp.oelbindemittelSack;
              else vp.oelbindemittelSack = n;
              setCfg({ ...cfg, verbrauchspreise: vp });
            }}
          />
        </label>

        <h4 style={{ margin: "18px 0 6px", fontSize: 13 }}>Preisliste Verbrauchsmaterial</h4>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--fg-3)" }}>
          Hier hinterlegte Artikel (mit Preis je Einheit) kannst du im Bericht direkt auswählen – Menge × Preis wird berechnet.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cfg.verbrauchsliste.map((e) => {
            const upd = (patch: Partial<VerbrauchListenEintrag>) =>
              setCfg({ ...cfg, verbrauchsliste: cfg.verbrauchsliste.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) });
            return (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "210px 1fr 90px 110px auto", gap: 8 }}>
                <select className="input" value={e.pos} onChange={(ev) => upd({ pos: ev.target.value as VerbrauchListenEintrag["pos"] })}>
                  <option value="14.01">14.01 Kraftstoffe, Öle, Reinigung</option>
                  <option value="14.02">14.02 Pölzmaterial</option>
                  <option value="14.03">14.03 Atemschutzmaterial</option>
                  <option value="14.04">14.04 Sonstiges</option>
                </select>
                <input className="input" placeholder="Bezeichnung (z. B. Diesel)" value={e.text} onChange={(ev) => upd({ text: ev.target.value })} />
                <input className="input" placeholder="Einheit" value={e.einheit} onChange={(ev) => upd({ einheit: ev.target.value })} />
                <input
                  key={`${e.id}-${e.preis}`}
                  className="input num"
                  placeholder="Preis €"
                  inputMode="decimal"
                  defaultValue={String(e.preis).replace(".", ",")}
                  onBlur={(ev) => upd({ preis: parseZahl(ev.target.value) ?? 0 })}
                />
                <button type="button" className="add-btn" aria-label="Entfernen" onClick={() => setCfg({ ...cfg, verbrauchsliste: cfg.verbrauchsliste.filter((x) => x.id !== e.id) })}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="cta"
          style={{ width: "auto", marginTop: 8, padding: "6px 12px", fontSize: 12, background: "transparent", color: "var(--info)", border: "1px solid var(--info)" }}
          onClick={() =>
            setCfg({
              ...cfg,
              verbrauchsliste: [...cfg.verbrauchsliste, { id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, pos: "14.01", text: "", einheit: "Stk.", preis: 0 }],
            })
          }
        >
          + Artikel hinzufügen
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">Tarifverzeichnis · Anlage I (Tarif A–E)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {ueberschriebene > 0 ? <span className="badge neutral">{ueberschriebene} Preis(e) überschrieben</span> : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "var(--fg-3)" }} />
            <input className="input" style={{ paddingLeft: 30, width: "100%" }} placeholder="Position oder Bezeichnung suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
          </div>
          <select className="input" value={String(gruppe)} onChange={(e) => setGruppe(e.target.value === "alle" ? "alle" : Number(e.target.value))} style={{ maxWidth: 340 }}>
            <option value="alle">Alle Gruppen</option>
            {Object.entries(TARIF_GRUPPEN).map(([g, name]) => (
              <option key={g} value={g}>
                Tarif {tarifAbschnitt(Number(g))} · {g} {name}
              </option>
            ))}
          </select>
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--fg-2)" }}>
          Alle Preise sind direkt editierbar (z. B. wenn der Gemeinderat abweichende Sätze beschließt oder eine neue
          Tarifordnung gilt). Geänderte Preise sind farbig markiert und lassen sich mit dem Pfeil auf den Wert der
          Tarifordnung zurücksetzen. Mit „Speichern“ gelten sie sofort für alle Verrechnungsblätter.
        </p>
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--surface-3)" }}>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Pos.</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Gegenstand</th>
                <th style={{ textAlign: "left", padding: "6px 8px" }}>Einheit</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>je Std. / Festbetrag</th>
                <th style={{ textAlign: "right", padding: "6px 8px" }}>Pauschale / Tagessatz</th>
              </tr>
            </thead>
            <tbody>
              {verzeichnis.map((p) => {
                const w = wirksamePosition(p.pos, cfg.preise) ?? p;
                const o = cfg.preise[p.pos];
                const geaendert = !!o && Object.keys(o).length > 0;
                const feld = (k: keyof PreisUeberschreibung, label: string) => {
                  const wert = w[k];
                  if (wert === undefined) return null;
                  return (
                    <input
                      key={`${p.pos}-${k}-${wert}`}
                      className="input num"
                      style={{ width: 92, textAlign: "right", ...(o?.[k] !== undefined ? { borderColor: "var(--warn)" } : {}) }}
                      title={label}
                      inputMode="decimal"
                      defaultValue={String(wert).replace(".", ",")}
                      onBlur={(e) => setPreis(p.pos, k, parseZahl(e.target.value))}
                    />
                  );
                };
                return (
                  <tr key={p.pos} style={{ borderTop: "1px solid var(--border)", background: geaendert ? "var(--warn-tint)" : undefined }}>
                    <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{p.pos}</td>
                    <td style={{ padding: "5px 8px" }}>
                      {p.bezeichnung}
                      {p.hinweis ? <div style={{ fontSize: 11, color: "var(--fg-3)" }}>{p.hinweis}</div> : null}
                    </td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{EINHEIT_TEXT[p.einheit]}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {feld("satzStunde", "Stundensatz") ?? feld("festbetrag", "Festbetrag") ?? (p.mindestbetrag !== undefined ? <span>mind. {feld("mindestbetrag", "Mindestbetrag")}</span> : <span style={{ color: "var(--fg-3)" }}>—</span>)}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {p.satzStunde !== undefined ? feld("satzPauschal", "Pauschaltarif") : <span style={{ color: "var(--fg-3)" }}>—</span>}
                      {geaendert ? (
                        <button
                          type="button"
                          title="Auf Tarifordnung zurücksetzen"
                          aria-label="Zurücksetzen"
                          onClick={() => {
                            const preise = { ...cfg.preise };
                            delete preise[p.pos];
                            setCfg({ ...cfg, preise });
                          }}
                          style={{ marginLeft: 6, border: 0, background: "transparent", cursor: "pointer", color: "var(--warn)" }}
                        >
                          <RotateCcw size={13} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {verzeichnis.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 12, color: "var(--fg-3)" }}>Keine Position gefunden.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FzgZeile({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  const [kind, ...rest] = Array.isArray(children) ? children : [children];
  return (
    <>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: "var(--fg-3)" }}>{sub}</div>
      </div>
      <div>
        {kind}
        {rest}
      </div>
    </>
  );
}

function SatzZeile({ pos, cfg }: { pos: string | undefined; cfg: TarifEinstellungen }) {
  const p = pos ? wirksamePosition(pos, cfg.preise) : undefined;
  return <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 3 }}>{satzText(p)}</div>;
}
