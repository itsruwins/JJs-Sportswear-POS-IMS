// What reading a payment receipt gives back, and what the cashier is told about it before the
// payment joins the sale. Pure: the register, the reader (Gemini, Phase E3), and its tests share it.

import { cleanReference, type PaymentProvider } from "@/features/shared/payments/model";

export type ReceiptStatus = "successful" | "pending" | "failed" | "unknown";

/** Each field as the receipt shows it, or null when it isn't on the receipt or can't be read. */
export type ReceiptFields = {
  provider: string | null;
  reference: string | null;
  amount: number | null;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM, 24-hour */
  time: string | null;
  status: ReceiptStatus | null;
};

export type ReceiptField = keyof ReceiptFields;

export type ScanFailure = "unreadable" | "unavailable" | "quota" | "file";

export type ScanResult =
  | {
      ok: true;
      fields: ReceiptFields;
      /** Fields the reader wasn't sure of: shown as "Check this", never as settled. */
      unsure: ReceiptField[];
      /** A standing sale already carrying this reference (checked by the server). */
      duplicateOf: string | null;
      /** True for a sample result, not read from the photo (development only). */
      demo: boolean;
    }
  | { ok: false; kind: ScanFailure; message: string; demo: boolean };

/** One e-payment part of the sale in progress, as the register keeps it. */
export type EPayment = {
  id: string;
  provider: string;
  reference: string;
  amount: number;
  /** "scan" when the details came from a receipt photo, "manual" when typed. */
  source: "scan" | "manual";
  /** What the receipt said, kept so a change to it shows (and, in E4, needs the owner). */
  read: ReceiptFields | null;
};

export const STATUS_LABEL: Record<ReceiptStatus, string> = {
  successful: "Successful",
  pending: "Pending",
  failed: "Failed",
  unknown: "Not shown",
};

/** Today in Manila, YYYY-MM-DD: receipts are dated in the shop's time. */
export const manilaDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export function formatReceiptDate(date: string | null, time: string | null) {
  if (!date) return null;
  const day = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  if (!time) return day;
  const [h, m] = time.split(":").map(Number);
  const clock = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${day} · ${clock}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

export type ReviewNotice =
  /** Information the cashier should see; the payment can still be added. */
  | { kind: "short"; covers: number; due: number }
  | { kind: "over"; change: number; due: number }
  | { kind: "edited_amount"; receipt: number }
  /** Needs a decision before the payment can be added. */
  | { kind: "provider"; read: PaymentProvider }
  | { kind: "old_date"; date: string }
  | { kind: "pending" }
  /** Stops the payment. */
  | { kind: "failed" }
  | { kind: "duplicate"; sale: string | null };

/**
 * What the review says about a payment before it joins the sale. `due` is what's still owed
 * without this payment. `others` are the sale's other e-payments, so one reference can't be
 * added twice.
 */
export function reviewNotices(args: {
  provider: PaymentProvider;
  providers: PaymentProvider[];
  reference: string;
  amount: number;
  due: number;
  read: ReceiptFields | null;
  duplicateOf: string | null;
  others: Pick<EPayment, "provider" | "reference">[];
}): ReviewNotice[] {
  const { provider, providers, reference, amount, due, read, duplicateOf, others } = args;
  const out: ReviewNotice[] = [];
  const ref = cleanReference(reference);
  if (duplicateOf && read?.reference && cleanReference(read.reference) === ref) out.push({ kind: "duplicate", sale: duplicateOf });
  else if (ref && others.some((o) => o.provider === provider.code && cleanReference(o.reference) === ref)) out.push({ kind: "duplicate", sale: null });
  if (read?.status === "failed") out.push({ kind: "failed" });
  if (read?.status === "pending") out.push({ kind: "pending" });
  if (read?.provider && read.provider !== provider.code) {
    const other = providers.find((p) => p.code === read.provider);
    if (other) out.push({ kind: "provider", read: other });
  }
  if (read?.date && read.date !== manilaDate()) out.push({ kind: "old_date", date: read.date });
  if (read?.amount !== null && read?.amount !== undefined && round(read.amount) !== round(amount)) out.push({ kind: "edited_amount", receipt: read.amount });
  if (amount > 0 && due > 0) {
    if (amount < due) out.push({ kind: "short", covers: amount, due });
    else if (amount > due) out.push({ kind: "over", change: round(amount - due), due });
  }
  return out;
}

/** Notices that need a tick from the cashier (or, for the provider, a switch) before the payment can be added. */
export const needsConfirm = (n: ReviewNotice) => n.kind === "old_date" || n.kind === "pending" || n.kind === "provider";
/** Notices that stop the payment outright. */
export const blocks = (n: ReviewNotice) => n.kind === "failed" || n.kind === "duplicate";
