// The shop's standard size list. Products pick from these; order here is display order.

export type SizeGroup = { id: string; label: string; sizes: string[] };

export const SIZE_GROUPS: SizeGroup[] = [
  { id: "adult", label: "Adult", sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"] },
  { id: "women", label: "Women’s cut", sizes: ["W-XS", "W-S", "W-M", "W-L", "W-XL", "W-2XL"] },
  { id: "kids", label: "Kids", sizes: ["4", "6", "8", "10", "12", "14"] },
  { id: "accessory", label: "Accessories", sizes: ["Free size", "One size", "Adjustable", "S/M", "L/XL"] },
];

export const STANDARD_SIZES = SIZE_GROUPS.flatMap((g) => g.sizes);

/** Sizes that take the "2XL and up" upcharge. */
export const UPCHARGE_SIZES = new Set(["2XL", "3XL", "4XL", "5XL", "W-2XL"]);
