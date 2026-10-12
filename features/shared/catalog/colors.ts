// Garment colors by name, for swatches and for recoloring the sample illustrations.
// Variant colors are typed by the owner, so lookups are case-insensitive and unknown
// names fall back to a neutral gray (the swatch still carries the name).

type Garment = { body: string; trim: string };

const PALETTE: Record<string, Garment> = {
  black: { body: "#1f2321", trim: "#6d706e" },
  white: { body: "#f3f4f2", trim: "#aeafae" },
  gray: { body: "#8a8f8c", trim: "#5c615e" },
  grey: { body: "#8a8f8c", trim: "#5c615e" },
  charcoal: { body: "#3a3f3c", trim: "#7d827f" },
  "heather gray": { body: "#a7aaa8", trim: "#6f7371" },
  "ash gray": { body: "#c9ccca", trim: "#8c908e" },
  red: { body: "#c3302d", trim: "#f08a83" },
  maroon: { body: "#6a1f2b", trim: "#b4747f" },
  orange: { body: "#e06d22", trim: "#f6b07c" },
  yellow: { body: "#f1c232", trim: "#b08a12" },
  "neon yellow": { body: "#d4ee3b", trim: "#98ab2a" },
  green: { body: "#1d7a4c", trim: "#7fbf9c" },
  "court green": { body: "#0f5d3e", trim: "#639581" },
  blue: { body: "#2c65c4", trim: "#1f488d" },
  royal: { body: "#2747a8", trim: "#8196d8" },
  navy: { body: "#1d2a48", trim: "#6b7898" },
  purple: { body: "#5b3a8e", trim: "#a58bd0" },
  pink: { body: "#e48aa8", trim: "#b25877" },
};

const FALLBACK: Garment = { body: "#9aa09c", trim: "#676c69" };

export function garmentColor(name: string | null | undefined): Garment {
  return (name && PALETTE[name.trim().toLowerCase()]) || FALLBACK;
}
