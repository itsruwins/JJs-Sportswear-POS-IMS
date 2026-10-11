import Link from "next/link";
import { pageShell } from "@/components/customer/page-parts";

export default function OrderNotFound() {
  return (
    <div className={pageShell}>
      <section className="mx-auto max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-6 py-7 shadow-[inset_0_0_0_1px_var(--line)]">
        <h1 className="text-[1.125rem] font-semibold text-ink">We couldn’t find that order.</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">It may belong to another account, or the link is incomplete.</p>
        <Link href="/orders" className="press mt-5 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90">
          Back to your orders
        </Link>
      </section>
    </div>
  );
}
