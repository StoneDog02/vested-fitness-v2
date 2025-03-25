import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class", // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#00CC03", // Lime Green
          light: "#32E135",
          dark: "#00A802",
        },
        secondary: {
          DEFAULT: "#070D0D", // Night
          light: "#1A2020",
        },
        gray: {
          lightest: "#F9FAFB",
          light: "#E0E2DB", // Alabaster
          DEFAULT: "#9CA3AF",
          dark: "#585464", // Davy's Gray
        },
        white: "#FFFFFF",
        alabaster: "#E0E2DB",
        night: "#070D0D",
        davyGray: "#585464",
        limeGreen: "#00CC03",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
    },
  },
  plugins: [forms],
} satisfies Config;
