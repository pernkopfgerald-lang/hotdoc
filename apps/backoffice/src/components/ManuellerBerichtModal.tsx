import { EINSATZARTEN } from "@hotdoc/shared";
import { Activity, GraduationCap, MapPin, Plus, Siren, X } from "lucide-react";
import { useState } from "react";
import type { ManuellAnlageInput, UebungsTyp } from "../api/einsaetze";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ManuellAnlageInput) => Promise<void>;
}

type FormType = "manuell" | "lotsendienst" | "uebung";

const UEBUNGS_TYPEN: UebungsTyp[] = [
  "Atemschutz",
  "Technische Hilfeleistung",
  "Höhenrettung",
  "Sanitätsdienst",
  "Funk",
  "Allgemeine Übung",
  "Bewerb",
  "Sonstige",
];

const TYP_META: Record<
  FormType,
  { label: string; sub: string; icon: typeof Activity; color: string }
> = {
  manuell: {
    label: "Einsatz",
    sub: "Manuell angelegter Einsatz ohne BlaulichtSMS-Alarm (z. B. Sturm)",
    icon: Activity,
    color: "var(--info)",
  },
  lotsendienst: {
    label: "Lotsendienst",
    sub: "Polizei / Rettung / Gemeinde · meist verrechenbar",
    icon: MapPin,
    color: "var(--warn)",
  },
  uebung: {
    label: "Übung",
    sub: "Training · Bewerbsvorbereitung · zählt für AS-Stunden",
    icon: GraduationCap,
    color: "var(--ok)",
  },
};

export function ManuellerBerichtModal({ open, onClose, onSubmit }: Props) {
  const [formType, setFormType] = useState<FormType>("manuell");
  const [einsatzort, setEinsatzort] = useState("");
  const [einsatzart, setEinsatzart] = useState<string>("");
  const [freitext, setFreitext] = useState("");
  const [grund, setGrund] = useState("");
  // Lotsendienst
  const [auftraggeber, setAuftraggeber] = useState("");
  const [route, setRoute] = useState("");
  const [verrechenbar, setVerrechenbar] = useState(true);
  const [rechnungsadresse, setRechnungsadresse] = useState("");
  // Übung
  const [uebungThema, setUebungThema] = useState("");
  const [uebungsleiter, setUebungsleiter] = useState("");
  const [uebungsTyp, setUebungsTyp] = useState<UebungsTyp | "">("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function resetAll() {
    setEinsatzort("");
    setEinsatzart("");
    setFreitext("");
    setGrund("");
    setAuftraggeber("");
    setRoute("");
    setVerrechenbar(true);
    setRechnungsadresse("");
    setUebungThema("");
    setUebungsleiter("");
    setUebungsTyp("");
    setErr(null);
  }

  async function submit() {
    if (einsatzort.trim().length < 3) {
      setErr("Einsatzort/Ortsangabe mit mind. 3 Zeichen erforderlich.");
      return;
    }
    if (formType === "uebung" && !uebungThema.trim()) {
      setErr("Bei einer Übung ist das Thema Pflicht.");
      return;
    }
    if (formType === "lotsendienst" && !auftraggeber.trim()) {
      setErr("Bei einem Lotsendienst ist der Auftraggeber Pflicht.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: ManuellAnlageInput = {
        einsatzTyp: formType,
        einsatzort: einsatzort.trim(),
        ...(einsatzart ? { einsatzart } : {}),
        ...(freitext ? { einsatzartFreitext: freitext } : {}),
        ...(grund ? { grund } : {}),
      };
      if (formType === "lotsendienst") {
        body.lotsendienstAuftraggeber = auftraggeber.trim();
        if (route.trim()) body.lotsendienstRoute = route.trim();
        body.verrechenbar = verrechenbar;
        if (rechnungsadresse.trim()) body.rechnungsadresse = rechnungsadresse.trim();
      }
      if (formType === "uebung") {
        body.uebungThema = uebungThema.trim();
        if (uebungsleiter.trim()) body.uebungsleiter = uebungsleiter.trim();
        if (uebungsTyp) body.uebungsTyp = uebungsTyp;
      }
      await onSubmit(body);
      resetAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const meta = TYP_META[formType];
  const Icon = meta.icon;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        padding: 16,
        overflow: "auto",
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 560, margin: "24px 0" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 38,
                height: 38,
                borderRadius: 12,
                background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
                color: meta.color,
              }}
            >
              <Icon size={20} strokeWidth={2.2} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--fg)" }}>
                Neuer Bericht
              </h3>
              <p
                style={{
                  marginTop: 4,
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-3)",
                }}
              >
                {meta.sub}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="themetoggle"
          >
            <X size={16} />
          </button>
        </header>

        {/* Type-Selector */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
          {(Object.keys(TYP_META) as FormType[]).map((t) => {
            const m = TYP_META[t];
            const TypIcon = m.icon;
            const active = formType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFormType(t)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 8px",
                  borderRadius: 12,
                  border: `1.5px solid ${active ? m.color : "var(--border)"}`,
                  background: active
                    ? `color-mix(in srgb, ${m.color} 12%, var(--surface))`
                    : "var(--surface-2)",
                  color: active ? m.color : "var(--fg-2)",
                  cursor: "pointer",
                  transition: "all 140ms ease",
                  fontWeight: 600,
                  fontSize: 12,
                  minHeight: 64,
                }}
              >
                <TypIcon size={18} />
                {m.label}
              </button>
            );
          })}
        </div>

        {/* Gemeinsame Felder */}
        <div className="field">
          <label className="caption">
            {formType === "uebung" ? "Übungsort *" : formType === "lotsendienst" ? "Ort / Treffpunkt *" : "Einsatzort *"}
          </label>
          <input
            value={einsatzort}
            onChange={(e) => setEinsatzort(e.target.value)}
            placeholder={
              formType === "uebung"
                ? "z. B. Feuerwehrhaus Eberstalzell"
                : formType === "lotsendienst"
                  ? "z. B. A1 ASt. Sattledt → Eberstalzell"
                  : "z. B. Eberstalzeller Str. 5"
            }
            className="input"
          />
        </div>

        {/* Typ-spezifische Felder */}
        {formType === "manuell" ? (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">Einsatzart</label>
              <select
                value={einsatzart}
                onChange={(e) => setEinsatzart(e.target.value)}
                className="input"
                style={{ fontFamily: "inherit" }}
              >
                <option value="">— wählen —</option>
                {EINSATZARTEN.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">oder Freitext</label>
              <input
                value={freitext}
                onChange={(e) => setFreitext(e.target.value)}
                placeholder="Wenn Einsatzart nicht passt …"
                className="input"
              />
            </div>
          </>
        ) : null}

        {formType === "lotsendienst" ? (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">Auftraggeber *</label>
              <input
                value={auftraggeber}
                onChange={(e) => setAuftraggeber(e.target.value)}
                placeholder="z. B. Polizei Wels-Land, Rettung, BH Wels, …"
                className="input"
              />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">Route / Strecke</label>
              <textarea
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                rows={2}
                placeholder="z. B. A1-ASt. Sattledt über B1 nach Eberstalzell"
                className="input"
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
              <div className="field">
                <label className="caption">Verrechenbar</label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    paddingTop: 12,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={verrechenbar}
                    onChange={(e) => setVerrechenbar(e.target.checked)}
                    style={{ accentColor: "var(--info)" }}
                  />
                  Lotsendienst verrechnen
                </label>
              </div>
              <div className="field">
                <label className="caption">Rechnungsadresse</label>
                <input
                  value={rechnungsadresse}
                  onChange={(e) => setRechnungsadresse(e.target.value)}
                  placeholder={verrechenbar ? "Adresse für Verrechnung" : "—"}
                  className="input"
                  disabled={!verrechenbar}
                />
              </div>
            </div>
          </>
        ) : null}

        {formType === "uebung" ? (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="caption">Übungsthema *</label>
              <input
                value={uebungThema}
                onChange={(e) => setUebungThema(e.target.value)}
                placeholder="z. B. Atemschutz-Übung Innenangriff Wohnhaus"
                className="input"
              />
            </div>
            <div className="grid-2" style={{ gap: 12, marginTop: 12 }}>
              <div className="field">
                <label className="caption">Übungstyp</label>
                <select
                  value={uebungsTyp}
                  onChange={(e) => setUebungsTyp(e.target.value as UebungsTyp | "")}
                  className="input"
                  style={{ fontFamily: "inherit" }}
                >
                  <option value="">— wählen —</option>
                  {UEBUNGS_TYPEN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="caption">Übungsleiter</label>
                <input
                  value={uebungsleiter}
                  onChange={(e) => setUebungsleiter(e.target.value)}
                  placeholder="Name des Übungsleiters"
                  className="input"
                />
              </div>
            </div>
          </>
        ) : null}

        <div className="field" style={{ marginTop: 12 }}>
          <label className="caption">
            {formType === "uebung"
              ? "Notiz / Übungsziel"
              : formType === "lotsendienst"
                ? "Notiz / Besonderheiten"
                : "Grund der Anlage (Audit)"}
          </label>
          <textarea
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            rows={2}
            placeholder={
              formType === "uebung"
                ? "z. B. AS-Stunden für Bewerb"
                : formType === "lotsendienst"
                  ? "z. B. Verkehrsabsicherung Schwertransport"
                  : "z. B. Pumparbeiten ohne vorherigen Alarm"
            }
            className="input"
            style={{ resize: "vertical" }}
          />
        </div>

        {err && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--red-border)",
            }}
          >
            {err}
          </div>
        )}

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            className="themetoggle"
            style={{ width: "auto", padding: "0 14px" }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="cta"
            style={{
              width: "auto",
              padding: "10px 16px",
              fontSize: 14,
              gap: 6,
              display: "flex",
              alignItems: "center",
              background:
                formType === "lotsendienst"
                  ? "linear-gradient(180deg, var(--warn) 0%, color-mix(in srgb, var(--warn) 70%, #000) 100%)"
                  : formType === "uebung"
                    ? "linear-gradient(180deg, var(--ok) 0%, color-mix(in srgb, var(--ok) 70%, #000) 100%)"
                    : undefined,
            }}
          >
            {busy ? null : <Plus size={14} />}
            {busy ? "Anlegen …" : `${TYP_META[formType].label} anlegen`}
          </button>
        </div>

        <p
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px dashed var(--border)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.1em",
            color: "var(--fg-3)",
            textTransform: "uppercase",
          }}
        >
          {formType === "manuell" ? (
            <><Activity size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Wird bei Florian Eberstalzell als aktiver Einsatz angezeigt</>
          ) : formType === "lotsendienst" ? (
            <><Siren size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Wird wie ein normaler Einsatz dokumentiert.</>
          ) : (
            <><GraduationCap size={10} style={{ verticalAlign: -1, marginRight: 4 }} /> Übungsdokumentation · AS-Trupps zählen für Ausbildungsstunden</>
          )}
        </p>
      </div>
    </div>
  );
}
