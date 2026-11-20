import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function EmptyCart() {
    return (
      <section className="mt-2 max-w-[46rem] rounded-[1.25rem] bg-ground-2 px-5 py-6 shadow-[inset_0_0_0_1px_var(--line)] sm:px-7 sm:py-7">
        <h2 className="text-[1.125rem] font-semibold leading-snug text-ink">Your cart is empty.</h2>
        <p className="mt-2 max-w-[52ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Pick a size on a ready-made item, or a style and how many of each size on a design, and tap Add to cart. It waits here, on any
          device you log in on, until you’re at the counter.
        </p>
        <Link
          href="/shop"
          className="press mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-action px-5 text-[0.9375rem] font-semibold text-action-ink hover:bg-action-deep"
        >
          Go to the shop
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </section>
    );
  }