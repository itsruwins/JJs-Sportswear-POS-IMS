// E-wallets and banks the shop accepts, and the rules for their reference numbers.
// The list itself lives in the payment_providers table; the database checks every
// reference again when a sale is recorded, so these checks are for the cashier's sake.

export type ProviderKind = "e_wallet" | "bank";

export type PaymentProvider = {
  code: string;
  name: string;
  kind: ProviderKind;
  /** Regular expression for the cleaned reference (see cleanReference). Written to read the same in Postgres and JavaScript. */
  pattern: string;
  /** Where the cashier finds the reference on the receipt. */
  hint: string;
  isActive: boolean;
  /** Customers can pay custom orders through it. */
  acceptsOnline: boolean;
  /** The shop's account customers send to (null: to follow). */
  accountName: string | null;
  accountNumber: string | null;
  /** Public link to the shop's QR code for it, when there is one. */
  qrUrl: string | null;
};

/** How one part of a sale was paid. */
export type PartMethod = "cash" | "e_payment";
/** How a whole sale was paid: "mixed" when it took more than one way. "gcash" only on sales read before the e-payment update. */
export type SaleMethod = "cash" | "e_payment" | "mixed" | "gcash";

/** What the owner found when checking an e-payment against the bank. */
export type CheckStatus = "cashier_confirmed" | "matched" | "disputed";

export const GCASH = "gcash";

/** GCash as it was before the providers list, for a database that hasn't had the e-payment update. */
export const GCASH_ONLY: PaymentProvider[] = [
  {
    code: GCASH,
    name: "GCash",
    kind: "e_wallet",
    pattern: "^[0-9]{13}$",
    hint: "The 13-digit Ref No. on the GCash receipt.",
    isActive: true,
    acceptsOnline: true,
    accountName: null,
    accountNumber: null,
    qrUrl: null,
  },
];

/** Upper case, without spaces or dashes: the form references are stored and compared in. Leading zeros stay. */
export const cleanReference = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, "");

export function referenceFits(provider: Pick<PaymentProvider, "pattern">, raw: string) {
  try {
    return new RegExp(provider.pattern).test(cleanReference(raw));
  } catch {
    // A rule JavaScript can't read: leave the decision to the database.
    return cleanReference(raw).length > 0;
  }
}

/** The fixed length a provider's references have, when its rule says so (GCash: 13). */
export function referenceLength(provider: Pick<PaymentProvider, "pattern">) {
  const m = provider.pattern.match(/^\^\[0-9\]\{(\d+)\}\$$/);
  return m ? Number(m[1]) : null;
}

/** True when a provider's references are digits only, so the field can bring up the number pad. */
export const digitsOnly = (provider: Pick<PaymentProvider, "pattern">) => /^\^\[0-9\]\{[\d,]+\}\$$/.test(provider.pattern);

/** Grouped for reading aloud: GCash the way its app shows it ("1234 567 890123"), others in fours. */
export function formatReference(provider: string | null, ref: string) {
  const r = cleanReference(ref);
  if (provider === GCASH) return [r.slice(0, 4), r.slice(4, 7), r.slice(7)].filter(Boolean).join(" ");
  return r.match(/.{1,4}/g)?.join(" ") ?? "";
}
