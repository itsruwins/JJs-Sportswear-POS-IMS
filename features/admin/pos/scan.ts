// What reading a payment receipt gives back, and what the cashier is told about it before the
// payment joins the sale. Pure: the register, the reader's server check, and its tests share it.

import { cleanReference, referenceFits, type PaymentProvider } from "@/features/shared/payments/model";

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
  /** Who the money went to, as printed (name or masked account). Never the sender. */
  recipient: string | null;
};

export type ReceiptField = keyof ReceiptFields;

/** What the reader may notice about the image itself. */
export const RECEIPT_PROBLEMS = [
  "blurry",
  "glare",
  "cropped",
  "not_a_receipt",
  "several_receipts",
  "looks_edited",
  "conflicting_values",
  "instructions_in_image",
] as const;
export type ReceiptProblem = (typeof RECEIPT_PROBLEMS)[number];

/** What the cashier is told about the image: a doubtful photo, or a receipt that may not be genuine. */
export type ScanConcern = "photo_quality" | "several_receipts" | "suspicious";

export type ScanFailure = "unreadable" | "not_receipt" | "unavailable" | "quota" | "file";

export type ScanResult =
  | {
      ok: true;
      fields: ReceiptFields;
      /** Fields the reader wasn't sure of: shown as "Check this", never as settled. */
      unsure: ReceiptField[];
      /** A standing sale already carrying this reference (checked by the server). */
      duplicateOf: string | null;
      concerns: ScanConcern[];
      /** The scan log row (receipt_scans), for linking the sale to it. */
      scanId: string | null;
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
  /** The scan this payment came from, when it was read from a photo. */
  scanId?: string | null;
  /** The owner's approval for an amount different from the receipt. */
  approval?: Approval | null;
};

/** The owner's OK for one payment: this provider, reference, and amount only. */
export type Approval = { id: string; approver: string; reason: string; provider: string; reference: string; amount: number };

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
  | { kind: "suspicious" }
  /** Information about the photo. */
  | { kind: "photo_quality" }
  | { kind: "several_receipts" }
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
  concerns?: ScanConcern[];
  others: Pick<EPayment, "provider" | "reference">[];
}): ReviewNotice[] {
  const { provider, providers, reference, amount, due, read, duplicateOf, others, concerns = [] } = args;
  const out: ReviewNotice[] = [];
  if (concerns.includes("suspicious")) out.push({ kind: "suspicious" });
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
  if (concerns.includes("several_receipts")) out.push({ kind: "several_receipts" });
  if (concerns.includes("photo_quality")) out.push({ kind: "photo_quality" });
  if (amount > 0 && due > 0) {
    if (amount < due) out.push({ kind: "short", covers: amount, due });
    else if (amount > due) out.push({ kind: "over", change: round(amount - due), due });
  }
  return out;
}

/** Notices that need a tick from the cashier (or, for the provider, a switch) before the payment can be added. */
export const needsConfirm = (n: ReviewNotice) => n.kind === "old_date" || n.kind === "pending" || n.kind === "provider" || n.kind === "suspicious";
/** Notices that stop the payment outright. */
export const blocks = (n: ReviewNotice) => n.kind === "failed" || n.kind === "duplicate";

// ---------------------------------------------------------------------------------------------
// Checking what the reader returned. Nothing from the model is trusted as it comes: every field
// is re-checked here, and anything out of shape becomes null (missing) or "Check this".
// ---------------------------------------------------------------------------------------------

/**
 * Below this the reader's own confidence marks a field "Check this". Model confidence isn't a
 * calibrated probability, so this is only a review hint; it's set from the test receipts in E6.
 */
export const UNSURE_BELOW = 0.8;

export type CheckedReading =
  | { ok: true; fields: ReceiptFields; unsure: ReceiptField[]; concerns: ScanConcern[]; problems: ReceiptProblem[]; confidence: Partial<Record<ReceiptField, number>> }
  | { ok: false; kind: "unreadable" | "not_receipt"; problems: ReceiptProblem[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() && v.trim().length <= max ? v.trim() : null);

function validDate(v: unknown, today: string) {
  const d = text(v, 10);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const parsed = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) return null;
  // A receipt from the future, or from before e-wallets, is a misreading.
  if (d > today || d < "2015-01-01") return null;
  return d;
}

function validTime(v: unknown) {
  const t = text(v, 8);
  const m = t?.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

/** Checks the reader's raw answer against the schema and the shop's rules, field by field. */
export function checkReading(raw: unknown, providers: PaymentProvider[], today = manilaDate()): CheckedReading {
  if (!isObject(raw)) return { ok: false, kind: "unreadable", problems: [] };
  const problems = (Array.isArray(raw.problems) ? raw.problems : []).filter((p): p is ReceiptProblem =>
    (RECEIPT_PROBLEMS as readonly string[]).includes(p as string),
  );
  if (problems.includes("not_a_receipt")) return { ok: false, kind: "not_receipt", problems };

  const conf = isObject(raw.confidence) ? raw.confidence : {};
  const c = (k: string) => (typeof conf[k] === "number" && Number.isFinite(conf[k]) ? Math.min(1, Math.max(0, conf[k] as number)) : 0);
  const confidence: Partial<Record<ReceiptField, number>> = {
    provider: c("provider"),
    reference: c("reference_number"),
    amount: c("amount"),
    date: c("date"),
    status: c("status"),
  };

  const provider = providers.some((p) => p.code === raw.provider) ? (raw.provider as string) : null;
  const refText = text(raw.reference_number, 60);
  const reference = refText && /^[A-Z0-9]{4,60}$/.test(cleanReference(refText)) ? cleanReference(refText) : null;
  const amount =
    typeof raw.amount === "number" && Number.isFinite(raw.amount) && raw.amount > 0 && raw.amount < 10_000_000 ? Math.round(raw.amount * 100) / 100 : null;
  const status: ReceiptStatus = (["successful", "pending", "failed", "unknown"] as const).find((s) => s === raw.status) ?? "unknown";
  const fields: ReceiptFields = {
    provider,
    reference,
    amount,
    date: validDate(raw.date, today),
    time: validTime(raw.time),
    status,
    recipient: text(raw.recipient, 80),
  };

  if (!fields.reference && fields.amount === null) return { ok: false, kind: "unreadable", problems };

  const unsure = new Set<ReceiptField>();
  for (const [field, value] of Object.entries(confidence) as [ReceiptField, number][]) {
    if (fields[field] !== null && value < UNSURE_BELOW) unsure.add(field);
  }
  // A poor photo or competing numbers put the two fields that move money under review.
  if (problems.some((p) => p === "blurry" || p === "glare" || p === "cropped" || p === "conflicting_values")) {
    if (fields.reference) unsure.add("reference");
    if (fields.amount !== null) unsure.add("amount");
  }
  // A reference that breaks its provider's rule is a misreading or the wrong number.
  const ruleProvider = providers.find((p) => p.code === fields.provider);
  if (fields.reference && ruleProvider && !referenceFits(ruleProvider, fields.reference)) unsure.add("reference");
  if (fields.status === "unknown") unsure.add("status");

  const concerns: ScanConcern[] = [];
  if (problems.includes("looks_edited") || problems.includes("instructions_in_image")) concerns.push("suspicious");
  if (problems.includes("several_receipts")) concerns.push("several_receipts");
  if (problems.some((p) => p === "blurry" || p === "glare" || p === "cropped")) concerns.push("photo_quality");

  return { ok: true, fields, unsure: [...unsure], concerns, problems, confidence };
}
