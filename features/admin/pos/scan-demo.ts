// Sample receipt readings for development, so every review state can be seen on demand without
// a receipt that shows it. Never used in production builds, and every result is marked demo.

import { referenceLength, type PaymentProvider } from "@/features/shared/payments/model";
import { manilaDate, type ReceiptField, type ScanConcern, type ScanResult } from "./scan";

export const demoScans = process.env.NODE_ENV !== "production";

export const DEMO_KINDS = {
  real: "Read the photo (Gemini)",
  good: "Clear receipt",
  partial: "Less than due, amount unsure",
  over: "More than due",
  provider: "Another provider's receipt",
  old: "Dated two days ago",
  pending: "Pending payment",
  failed: "Failed payment",
  duplicate: "Reference already used",
  missing: "No reference on it",
  glare: "Glare on the screen",
  edited: "Looks edited",
  not_receipt: "Not a receipt",
  unreadable: "Unreadable photo",
  quota: "Reader over its limit",
} as const;

export type DemoKind = keyof typeof DEMO_KINDS;
export type SampleKind = Exclude<DemoKind, "real">;

/** A reference that fits the provider's rule; GCash's starts with a zero to show it's kept. */
function sampleReference(provider: PaymentProvider) {
  const length = referenceLength(provider);
  if (length) return `0${String(Date.now()).slice(-(length - 1)).padStart(length - 1, "7")}`;
  return `${provider.code.slice(0, 2).toUpperCase()}${String(Date.now()).slice(-8)}`;
}

const timeNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

export function demoScan(kind: SampleKind, provider: PaymentProvider, providers: PaymentProvider[], due: number): ScanResult {
  const base = {
    ok: true as const,
    fields: {
      provider: provider.code as string | null,
      reference: sampleReference(provider) as string | null,
      amount: due,
      date: manilaDate(),
      time: timeNow() as string | null,
      status: "successful" as const,
      recipient: "J&J SPORTSWEAR",
    },
    unsure: [] as ReceiptField[],
    duplicateOf: null as string | null,
    concerns: [] as ScanConcern[],
    scanId: null,
    demo: true,
  };
  switch (kind) {
    case "good":
      return base;
    case "partial":
      return { ...base, fields: { ...base.fields, amount: Math.max(1, Math.round(due * 0.6)) }, unsure: ["amount"] };
    case "over":
      return { ...base, fields: { ...base.fields, amount: Math.ceil((due + 1) / 100) * 100 } };
    case "provider": {
      const other = providers.find((p) => p.code !== provider.code) ?? provider;
      return { ...base, fields: { ...base.fields, provider: other.code, reference: sampleReference(other) } };
    }
    case "old": {
      const d = new Date();
      d.setDate(d.getDate() - 2);
      return { ...base, fields: { ...base.fields, date: manilaDate(d) } };
    }
    case "pending":
      return { ...base, fields: { ...base.fields, status: "pending" } };
    case "failed":
      return { ...base, fields: { ...base.fields, status: "failed" } };
    case "duplicate":
      return { ...base, duplicateOf: "RCPT-20261012-000002" };
    case "missing":
      return { ...base, fields: { ...base.fields, reference: null, time: null }, unsure: ["status"] };
    case "glare":
      return { ...base, unsure: ["reference", "amount"], concerns: ["photo_quality"] };
    case "edited":
      return { ...base, concerns: ["suspicious"] };
    case "not_receipt":
      return { ok: false, kind: "not_receipt", message: "This doesn’t look like a payment receipt.", demo: true };
    case "unreadable":
      return { ok: false, kind: "unreadable", message: "We couldn’t read this receipt.", demo: true };
    case "quota":
      return { ok: false, kind: "quota", message: "Receipt reading has reached today’s limit.", demo: true };
  }
}
