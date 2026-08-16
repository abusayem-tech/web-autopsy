/** @type {import('tailwindcss').Config} */
export default {
  content: ["./entrypoints/**/*.{tsx,ts,html}", "./components/**/*.{tsx,ts}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#0d9488", foreground: "#f0fdfa" },
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
