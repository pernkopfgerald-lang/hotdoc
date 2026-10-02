import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, Minus, Plus, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

/**
 * Hotfix 2026-09: Datum-/Uhrzeit-Auswahl als Pop-Up (die nativen
 * <input type="date"> im Android-WebView lassen sich nicht zuverlaessig
 * bedienen). Datum = Kalenderansicht, Uhrzeit = Plus/Minus MIT manueller
 * Texteingabe. Keine neue Abhaengigkeit — alles selbst gebaut.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

const MONATE = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
const WOCHENTAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function parseYMD(v: string): { y: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!x) return null;
  return { y: Number(x[1]), m: Number(x[2]) - 1, d: Number(x[3]) };
}

function heuteYMD(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

const feldStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 44,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 12px",
  textAlign: "left",
  fontFamily: "inherit",
  fontSize: "inherit",
  color: "var(--fg)",
  background: "transparent",
  border: 0,
  cursor: "pointer",
};

const boxedStyle: CSSProperties = {
  ...feldStyle,
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
};

const btnSecondary: CSSProperties = {
  padding: "10px 14px",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  color: "var(--fg-2)",
  borderRadius: 10,
  fontSize: 16.5,
  fontWeight: 500,
  cursor: "pointer",
  minHeight: 44,
};

const btnPrimary: CSSProperties = {
  padding: "10px 14px",
  background: "var(--info, #2563eb)",
  border: 0,
  color: "#fff",
  borderRadius: 10,
  fontSize: 16.5,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 44,
};

function ModalShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }}
      />
      <div
        style={{
          position: "relative",
          width: "min(400px, 100%)",
          maxHeight: "94dvh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          {icon}
          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, flex: 1 }}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{ background: "transparent", border: 0, cursor: "pointer", padding: 8, color: "var(--fg-2)" }}
          >
            <X size={20} />
          </button>
        </header>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────── Datum ───────────────────────── */

function KalenderModal({
  value,
  onConfirm,
  onClose,
}: {
  value: string;
  onConfirm: (v: string) => void;
  onClose: () => void;
}) {
  const start = parseYMD(value) ?? parseYMD(heuteYMD())!;
  const [jahr, setJahr] = useState(start.y);
  const [monat, setMonat] = useState(start.m);

  function nav(delta: number) {
    const d = new Date(jahr, monat + delta, 1);
    setJahr(d.getFullYear());
    setMonat(d.getMonth());
  }

  // Montag = erste Spalte.
  const ersterWochentag = (new Date(jahr, monat, 1).getDay() + 6) % 7;
  const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
  const zellen: Array<number | null> = [
    ...Array<null>(ersterWochentag).fill(null),
    ...Array.from({ length: tageImMonat }, (_, i) => i + 1),
  ];
  const heute = parseYMD(heuteYMD())!;
  const navBtn: CSSProperties = {
    width: 48,
    height: 48,
    display: "grid",
    placeItems: "center",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--fg)",
    cursor: "pointer",
  };

  return (
    <ModalShell title="Datum wählen" icon={<CalendarDays size={18} style={{ color: "var(--info)" }} />} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button type="button" style={navBtn} onClick={() => nav(-12)} aria-label="Ein Jahr zurück" title="Jahr zurück">
          <ChevronsLeft size={20} />
        </button>
        <button type="button" style={navBtn} onClick={() => nav(-1)} aria-label="Vorheriger Monat">
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 700 }}>
          {MONATE[monat]} {jahr}
        </div>
        <button type="button" style={navBtn} onClick={() => nav(1)} aria-label="Nächster Monat">
          <ChevronRight size={20} />
        </button>
        <button type="button" style={navBtn} onClick={() => nav(12)} aria-label="Ein Jahr vor" title="Jahr vor">
          <ChevronsRight size={20} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {WOCHENTAGE.map((w) => (
          <div
            key={w}
            style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--fg-3)", padding: "4px 0" }}
          >
            {w}
          </div>
        ))}
        {zellen.map((tag, i) => {
          if (tag === null) return <div key={`leer-${i}`} />;
          const ymd = `${jahr}-${pad(monat + 1)}-${pad(tag)}`;
          const gewaehlt = ymd === value;
          const istHeute = jahr === heute.y && monat === heute.m && tag === heute.d;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onConfirm(ymd)}
              style={{
                minHeight: 46,
                borderRadius: 10,
                fontSize: 17,
                fontWeight: gewaehlt || istHeute ? 800 : 500,
                cursor: "pointer",
                color: gewaehlt ? "#fff" : "var(--fg)",
                background: gewaehlt ? "var(--info, #2563eb)" : "var(--surface-2)",
                border: istHeute ? "2px solid var(--info, #2563eb)" : "1px solid var(--border)",
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" style={{ ...btnSecondary, flex: 1 }} onClick={() => onConfirm(heuteYMD())}>
          Heute
        </button>
        <button type="button" style={{ ...btnSecondary, flex: 1 }} onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </ModalShell>
  );
}

export function DatumFeld({
  value,
  onChange,
  disabled,
  boxed,
}: {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** true = eigener Rahmen (Florianstation), false = innerhalb .input-row (Tablet) */
  boxed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = parseYMD(value);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{ ...(boxed ? boxedStyle : feldStyle), opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
        aria-label="Datum wählen"
      >
        <CalendarDays size={16} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <span className="num">{p ? `${pad(p.d)}.${pad(p.m + 1)}.${p.y}` : "—"}</span>
      </button>
      {open ? (
        <KalenderModal
          value={value}
          onClose={() => setOpen(false)}
          onConfirm={(v) => {
            setOpen(false);
            onChange(v);
          }}
        />
      ) : null}
    </>
  );
}

/* ───────────────────────── Uhrzeit ───────────────────────── */

function ZeitModal({
  value,
  onConfirm,
  onClose,
}: {
  value: string;
  onConfirm: (v: string) => void;
  onClose: () => void;
}) {
  const m0 = /^(\d{1,2}):(\d{2})$/.exec(value);
  const jetzt = new Date();
  const [h, setH] = useState(m0 ? Number(m0[1]) : jetzt.getHours());
  const [min, setMin] = useState(m0 ? Number(m0[2]) : jetzt.getMinutes());
  // Text-Zustand getrennt, damit Tippen (z. B. leeres Feld) nicht zurueckspringt.
  const [hTxt, setHTxt] = useState(pad(h));
  const [mTxt, setMTxt] = useState(pad(min));

  function setHour(n: number) {
    const v = ((n % 24) + 24) % 24;
    setH(v);
    setHTxt(pad(v));
  }
  function setMinute(n: number) {
    const v = ((n % 60) + 60) % 60;
    setMin(v);
    setMTxt(pad(v));
  }
  function tippH(t: string) {
    const clean = t.replace(/\D/g, "").slice(0, 2);
    setHTxt(clean);
    if (clean !== "" && Number(clean) <= 23) setH(Number(clean));
  }
  function tippM(t: string) {
    const clean = t.replace(/\D/g, "").slice(0, 2);
    setMTxt(clean);
    if (clean !== "" && Number(clean) <= 59) setMin(Number(clean));
  }
  const hOk = hTxt !== "" && Number(hTxt) <= 23;
  const mOk = mTxt !== "" && Number(mTxt) <= 59;

  const step: CSSProperties = {
    width: 72,
    height: 52,
    display: "grid",
    placeItems: "center",
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--fg)",
    cursor: "pointer",
  };
  const stepSmall: CSSProperties = { ...step, height: 40, fontSize: 14, fontWeight: 700 };
  const eingabe: CSSProperties = {
    width: 72,
    height: 60,
    textAlign: "center",
    fontSize: 32,
    fontWeight: 800,
    fontFamily: "var(--font-mono)",
    color: "var(--fg)",
    background: "var(--surface-2)",
    border: "2px solid var(--border-strong)",
    borderRadius: 10,
    outline: "none",
  };

  // Bewusst KEINE innere Komponente (sonst verliert das Textfeld bei jedem
  // Tastendruck den Fokus) — Aufruf als Funktion.
  function spalte({
    label,
    txt,
    onTxt,
    onBlur,
    onPlus,
    onMinus,
    extra,
    ok,
  }: {
    label: string;
    txt: string;
    onTxt: (t: string) => void;
    onBlur: () => void;
    onPlus: () => void;
    onMinus: () => void;
    extra?: React.ReactNode;
    ok: boolean;
  }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
        <button type="button" style={step} onClick={onPlus} aria-label={`${label} plus`}>
          <Plus size={24} strokeWidth={3} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={txt}
          onChange={(e) => onTxt(e.target.value)}
          onBlur={onBlur}
          onFocus={(e) => e.target.select()}
          aria-label={label}
          style={{ ...eingabe, borderColor: ok ? "var(--border-strong)" : "var(--red, #d93b3b)" }}
        />
        <button type="button" style={step} onClick={onMinus} aria-label={`${label} minus`}>
          <Minus size={24} strokeWidth={3} />
        </button>
        {extra}
      </div>
    );
  }

  return (
    <ModalShell title="Uhrzeit wählen" icon={<Clock size={18} style={{ color: "var(--info)" }} />} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", gap: 14 }}>
        {spalte({
          label: "Stunde",
          txt: hTxt,
          ok: hOk,
          onTxt: tippH,
          onBlur: () => (hOk ? setHTxt(pad(h)) : undefined),
          onPlus: () => setHour(h + 1),
          onMinus: () => setHour(h - 1),
        })}
        <div style={{ fontSize: 36, fontWeight: 800, marginTop: 84 }}>:</div>
        {spalte({
          label: "Minute",
          txt: mTxt,
          ok: mOk,
          onTxt: tippM,
          onBlur: () => (mOk ? setMTxt(pad(min)) : undefined),
          onPlus: () => setMinute(min + 1),
          onMinus: () => setMinute(min - 1),
          extra:
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={{ ...stepSmall, width: 60 }} onClick={() => setMinute(min - 5)}>
                −5
              </button>
              <button type="button" style={{ ...stepSmall, width: 60 }} onClick={() => setMinute(min + 5)}>
                +5
              </button>
            </div>
          ,
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          type="button"
          style={{ ...btnSecondary, flex: 1 }}
          onClick={() => {
            const n = new Date();
            setHour(n.getHours());
            setMinute(n.getMinutes());
          }}
        >
          Jetzt
        </button>
        <button type="button" style={{ ...btnSecondary, flex: 1 }} onClick={onClose}>
          Abbrechen
        </button>
        <button
          type="button"
          disabled={!hOk || !mOk}
          style={{ ...btnPrimary, flex: 1, opacity: hOk && mOk ? 1 : 0.5 }}
          onClick={() => onConfirm(`${pad(h)}:${pad(min)}`)}
        >
          Übernehmen
        </button>
      </div>
    </ModalShell>
  );
}

export function ZeitFeld({
  value,
  onChange,
  disabled,
  boxed,
}: {
  /** "HH:MM" */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  boxed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{ ...(boxed ? boxedStyle : feldStyle), opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
        aria-label="Uhrzeit wählen"
      >
        <Clock size={16} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
        <span className="num">{/^\d{1,2}:\d{2}$/.test(value) ? value : "—"}</span>
      </button>
      {open ? (
        <ZeitModal
          value={value}
          onClose={() => setOpen(false)}
          onConfirm={(v) => {
            setOpen(false);
            onChange(v);
          }}
        />
      ) : null}
    </>
  );
}
