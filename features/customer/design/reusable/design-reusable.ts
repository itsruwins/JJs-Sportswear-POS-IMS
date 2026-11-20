import { garmentColor } from "@/features/shared/catalog/colors";
import { isHexColor } from "@/features/customer/design/model";

export const label = "text-[0.9375rem] font-semibold text-ink";
export const COLOR_ROLES = ["Main", "Second", "Accent"];

/** A picked color as CSS: an exact hex as is, a swatch name through the shop's palette. */
export const swatchOf = (c: string) => (isHexColor(c) ? c : garmentColor(c).body);