/**
 * The shop details printed on receipts and shown to customers. PLACEHOLDERS: the real address and phone aren't on
 * file yet. Fill these in when the shop confirms them; a null line is left off the receipt.
 */
export const SHOP = {
  name: "J&J Sportswear",
  /** Street address. Placeholder until the shop confirms it. */
  address: null as string | null,
  city: "Legazpi City, Albay",
  /** Contact number for the receipt. Placeholder until the shop confirms it. */
  phone: null as string | null,
  /** Store hours, shown to customers on the "Buy at the shop" sheet. Placeholder until the shop confirms them. */
  hours: null as string | null,
  /** The GCash account customers send custom-order payments to. Placeholders until the shop confirms them. */
  gcashName: null as string | null,
  gcashNumber: null as string | null,
  /** Path in public/ to the shop's GCash QR image (e.g. "/gcash-qr.png"), when there is one. */
  gcashQr: null as string | null,
  /** Printed under the items. */
  thanks: "Thank you for shopping with us!",
  /** The POS isn't BIR-accredited, so its printouts can't stand in for an official receipt. */
  notice: "This is not an official receipt.",
};
