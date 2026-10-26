// Suggested SKUs: PRODUCT-COLOR-SIZE, e.g. "Warmer Jacket", Black, XL → WJ-BLK-XL.
// A made-to-order style stands where the color goes: NBA cut · Set → NBS.
// Staff can always overwrite a suggestion.

import { jerseyStyle } from "@/features/shared/catalog/styles";

const COLOR_CODES: Record<string, string> = {
  black: "BLK", white: "WHT", navy: "NVY", maroon: "MRN", orange: "ORG", blue: "BLU", yellow: "YLW",
  red: "RED", green: "GRN", "court green": "GRN", charcoal: "CHR", gray: "GRY", grey: "GRY",
  "heather gray": "HGR", "ash gray": "ASH", royal: "ROY", "neon yellow": "NYL", purple: "PRP",
  pink: "PNK", gold: "GLD", silver: "SLV", brown: "BRN", teal: "TEL", beige: "BEI",
};

const SIZE_CODES: Record<string, string> = {
  "free size": "FS", "one size": "OS", adjustable: "ADJ", "s/m": "SM", "l/xl": "LXL",
};

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function productCode(name: string) {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .filter((w) => !["and", "the", "of", "for", "with"].includes(w.toLowerCase()));
  const initials = clean(words.map((w) => w[0]).join("")).slice(0, 4);
  if (initials.length >= 2) return initials;
  return clean(name).slice(0, 3) || "PRD";
}

export function colorCode(color: string) {
  const style = jerseyStyle(color);
  if (style) return style.code;
  const key = color.trim().toLowerCase();
  if (COLOR_CODES[key]) return COLOR_CODES[key];
  const letters = clean(color);
  // Drop inner vowels so "Lavender" → LVN rather than LAV, unless that leaves too little.
  const consonants = letters[0] + letters.slice(1).replace(/[AEIOU]/g, "");
  return (consonants.length >= 3 ? consonants : letters).slice(0, 3) || "CLR";
}

export function sizeCode(size: string) {
  return SIZE_CODES[size.trim().toLowerCase()] ?? clean(size);
}

export function suggestSku(productName: string, color: string, size: string) {
  return [productCode(productName), colorCode(color), sizeCode(size)].join("-");
}
