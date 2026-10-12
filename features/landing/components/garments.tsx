import { useId } from "react";
import type { Garment } from "./data";

export type JerseyDesign = {
  body: string;
  panel: string;
  trim: string;
  ink: string; // lettering
  accent: string;
  pattern: "lava" | "tide" | "pinstripe";
  name: string;
  number: string;
};

const BODY = "M88 18 L112 18 Q150 92 188 18 L212 18 Q220 98 250 128 L246 336 Q150 350 54 336 L50 128 Q80 98 88 18 Z";

/** Basketball jersey, front view. Colors cross-fade when the design changes. */
export function Jersey({ design, className = "" }: { design: JerseyDesign; className?: string }) {
  const clip = useId();
  const show = (p: JerseyDesign["pattern"]) => (design.pattern === p ? 1 : 0);

  return (
    <svg viewBox="0 0 300 360" className={`jersey ${className}`} role="img" aria-label={`Jersey preview: ${design.name} number ${design.number}`}>
      <defs>
        <clipPath id={clip}>
          <path d={BODY} />
        </clipPath>
      </defs>

      {/* soft ground shadow */}
      <ellipse cx="150" cy="350" rx="104" ry="7" fill="oklch(0 0 0 / 0.16)" />

      <g clipPath={`url(#${clip})`}>
        <path d={BODY} fill={design.body} />

        {/* Pattern: lava diagonal */}
        <g opacity={show("lava")}>
          <path d="M40 262 L262 176 L262 214 L40 300 Z" fill={design.accent} />
          <path d="M40 304 L262 218 L262 228 L40 314 Z" fill={design.trim} />
        </g>

        {/* Pattern: tide waves */}
        <g opacity={show("tide")} fill="none" stroke={design.accent} strokeWidth="7" strokeLinecap="round">
          <path d="M40 262 Q75 246 110 262 T180 262 T250 262" />
          <path d="M40 284 Q75 268 110 284 T180 284 T250 284" opacity="0.7" />
          <path d="M40 306 Q75 290 110 306 T180 306 T250 306" opacity="0.45" />
        </g>

        {/* Pattern: pinstripe */}
        <g opacity={show("pinstripe")} stroke={design.accent} strokeWidth="2">
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1={52 + i * 13} y1="0" x2={52 + i * 13} y2="360" opacity="0.55" />
          ))}
        </g>

        {/* Side panels */}
        <path d="M50 128 L80 142 L84 340 L40 340 Z" fill={design.panel} />
        <path d="M250 128 L220 142 L216 340 L260 340 Z" fill={design.panel} />
      </g>

      {/* Edge, so dark bodies hold their silhouette on dark grounds */}
      <path d={BODY} fill="none" stroke="var(--ink)" strokeOpacity="0.22" strokeWidth="1.5" />

      {/* Trim */}
      <g fill="none" stroke={design.trim} strokeWidth="9" strokeLinecap="round">
        <path d="M113 20 Q150 90 187 20" />
        <path d="M89 20 Q81 98 52 127" />
        <path d="M211 20 Q219 98 248 127" />
      </g>
      <path d="M55 335 Q150 349 245 335" fill="none" stroke={design.trim} strokeWidth="6" />

      {/* Lettering */}
      <text
        x="150"
        y="128"
        textAnchor="middle"
        fill={design.ink}
        stroke={design.trim}
        strokeWidth="1.5"
        paintOrder="stroke"
        style={{ fontVariationSettings: '"wdth" 62', fontWeight: 800, fontSize: 30, letterSpacing: "0.04em" }}
      >
        {design.name}
      </text>
      <text
        x="150"
        y="236"
        textAnchor="middle"
        fill={design.ink}
        stroke={design.trim}
        strokeWidth="4"
        paintOrder="stroke"
        style={{ fontVariationSettings: '"wdth" 62', fontWeight: 900, fontSize: 112 }}
      >
        {design.number}
      </text>
    </svg>
  );
}

/** Small garment silhouettes for the stock table. */
export function GarmentIcon({ garment, className = "" }: { garment: Garment; className?: string }) {
  const paths: Record<Garment, string> = {
    jersey: "M15 6 L21 6 Q24 15 27 6 L33 6 Q34 15 39 19 L38 42 Q24 44 10 42 L9 19 Q14 15 15 6 Z",
    tee: "M17 7 Q24 12 31 7 L42 13 L38 21 L34 19 L34 42 L14 42 L14 19 L10 21 L6 13 Z",
    shorts: "M10 9 L38 9 L41 39 L28 41 L24 22 L20 41 L7 39 Z",
    jacket: "M18 6 L24 9 L30 6 L41 12 L43 40 L36 41 L35 22 L35 42 L13 42 L13 22 L12 41 L5 40 L7 12 Z",
  };
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d={paths[garment]} fill="currentColor" />
      {garment === "jacket" && <path d="M24 9 L24 42" stroke="var(--board)" strokeWidth="1.5" />}
      {garment === "shorts" && <path d="M10 13 L38 13" stroke="var(--board)" strokeWidth="1.5" />}
    </svg>
  );
}
