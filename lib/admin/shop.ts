/**
 * The shop details printed on receipts. PLACEHOLDERS: the real address and phone aren't on
 * file yet. Fill these in when the shop confirms them; a null line is left off the receipt.
 */
export const SHOP = {
  name: "J&J Sportswear",
  /** Street address. Placeholder until the shop confirms it. */
  address: null as string | null,
  city: "Legazpi City, Albay",
  /** Contact number for the receipt. Placeholder until the shop confirms it. */
  phone: null as string | null,
  /** Printed under the items. */
  thanks: "Thank you for shopping with us!",
  /** The POS isn't BIR-accredited, so its printouts can't stand in for an official receipt. */
  notice: "This is not an official receipt.",
};
