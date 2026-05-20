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
      fontFamily: {
        sans: ['Inter', "system-ui", "sans-serif"],
        condensed: ['Inter', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        s: "10px",
        m: "14px",
        l: "18px",
      },
    },
  },
  plugins: [],
} satisfies Config;
