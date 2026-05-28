import { Activity, GraduationCap, MapPin, Plus, X } from "lucide-react";
import { useState } from "react";
import { apiCall } from "../lib/api";

export type EinsatzTyp = "manuell" | "lotsendienst" | "uebung";

interface ManuellAnlageBody {
  einsatzTyp: EinsatzTyp;
  einsatzort: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  grund?: string;
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  verrechenbar?: boolean;
  rechnungsadresse?: string;
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nach erfolgreicher Anlage wird die neue Einsatz-ID zurückgeliefert. */
  onCreated: (einsatzId: string, typ: EinsatzTyp) => void;
  /** Initial-Typ-Auswahl (wenn der User von einer Quick-Action kommt). */
  initialTyp?: EinsatzTyp;
}

const UEBUNGS_TYPEN = [
  "Atemschutz",
  "Technische Hilfeleistung",
  "Höhenrettung",
  "Sanitätsdienst",
  "Funk",
  "Allgemeine Übung",
  "Bewerb",
  "Sonstige",
] as const;

const TYP_META: Record<
  EinsatzTyp,
  { label: string; sub: string; icon: typeof Activity; color: string; glow: string }
> = {
  manuell: {
    label: "Sonstige Tätigkeit",
    sub: "Bericht ohne BlaulichtSMS-Alarm",
    icon: Activity,
    color: "var(--info)",
    glow: "var(--glow-info)",
  },
  lotsendienst: {
    label: "Lotsendienst",
    sub: "Polizei / Rettung · meist verrechenbar",
    icon: MapPin,
    color: "var(--warn)",
    glow: "var(--glow-warn)",
  },
  uebung: {
    label: "Übung",
    sub: "Training · zählt für AS-Stunden",
    icon: GraduationCap,
    color: "var(--ok)",
    glow: "var(--glow-ok)",
  },
};

/**
 * Schlanke Tablet-Variante des Manueller-Bericht-Anlage-Modals.
 * Statt eines mehrstufigen Wizards eine flache Form mit Type-Selector
 * oben — Touch-tauglich, ohne unnötiges Scrollen.
 *
 * Wird sowohl vom Fahrzeug-Tablet (BerichtPage) als auch von der
 * Florianstation (ZentralePage) verwendet — der Anlage-Endpoint ist
 * derselbe (`POST /api/einsaetze/manuell`, requireAuth("einsatzleiter")).
 *
 * **Wichtig:** auf Fahrzeug-Tablets mit Rolle "mannschaft" wird der
 * Endpoint 403 zurückgeben. Wir behandeln das als klare Fehlermeldung.
 */
export function NeuerEinsatzTabletModal({ open, onClose, onCreated, initialTyp }: Props) {
  const [typ, setTyp] = useState<EinsatzTyp>(initialTyp ?? "manuell");
  const [einsatzort, setEinsatzort] = useState("");
  const [einsatzartFreitext, setEinsatzartFreitext] = useState("");
  const [grund, setGrund] = useState("");
  // Lotsendienst-Felder
  const [auftraggeber, setAuftraggeber] = useState("");
  const [route, setRoute] = useState("");
  const [verrechenbar, setVerrechenbar] = useState(true);
  const [rechnungsadresse, setRechnungsadresse] = useState("");
  // Übungs-Felder
  const [uebungThema, setUebungThema] = useState("");
  const [uebungsleiter, setUebungsleiter] = useState("");
  const [uebungsTyp, setUebungsTyp] = useState<string>("");
  // State
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  function resetAll() {
    setEinsatzort("");
    setEinsatzartFreitext("");
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
    if (typ === "uebung" && !uebungThema.trim()) {
      setErr("Bei einer Übung ist das Thema Pflicht.");
      return;
    }
    if (typ === "lotsendienst" && !auftraggeber.trim()) {
      setErr("Bei einem Lotsendienst ist der Auftraggeber Pflicht.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: ManuellAnlageBody = {
        einsatzTyp: typ,
        einsatzort: einsatzort.trim(),
        ...(einsatzartFreitext.trim()
          ? { einsatzartFreitext: einsatzartFreitext.trim() }
          : {}),
        ...(grund.trim() ? { grund: grund.trim() } : {}),
      };
      if (typ === "lotsendienst") {
        body.lotsendienstAuftraggeber = auftraggeber.trim();
        if (route.trim()) body.lotsendienstRoute = route.trim();
        body.verrechenbar = verrechenbar;
        if (rechnungsadresse.trim()) body.rechnungsadresse = rechnungsadresse.trim();
      }
      if (typ === "uebung") {
        body.uebungThema = uebungThema.trim();
        if (uebungsleiter.trim()) body.uebungsleiter = uebungsleiter.trim();
        if (uebungsTyp) body.uebungsTyp = uebungsTyp;
      }
      const result = await apiCall<{ ok: true; id: string }>(
        "/api/einsaetze/manuell",
        { method: "POST", body },
      );
      resetAll();
      onCreated(result.id, typ);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("403") || msg.includes("insufficient_role")) {
        setErr(
          "Anlage nur durch Einsatzleiter (Florianstation) möglich. Bitte dort anlegen, danach erscheint der Einsatz hier automatisch.",
        );
      } else {
        setErr(`Anlage fehlgeschlagen: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const ActiveIcon = TYP_META[typ].icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="neuer-einsatz-title"
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1500,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: `var(--glass-shadow-1), ${TYP_META[typ].glow}`,
          padding: 26,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 44,
              height: 44,
              borderRadius: 14,
              background:
                `linear-gradient(135deg, ${TYP_META[typ].color}, color-mix(in srgb, ${TYP_META[typ].color} 60%, #000))`,
              color: "#fff",
              boxShadow: TYP_META[typ].glow,
            }}
          >
            <ActiveIcon size={22} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1 }}>
            <h2
              id="neuer-einsatz-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "var(--tracking-tight)",
              }}
            >
              Neuen Bericht anlegen
            </h2>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "var(--tracking-caps)",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginTop: 2,
              }}
            >
              {TYP_META[typ].sub}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        {/* Type-Selector */}
        <div className="grid-3" style={{ gap: 8 }}>
          {(["manuell", "lotsendienst", "uebung"] as EinsatzTyp[]).map((t) => {
            const Icon = TYP_META[t].icon;
            const active = t === typ;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTyp(t)}
                className="vehicle-chip"
                style={{
                  ...(active
                    ? {
                        borderColor: TYP_META[t].color,
                        background: `color-mix(in srgb, ${TYP_META[t].color} 18%, var(--glass-2))`,
                        boxShadow: TYP_META[t].glow,
                      }
                    : {}),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 8px",
                }}
              >
                <Icon size={20} strokeWidth={2.2} color={active ? TYP_META[t].color : "var(--fg-2)"} />
                <div className="code" style={{ fontSize: 12 }}>
                  {TYP_META[t].label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Gemeinsame Felder */}
        <div className="field">
          <label className="caption">
            {typ === "uebung" ? "Übungsort" : typ === "lotsendienst" ? "Treffpunkt / Strecken-Anfang" : "Einsatzort / Ortsangabe"}
          </label>
          <input
            className="input"
            autoFocus
            value={einsatzort}
            onChange={(e) => setEinsatzort(e.target.value)}
            placeholder="z. B. Solarstraße 5, 4653 Eberstalzell"
          />
        </div>
        <div className="field">
          <label className="caption">
            {typ === "uebung" ? "Beschreibung (optional)" : "Stichwort/Freitext"}
          </label>
          <input
            className="input"
            value={einsatzartFreitext}
            onChange={(e) => setEinsatzartFreitext(e.target.value)}
            placeholder={
              typ === "uebung" ? "z. B. Innenangriff Übungshaus" : "z. B. Türöffnung Wohnung"
            }
          />
        </div>

        {/* Typ-spezifische Felder */}
        {typ === "lotsendienst" ? (
          <>
            <div className="field">
              <label className="caption">Auftraggeber *</label>
              <input
                className="input"
                value={auftraggeber}
                onChange={(e) => setAuftraggeber(e.target.value)}
                placeholder="z. B. Polizei Wels-Land"
              />
            </div>
            <div className="field">
              <label className="caption">Route (optional)</label>
              <input
                className="input"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                placeholder="z. B. Anfang → Schwertransport-Etappe → Ende"
              />
            </div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "var(--glass-3)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-s)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={verrechenbar}
                onChange={(e) => setVerrechenbar(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Verrechenbar</span>
            </label>
            {verrechenbar ? (
              <div className="field">
                <label className="caption">Rechnungsadresse</label>
                <input
                  className="input"
                  value={rechnungsadresse}
                  onChange={(e) => setRechnungsadresse(e.target.value)}
                  placeholder="z. B. Polizei OÖ, Landeskommando"
                />
              </div>
            ) : null}
          </>
        ) : null}

        {typ === "uebung" ? (
          <>
            <div className="field">
              <label className="caption">Thema *</label>
              <input
                className="input"
                value={uebungThema}
                onChange={(e) => setUebungThema(e.target.value)}
                placeholder="z. B. Innenangriff unter Atemschutz"
              />
            </div>
            <div className="field">
              <label className="caption">Übungsleiter</label>
              <input
                className="input"
                value={uebungsleiter}
                onChange={(e) => setUebungsleiter(e.target.value)}
                placeholder="Name des Übungsleiters"
              />
            </div>
            <div className="field">
              <label className="caption">Übungstyp</label>
              <select
                className="input"
                value={uebungsTyp}
                onChange={(e) => setUebungsTyp(e.target.value)}
              >
                <option value="">— bitte wählen —</option>
                {UEBUNGS_TYPEN.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        {typ === "manuell" ? (
          <div className="field">
            <label className="caption">Grund / Notiz (optional)</label>
            <input
              className="input"
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              placeholder="z. B. Tierrettung Solar-Gasse"
            />
          </div>
        ) : null}

        {err ? (
          <div
            role="alert"
            style={{
              padding: "10px 12px",
              borderRadius: "var(--radius-s)",
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid var(--red-border)",
              boxShadow: "var(--glow-red-soft)",
            }}
          >
            {err}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            style={{
              width: "auto",
              padding: "0 16px",
              gap: 8,
              display: "flex",
              alignItems: "center",
              minHeight: 56,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="cta"
            onClick={() => void submit()}
            disabled={busy}
            style={{ flex: 1, padding: "16px 18px", fontSize: 15 }}
          >
            <Plus size={20} />
            {busy ? "Lege an …" : "Bericht anlegen"}
          </button>
        </div>
      </div>
    </div>
  );
}
