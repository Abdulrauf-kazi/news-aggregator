import typography from "@tailwindcss/typography";
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#022448",
        accent: "#FF6B6B",
        surface: "#f8f9fa",
        "on-surface": "#191c1d",
        outline: "#74777f",
        "on-primary": "#ffffff",
        secondary: "#475e8b",
        "surface-container": "#edeeef",
        "surface-container-low": "#f3f4f5",
        "surface-container-highest": "#e1e3e4",
      },
      fontFamily: {
        headline: ["IBM Plex Sans", "sans-serif"],
        body: ["IBM Plex Sans", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [typography],
};
export default config;
