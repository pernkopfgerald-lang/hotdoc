/**
 * Auto Light/Dark Theme nach Uhrzeit (07–19 hell, sonst dunkel).
 * Manueller Override über localStorage.
 */
const KEY = "hotdoc.themeOverride";

export type Theme = "light" | "dark";

export function autoTheme(): Theme {
  const h = new Date().getHours();
  return h >= 7 && h < 19 ? "light" : "dark";
}

export function effectiveTheme(): Theme {
  try {
    const o = localStorage.getItem(KEY);
    if (o === "light" || o === "dark") return o;
  } catch {
    /* noop */
  }
  return autoTheme();
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", t === "dark" ? "#0d0d12" : "#f7f7fa");
}

export function setThemeOverride(t: Theme): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}
