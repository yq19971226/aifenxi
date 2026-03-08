import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-surface": "var(--bg-surface)",
        "bg-card": "var(--bg-card)",
        "bg-card-hover": "var(--bg-card-hover)",
        
        bull: "var(--color-bull)",
        bear: "var(--color-bear)",
        warn: "var(--color-warn)",
        info: "var(--color-info)",
        
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          muted: "var(--color-accent-muted)",
          subtle: "var(--color-accent-subtle)",
        },
        
        border: "var(--border-default)",
        input: "var(--border-default)",
        ring: "var(--color-accent)",
        background: "var(--bg-primary)",
        foreground: "var(--color-text)",
        primary: {
          DEFAULT: "#f4f4f5",
          foreground: "#18181b",
        },
        secondary: {
          DEFAULT: "rgba(255,255,255,0.06)",
          foreground: "#a1a1aa",
        },
        destructive: {
          DEFAULT: "rgba(239,68,68,0.12)",
          foreground: "#ef4444",
        },
        muted: {
          DEFAULT: "var(--bg-surface)",
          foreground: "var(--color-text-muted)",
        },
        popover: {
          DEFAULT: "var(--bg-elevated)",
          foreground: "var(--color-text)",
        },
        card: {
          DEFAULT: "var(--bg-card)",
          foreground: "var(--color-text)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Fira Code", "Roboto Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "16px",
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-hover)",
        dropdown: "var(--shadow-dropdown)",
        modal: "var(--shadow-modal)",
      },
      keyframes: {
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" }
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "skeleton-shimmer": "skeleton-shimmer 1.5s ease-in-out infinite",
        "fade-in": "fade-in 0.25s ease-out forwards",
      },
    },
  },
  plugins: [tailwindAnimate],
};

export default config;
