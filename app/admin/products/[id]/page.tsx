import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { ProductActions } from "@/components/admin/products/product-actions";
import { AdjustStockButton } from "@/components/admin/stock/adjust-button";
import { Pill, ProductThumb } from "@/components/admin/products/product-bits";
import {
  fetchProduct,
  formatPeso,
  isSample,
  priceRange,
  productStock,
  sortSizes,
  sortColors,
  unique,
  variantState,
} from "@/lib/admin/catalog";
import { requireStaff } from "@/lib/admin/session";
import { hasStockHistory } from "@/lib/admin/stock";

export const metadata: Metadata = { title: "Product · J&J Sportswear Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATE_LABEL = { in: "In stock", low: "Low", zero: "Sold out" } as const;

export default async function ProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const { supabase, profile } = await requireStaff();
  const { id } = await params;
  const justSaved = (await searchParams).saved === "1";
  if (!UUID.test(id)) notFound();

  const { product, error } = await fetchProduct(supabase, id);
  if (error) throw error;
  if (!product) notFound();

  // Only the owner deletes, and only products that never held stock; work that out before offering it.
  const canDelete =
    profile.role === "owner" &&
    !(await hasStockHistory(
      supabase,
      product.variants.map((v) => v.id),
    ).catch(() => true));

  const sizes = sortSizes(unique(product.variants.map((v) => v.size ?? "One size")));
  const colors = sortColors(unique(product.variants.map((v) => v.color ?? "—")));
  const cell = (size: string, color: string) =>
    product.variants.find((v) => (v.size ?? "One size") === size && (v.color ?? "—") === color);
  const stock = productStock(product);
  const tags = product.tags.filter((t) => t.toLowerCase() !== "sample");
  const variants = [...product.variants].sort(
    (a, b) =>
      (a.color ?? "").localeCompare(b.color ?? "") ||
      sizes.indexOf(a.size ?? "One size") - sizes.indexOf(b.size ?? "One size"),
  );
  const updated = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(
    new Date(product.updated_at),
  );

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
      <Link
        href="/admin/products"
        className="press -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Products
      </Link>

      {justSaved && (
        <p role="status" className="mt-4 flex items-center gap-2.5 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          <CircleCheck aria-hidden="true" className="size-[1.125rem] text-board-text" />
          Product saved.
        </p>
      )}
      {!product.is_active && (
        <p className="mt-4 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] text-ink shadow-[inset_0_0_0_1px_var(--line)]">
          This product is archived. It’s hidden from the shop and the catalog list until you restore it.
        </p>
      )}

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
        <div className="mx-auto w-full max-w-[22rem] lg:mx-0">
          <ProductThumb src={product.image} name={product.name} size="lg" />
          {isSample(product) && (
            <p className="mt-3 text-center text-[0.8125rem] text-ink-2">Sample illustration. Real photos come with real products.</p>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="voice-display text-[clamp(2.25rem,4.5vw,3.25rem)]">{product.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="tabular text-[1.25rem] font-semibold text-ink">{priceRange(product)}</span>
            {!product.is_active && <Pill>Archived</Pill>}
            {isSample(product) && <Pill>Sample</Pill>}
          </p>
          {product.description && (
            <p className="mt-4 max-w-[60ch] text-[1rem] leading-relaxed text-ink-2">{product.description}</p>
          )}
          {tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tags">
              {tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/admin/products?q=${encodeURIComponent(t)}`}
                    className="press inline-flex rounded-full px-2.5 py-1 text-[0.8125rem] font-medium text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                  >
                    {t}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 sm:grid-cols-4">
            <Stat label="In stock" value={String(stock.total)} />
            <Stat label="Variants" value={String(product.variants.filter((v) => v.is_active).length)} />
            <Stat label="Low" value={String(stock.low)} />
            <Stat label="Sold out" value={String(stock.zero)} />
          </dl>

          <div className="mt-5">
            <ProductActions
              id={product.id}
              name={product.name}
              archived={!product.is_active}
              isOwner={profile.role === "owner"}
              canDelete={canDelete}
              lead={product.is_active ? <AdjustStockButton product={product} /> : undefined}
            />
            <p className="mt-3 text-[0.8125rem] text-ink-2">Last updated {updated}</p>
          </div>
        </div>
      </div>

      {/* Stock by size and color */}
      <section aria-labelledby="grid-title" className="mt-12">
        <h2 id="grid-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
          Stock by size and color
        </h2>
        {product.variants.length === 0 ? (
          <p className="py-6 text-[0.9375rem] text-ink-2">This product has no sizes or colors yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="border-separate border-spacing-1.5 text-left">
              <thead>
                <tr>
                  <th scope="col" className="pr-3 text-[0.8125rem] font-semibold text-ink-2">
                    <span className="sr-only">Color</span>
                  </th>
                  {sizes.map((s) => (
                    <th key={s} scope="col" className="voice-label min-w-12 text-center text-[0.8125rem] text-ink-2">
                      {s}
                    </th>
                  ))}
                  <th scope="col" className="voice-label pl-3 text-right text-[0.8125rem] text-ink-2">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {colors.map((c) => {
                  const rowTotal = sizes.reduce((sum, s) => sum + (cell(s, c)?.stock_quantity ?? 0), 0);
                  return (
                    <tr key={c}>
                      <th scope="row" className="whitespace-nowrap pr-3 text-[0.9375rem] font-semibold text-ink">
                        {c}
                      </th>
                      {sizes.map((s) => {
                        const v = cell(s, c);
                        if (!v) {
                          return (
                            <td key={s} className="text-center text-[0.8125rem] text-ink-2">
                              <span aria-label="Not offered">–</span>
                            </td>
                          );
                        }
                        const st = variantState(v);
                        return (
                          <td key={s}>
                            <span
                              data-stock={st}
                              className={`cell voice-board tabular grid h-11 min-w-12 place-items-center rounded-lg px-2 text-[1.25rem] ${
                                v.is_active ? "" : "opacity-40"
                              }`}
                              title={`${c} ${s}: ${v.stock_quantity} (${STATE_LABEL[st]}${v.is_active ? "" : ", hidden"})`}
                            >
                              {v.stock_quantity}
                            </span>
                          </td>
                        );
                      })}
                      <td className="tabular pl-3 text-right text-[0.9375rem] font-semibold text-ink">{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Every variant */}
      {variants.length > 0 && (
        <section aria-labelledby="variants-title" className="mt-12">
          <h2 id="variants-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
            Variants
          </h2>
          <ul className="sm:hidden">
            {variants.map((v) => {
              const st = variantState(v);
              return (
                <li key={v.id} className="flex items-start justify-between gap-4 border-b border-line py-3.5">
                  <div className="min-w-0">
                    <p className="tabular whitespace-nowrap text-[0.9375rem] font-semibold text-ink">{v.sku ?? "—"}</p>
                    <p className="mt-0.5 text-[0.875rem] text-ink">
                      {v.size ?? "One size"} · {v.color ?? "—"}
                    </p>
                    <p className="tabular mt-0.5 text-[0.8125rem] text-ink-2">
                      {formatPeso(v.price)} · alert at {v.low_stock_threshold}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="voice-board tabular text-[1.5rem] leading-none text-ink">{v.stock_quantity}</span>
                    <VariantStatus active={v.is_active} state={st} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden sm:block">
            <table className="w-full text-left text-[0.9375rem]">
              <thead>
                <tr className="text-[0.8125rem] text-ink-2">
                  {["SKU", "Size", "Color", "Price", "Stock", "Alert at", "Status"].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`voice-label border-b border-line py-3 pr-4 font-semibold ${i >= 3 && i <= 5 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const st = variantState(v);
                  return (
                    <tr key={v.id}>
                      <td className="tabular whitespace-nowrap border-b border-line py-3 pr-4 text-ink">{v.sku ?? "—"}</td>
                      <td className="border-b border-line py-3 pr-4 text-ink">{v.size ?? "One size"}</td>
                      <td className="border-b border-line py-3 pr-4 text-ink">{v.color ?? "—"}</td>
                      <td className="tabular border-b border-line py-3 pr-4 text-right text-ink">{formatPeso(v.price)}</td>
                      <td
                        className={`tabular border-b border-line py-3 pr-4 text-right ${st === "in" ? "text-ink" : "font-semibold text-ink"}`}
                      >
                        {v.stock_quantity}
                      </td>
                      <td className="tabular border-b border-line py-3 pr-4 text-right text-ink-2">{v.low_stock_threshold}</td>
                      <td className="border-b border-line py-3 pr-4">
                        <VariantStatus active={v.is_active} state={st} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SoldOutPill() {
  return (
    <span className="inline-flex rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]">
      Sold out
    </span>
  );
}

function VariantStatus({ active, state }: { active: boolean; state: "in" | "low" | "zero" }) {
  if (!active) return <Pill>Hidden</Pill>;
  if (state === "zero") return <SoldOutPill />;
  if (state === "low") return <Pill tone="amber">Low</Pill>;
  return <span className="text-[0.875rem] text-ink-2">In stock</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="voice-board tabular mt-1 text-[1.75rem] leading-none text-ink">{value}</dd>
    </div>
  );
}
