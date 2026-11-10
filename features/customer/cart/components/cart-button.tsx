import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { piecesLabel } from "@/features/customer/cart/model";

/**
 * The bag in the top bar: opens the cart, with the pieces in it. The count is ink, not
 * yellow: a cart is waiting on nobody, so it isn't "now".
 */
export function CartButton({ count, current }: { count: number; current: boolean }) {
  return (
    <Link
      href="/cart"
      aria-current={current ? "page" : undefined}
      className="press relative grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-ground-2 hover:text-ink aria-[current=page]:bg-ground-2 aria-[current=page]:text-ink"
    >
      <ShoppingBag aria-hidden="true" className="size-[1.2rem]" strokeWidth={1.9} />
      <span className="sr-only">Cart{count ? `, ${piecesLabel(count)}` : ", empty"}</span>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="tabular absolute right-0.5 top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-ink px-1 text-[0.6875rem] font-bold leading-none text-ground shadow-[0_0_0_2px_var(--ground)]"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
