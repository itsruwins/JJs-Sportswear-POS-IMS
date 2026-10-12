import { PAY_STATUS_LABEL, type PayStatus } from "@/features/admin/payments/data";

/** A payment's status: amber only while it waits on the shop (to review), like a new order. */
export function PayPill({ status }: { status: PayStatus }) {
  const base = "inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold";
  const tone =
    status === "submitted"
      ? "bg-amber text-amber-ink"
      : status === "verified"
        ? "text-ink shadow-[inset_0_0_0_1px_var(--ink)]"
        : "bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]";
  return <span className={`${base} ${tone}`}>{PAY_STATUS_LABEL[status]}</span>;
}
