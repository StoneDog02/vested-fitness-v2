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
          50: "#f0fdf0",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#00CC03",
          600: "#00A802",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        secondary: {
          DEFAULT: "#070D0D", // Night
          light: "#1A2020",
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
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
        "primary-dark": "#059669",
        "secondary-light": "#374151",
        "gray-light": "#E5E7EB",
        // Status colors
        success: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#22c55e",
          600: "#16a34a",
        },
        warning: {
          50: "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
        },
        error: {
          50: "#fef2f2",
          100: "#fee2e2",
          500: "#ef4444",
          600: "#dc2626",
        },
        info: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
        },
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
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'large': '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        'glow': '0 0 20px rgba(0, 204, 3, 0.15)',
        'glow-lg': '0 0 30px rgba(0, 204, 3, 0.2)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        'neumorphism': '20px 20px 60px #d1d5db, -20px -20px 60px #ffffff',
        'neumorphism-dark': '20px 20px 60px #0a0a0a, -20px -20px 60px #1a1a1a',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'subtle-pattern': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'geometric-pattern': "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300CC03' fill-opacity='0.03'%3E%3Cpath d='M0 0h40v40H0V0zm40 40h40v40H40V40z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'dots-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2300CC03' fill-opacity='0.04'%3E%3Ccircle cx='20' cy='20' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='grid' width='10' height='10' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 10 0 L 0 0 0 10' fill='none' stroke='%2300CC03' stroke-width='0.5' stroke-opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23grid)'/%3E%3C/svg%3E\")",
        'wave-pattern': "url(\"data:image/svg+xml,%3Csvg width='1200' height='200' viewBox='0 0 1200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,100 C300,50 600,150 1200,100 L1200,200 L0,200 Z' fill='%2300CC03' fill-opacity='0.08'/%3E%3C/svg%3E\")",
        'noise-texture': "url(\"data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.02'/%3E%3C/svg%3E\")",
        'dark-geometric': "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300CC03' fill-opacity='0.08'%3E%3Cpath d='M0 0h40v40H0V0zm40 40h40v40H40V40z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'dark-dots': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%2300CC03' fill-opacity='0.1'%3E%3Ccircle cx='20' cy='20' r='1'/%3E%3C/g%3E%3C/svg%3E\")",
        'diagonal-stripes-light': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='stripe-gradient-light' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300CC03;stop-opacity:0.08'/%3E%3Cstop offset='50%25' style='stop-color:%2300CC03;stop-opacity:0.04'/%3E%3Cstop offset='100%25' style='stop-color:%2300CC03;stop-opacity:0.02'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M0 0 L60 60 L60 0 Z' fill='url(%23stripe-gradient-light)'/%3E%3Cpath d='M0 0 L60 60 L0 60 Z' fill='url(%23stripe-gradient-light)' transform='translate(30, 30)'/%3E%3C/svg%3E\")",
        'diagonal-stripes-dark': "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='stripe-gradient-dark' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300CC03;stop-opacity:0.15'/%3E%3Cstop offset='50%25' style='stop-color:%2300CC03;stop-opacity:0.08'/%3E%3Cstop offset='100%25' style='stop-color:%2300CC03;stop-opacity:0.04'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M0 0 L60 60 L60 0 Z' fill='url(%23stripe-gradient-dark)'/%3E%3Cpath d='M0 0 L60 60 L0 60 Z' fill='url(%23stripe-gradient-dark)' transform='translate(30, 30)'/%3E%3C/svg%3E\")",
        'diagonal-stripes-subtle': "url(\"data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3ClinearGradient id='stripe-gradient-subtle' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2300CC03;stop-opacity:0.06'/%3E%3Cstop offset='50%25' style='stop-color:%2300CC03;stop-opacity:0.03'/%3E%3Cstop offset='100%25' style='stop-color:%2300CC03;stop-opacity:0.01'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M0 0 L80 80 L80 0 Z' fill='url(%23stripe-gradient-subtle)'/%3E%3Cpath d='M0 0 L80 80 L0 80 Z' fill='url(%23stripe-gradient-subtle)' transform='translate(40, 40)'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translate(-50%, -20px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        "shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "bounce-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        "gradient-shift": { 
          "0%": { backgroundPosition: "0% 0%" }, 
          "50%": { backgroundPosition: "100% 100%" }, 
          "100%": { backgroundPosition: "0% 0%" } 
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-up": "slide-up 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "shimmer": "shimmer 2s infinite",
        "bounce-soft": "bounce-soft 2s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "gradient-shift": "gradient-shift 15s ease infinite",
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [forms],
} satisfies Config;
