/**
 * The shop details printed on receipts and shown to customers, as listed on the shop's Facebook page.
 * A null line is left off the receipt.
 */
export const SHOP = {
  name: "J&J Crafts & Sportswear",
  /** Where the full name doesn't fit, and in admin tab titles. */
  short: "J&J",
  /** Street address. */
  address: "Alternate Road, Brgy. 16 Phase 1, Kawit East Washington" as string | null,
  city: "Legazpi City, Albay",
  /** Contact number for the receipt. */
  phone: "0917 650 9745" as string | null,
  email: "johnjickportuito@gmail.com",
  /** The shop's Facebook page name; customers message it on Messenger. */
  facebook: "J&J Crafts & Sportswear",
  /** Store hours, shown to customers on the cart page, order pages, and chat. */
  hours: "Mon–Sat, 9 AM–6 PM; closed Sundays" as string | null,
  /** Printed under the items. */
  thanks: "Thank you for shopping with us!",
  /** The POS isn't BIR-accredited, so its printouts can't stand in for an official receipt. */
  notice: "This is not an official receipt.",
};
