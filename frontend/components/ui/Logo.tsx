"use client";

/**
 * Axiom Brand Logo — a geometric prism/diamond mark
 * representing multi-faceted analysis (like a prism splitting light).
 * Built as inline SVG for crisp rendering at any size.
 */

interface LogoMarkProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

export function LogoMark({ size = 24, glow = false, className = "" }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 6px rgba(255,255,255,0.25))" } : undefined}
    >
      {/* Outer diamond / prism shape */}
      <path
        d="M16 2L30 16L16 30L2 16L16 2Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Inner cross-axis lines — representing multi-agent convergence */}
      <line x1="16" y1="2" x2="16" y2="30" stroke="white" strokeWidth="1" opacity="0.3" />
      <line x1="2" y1="16" x2="30" y2="16" stroke="white" strokeWidth="1" opacity="0.3" />
      {/* Central node — consensus point */}
      <circle cx="16" cy="16" r="3" fill="white" opacity="0.9" />
      {/* Corner nodes — agents */}
      <circle cx="16" cy="6" r="1.5" fill="white" opacity="0.5" />
      <circle cx="26" cy="16" r="1.5" fill="white" opacity="0.5" />
      <circle cx="16" cy="26" r="1.5" fill="white" opacity="0.5" />
      <circle cx="6" cy="16" r="1.5" fill="white" opacity="0.5" />
    </svg>
  );
}

interface LogoFullProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export function LogoFull({ size = 24, className = "", showText = true }: LogoFullProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <span className="text-sm font-semibold tracking-[0.2em] text-zinc-100 select-none">
          AXIOM
        </span>
      )}
    </div>
  );
}
