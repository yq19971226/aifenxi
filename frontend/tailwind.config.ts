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
        // --- WEB3 NEON DEFI OVERRIDES ---
        // Replacing "pure hacker black" with Web3 Midnight Slate
        black: "#0A0D14", 
        // -------------------------------------------
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-surface": "var(--bg-surface)",
        "bg-card": "var(--bg-card)",
        "bg-card-hover": "var(--bg-card-hover)",
        
        bull: "var(--color-bull)",
        "bull-muted": "var(--color-bull-muted)",
        bear: "var(--color-bear)",
        "bear-muted": "var(--color-bear-muted)",
        warn: "var(--color-warn)",
        "warn-muted": "var(--color-warn-muted)",
        info: "var(--color-info)",
        "info-muted": "var(--color-info-muted)",
        fuchsia: "var(--color-fuchsia)",
        
        border: "var(--border-default)",
        input: "var(--border-default)",
        ring: "var(--color-info)",
        background: "var(--bg-primary)",
        foreground: "var(--color-text)",
        primary: {
          DEFAULT: "#00E5FF",
          foreground: "#000000",
        },
        secondary: {
          DEFAULT: "var(--bg-secondary)",
          foreground: "var(--color-text-secondary)",
        },
        destructive: {
          DEFAULT: "var(--color-bear-muted)",
          foreground: "var(--color-bear)",
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
        mono: ["Space Grotesk", "Orbitron", "JetBrains Mono", "SF Mono", "Fira Code", "Roboto Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "var(--radius-xl)",
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-hover)",
        dropdown: "0 16px 48px -12px rgba(0,0,0,0.8)",
        modal: "0 24px 64px rgba(0,0,0,0.9)",
        glow: "0 0 20px rgba(0, 229, 255, 0.25)",
        "neon-cyan": "var(--shadow-neon-cyan)",
        "neon-green": "var(--shadow-neon-green)",
        "neon-red": "var(--shadow-neon-red)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(0, 229, 255, 0.1)",
        "glass-hover": "0 12px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(0, 229, 255, 0.2)",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
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
