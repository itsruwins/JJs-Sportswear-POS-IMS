import Link from "next/link";
import { pageShell } from "@/components/customer/page-parts";

export default function ProductNotFound() {
  return (
    <div className={pageShell}>
      <section className="max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-6 py-7 shadow-[inset_0_0_0_1px_var(--line)]">
        <h1 className="text-[1.125rem] font-semibold text-ink">That product isn’t on the rack.</h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          It may have been taken out of the catalog. Everything the shop sells is in the shop.
        </p>
        <Link
          href="/shop"
          className="press mt-5 inline-flex h-11 items-center rounded-full bg-ink px-5 text-[0.9375rem] font-semibold text-ground hover:opacity-90"
        >
          Back to the shop
        </Link>
      </section>
    </div>
  );
}
