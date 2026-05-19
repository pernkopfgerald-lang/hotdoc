import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, effectiveTheme, setThemeOverride, type Theme } from "../lib/theme";

interface Props {
  funkrufname?: string;
}

export function Topbar({ funkrufname }: Props) {
  const [theme, setTheme] = useState<Theme>(effectiveTheme());
  const [clock, setClock] = useState<string>(formatClock(new Date()));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeOverride(next);
    setTheme(next);
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg-page/95 px-4 py-2.5 backdrop-blur-md"
      data-component="topbar"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-border text-red"
          style={{ background: "var(--red-bg)" }}
          aria-hidden
        >
          <svg viewBox="0 0 32 32" width="22" height="22">
            <path
              d="M8 4 H21 L25 8 V28 H8 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M21 4 V8 H25" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M16 13 C13.5 15.5 13.5 18 15.5 19.5 C13.5 19 13 17.5 14 16 M16 13 C18.5 15.5 18.5 18 16.5 19.5 C18.5 19 19 17.5 18 16 M14.5 22 H17.5 V24 H14.5 Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div className="flex flex-col leading-none">
          <span className="font-condensed text-[18px] font-bold leading-none tracking-tight">
            <span className="text-red">Hot</span>
            <span className="text-text-1">Doc</span>
          </span>
          <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-text-3">
            {funkrufname ?? "FF Eberstalzell"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Theme umschalten"
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-2 transition hover:border-border-strong hover:text-text-1"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <span className="font-mono text-[15px] font-medium tabular-nums tracking-wider text-text-1">
          {clock}
        </span>
      </div>
    </header>
  );
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
