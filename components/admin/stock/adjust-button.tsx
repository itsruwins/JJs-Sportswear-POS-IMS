"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import type { CatalogProduct } from "@/lib/admin/catalog";
import { AdjustSheet } from "./adjust-sheet";

/** Opens the adjust-stock sheet for one product. */
export function AdjustStockButton({ product }: { product: CatalogProduct }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep"
      >
        <PackagePlus aria-hidden="true" className="size-4" />
        Adjust stock
      </button>
      <AdjustSheet product={product} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
