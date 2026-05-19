import type { Config } from "tailwindcss";

/**
 * Tailwind-Config Backoffice. Theme-Tokens werden aus der PWA wiederverwendet
 * (siehe src/theme/tokens.css), damit Look-and-Feel konsistent bleibt.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: { deep: "var(--bg-deep)", page: "var(--bg-page)" },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: { DEFAULT: "var(--border)", strong: "var(--border-strong)" },
        text: { 1: "var(--text-1)", 2: "var(--text-2)", 3: "var(--text-3)" },
        red: { DEFAULT: "var(--red)" },
        amber: { DEFAULT: "var(--amber)" },
        emerald: { DEFAULT: "var(--emerald)" },
        blue: { DEFAULT: "var(--blue)" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        condensed: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: { s: "7px", m: "11px", l: "16px" },
    },
  },
  plugins: [],
} satisfies Config;
