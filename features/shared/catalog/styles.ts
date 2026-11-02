// Styles of made-to-order products. A style takes the place of a color on these products'
// variants (it's stored in the color column), so "NBA cut · Set" in M is one variant.
// Prices are the shop's full-sublimation list (owner's handwritten price list, 2026-10).

export type JerseyStyle = { name: string; code: string; price: number };

export const JERSEY_STYLES: JerseyStyle[] = [
  { name: "NBA cut · Set", code: "NBS", price: 680 },
  { name: "Normal cut · Set", code: "NMS", price: 650 },
  { name: "NBA cut · Upper", code: "NBU", price: 350 },
  { name: "Normal cut · Upper", code: "NMU", price: 325 },
];

/** The preset for a style name, ignoring case and spacing, or undefined for one typed by hand. */
export function jerseyStyle(name: string) {
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  return JERSEY_STYLES.find((s) => s.name.toLowerCase() === key);
}
