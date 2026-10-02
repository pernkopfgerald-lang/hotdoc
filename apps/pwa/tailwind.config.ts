import type { Config } from "tailwindcss";

/**
 * Tailwind-Config für HotDoc.
 * Theme-Tokens werden über CSS-Variablen gesteuert (data-theme="dark"|"light")
 * — siehe src/theme/tokens.css. Die Werte hier sind nur Tailwind-Aliases.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "var(--bg-deep)",
          page: "var(--bg-page)",
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        text: {
          1: "var(--text-1)",
          2: "var(--text-2)",
          3: "var(--text-3)",
        },
        red: { DEFAULT: "var(--red)" },
        amber: { DEFAULT: "var(--amber)" },
        emerald: { DEFAULT: "var(--emerald)" },
        blue: { DEFAULT: "var(--blue)" },
      },
      // v3.0: keine Webfonts, keine Monospace-Optik — überall die System-Schrift.
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Roboto", "Segoe UI", "Arial", "sans-serif"],
        condensed: ["system-ui", "-apple-system", "Roboto", "Segoe UI", "Arial", "sans-serif"],
        mono: ["system-ui", "-apple-system", "Roboto", "Segoe UI", "Arial", "sans-serif"],
      },
      borderRadius: {
        none: "0",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
        xl: "12px",
        "2xl": "14px",
        "3xl": "16px",
        full: "9999px",
        s: "6px",
        m: "8px",
        l: "10px",
      },
    },
  },
  plugins: [],
} satisfies Config;
