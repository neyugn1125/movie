import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        theme: {
          primary: "var(--theme-primary)",
          secondary: "var(--theme-secondary)",
          accent: "var(--theme-accent)",
          bg: "var(--theme-bg)",
          surface: "var(--theme-surface)",
          border: "var(--theme-border)",
          glow: "var(--theme-glow)",
        },
      },
      boxShadow: {
        glow: "0 0 25px -5px var(--theme-glow)",
        "glow-lg": "0 0 50px -10px var(--theme-glow)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float-up": "floatUp 2.5s ease-out forwards",
      },
      keyframes: {
        floatUp: {
          "0%": { transform: "translateY(0) scale(0.8)", opacity: "1" },
          "50%": { transform: "translateY(-120px) scale(1.2)", opacity: "0.9" },
          "100%": { transform: "translateY(-240px) scale(0.9)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
