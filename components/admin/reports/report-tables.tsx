import Link from "next/link";
import { Download } from "lucide-react";
import { Pill } from "@/components/admin/products/product-bits";
import { formatPeso, type StockState } from "@/lib/admin/catalog";
import { variantLabel, type Movement, type ProductGroup, type StockRow } from "@/lib/admin/inventory";

const th = "voice-label border-b border-line py-2.5 pr-4 text-[0.8125rem] font-semibold text-ink-2";
const td = "border-b border-line py-2.5 pr-4";
const num = "tabular text-right";

/** A report section: display heading on a rule, with its CSV download at the right. */
export function ReportSection({
  id,
  title,
  note,
  csv,
  csvText,
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  csv?: string;
  csvText?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="report-section mt-12">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
        <div>
          <h2 id={id} className="voice-display text-[1.75rem]">
            {title}
          </h2>
          {note && <p className="mt-1 text-[0.875rem] text-ink-2">{note}</p>}
        </div>
        {csv && <CsvLink href={csv} text={csvText} label={title} />}
      </div>
      {children}
    </section>
  );
}

export function CsvLink({ href, text = "CSV", label }: { href: string; text?: string; label: string }) {
  return (
    <a
      href={href}
      download
      data-print="hide"
      className="press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[0.875rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
    >
      <Download aria-hidden="true" className="size-4" />
      {text}
      <span className="sr-only">: {label}</span>
    </a>
  );
}

/** A table that may scroll sideways on phones; focusable and labeled so keyboard and screen-reader users can scroll it too. */
function Scroll({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="report-scroll overflow-x-auto outline-offset-2">
      {children}
    </div>
  );
}

// The first column stays put while the rest scroll sideways on phones.
const stick = "sticky left-0 z-[1] bg-ground";

export function StatusPill({ state }: { state: StockState }) {
  if (state === "zero")
    return (
      <span className="inline-flex rounded-full px-2.5 py-0.5 text-[0.75rem] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]">
        Sold out
      </span>
    );
  if (state === "low") return <Pill tone="amber">Low</Pill>;
  return <span className="text-[0.875rem] text-ink-2">In stock</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[0.9375rem] text-ink-2">{children}</p>;
}

export function RestockTable({ rows }: { rows: StockRow[] }) {
  if (rows.length === 0) return <Empty>Nothing needs restocking. Every size is above its alert level.</Empty>;
  return (
    <>
      {/* Phones: stacked rows, so the count and status are never off-screen. */}
      <ul className="sm:hidden">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-4 border-b border-line py-3">
            <div className="min-w-0">
              <Link href={`/admin/products/${r.productId}`} className="text-[0.9375rem] font-semibold text-ink hover:underline">
                {r.productName}
              </Link>
              <p className="mt-0.5 text-[0.875rem] text-ink">{variantLabel(r) || "—"}</p>
              <p className="tabular mt-0.5 text-[0.8125rem] text-ink-2">
                {r.sku ?? "No SKU"} · alert at {r.threshold}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="voice-board tabular text-[1.5rem] leading-none text-ink">{r.stock}</span>
              <StatusPill state={r.state} />
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block print:block">
        <Scroll label="Needs restock">
          <table className="w-full min-w-[40rem] text-left text-[0.9375rem]">
            <thead>
              <tr>
                <th scope="col" className={th}>Product</th>
                <th scope="col" className={th}>Size · color</th>
                <th scope="col" className={`${th} text-right`}>Stock</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={`${th} text-right`}>Alert at</th>
                <th scope="col" className={th}>SKU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} font-semibold text-ink`}>
                    <Link href={`/admin/products/${r.productId}`} className="hover:underline">
                      {r.productName}
                    </Link>
                  </td>
                  <td className={`${td} text-ink`}>{variantLabel(r) || "—"}</td>
                  <td className={`${td} ${num} font-semibold text-ink`}>{r.stock}</td>
                  <td className={td}>
                    <StatusPill state={r.state} />
                  </td>
                  <td className={`${td} ${num} text-ink-2`}>{r.threshold}</td>
                  <td className={`${td} tabular whitespace-nowrap text-ink-2`}>{r.sku ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </div>
    </>
  );
}

/** Zero reads as a dash so the real numbers stand out; pieces out carry a minus so a row adds across to Net. */
const qty = (n: number, sign: "none" | "auto" | "minus" = "none") => {
  if (n === 0) return <span className="text-ink-2">–</span>;
  // Pieces out read as minus; a negative count (a void after its sale's period) reads as plus.
  if (sign === "minus") return n > 0 ? `−${n}` : `+${-n}`;
  if (sign === "auto") return n > 0 ? `+${n}` : `−${-n}`;
  return n;
};

export function MovementTable({ movements, total }: { movements: Movement[]; total: Movement }) {
  if (movements.length === 0) return <Empty>No stock moved in this period.</Empty>;
  const cols: { key: keyof Movement; label: string; sign?: "auto" | "minus"; entries?: boolean }[] = [
    { key: "restocked", label: "Restocked" },
    { key: "returned", label: "Returned" },
    { key: "damaged", label: "Damaged", sign: "minus" },
    { key: "recounted", label: "Recounts", sign: "auto" },
    { key: "sold", label: "Sold", sign: "minus" },
    { key: "net", label: "Net", sign: "auto" },
    { key: "changes", label: "Entries", entries: true },
  ];
  const colCls = (c: (typeof cols)[number]) => (c.entries ? "border-l border-line pl-4" : "");
  return (
    <Scroll label="Stock movement by product">
      <table className="w-full min-w-[46rem] text-left text-[0.9375rem]">
        <thead>
          <tr>
            <th scope="col" className={`${th} ${stick}`}>Product</th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={`${th} text-right ${colCls(c)}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.productId}>
              <th scope="row" className={`${td} ${stick} max-w-[11rem] font-semibold text-ink sm:max-w-none`}>
                {m.productId ? (
                  <Link href={`/admin/products/${m.productId}`} className="hover:underline">
                    {m.productName}
                  </Link>
                ) : (
                  m.productName
                )}
              </th>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={`${td} ${num} ${colCls(c)} ${c.key === "net" ? "font-semibold text-ink" : c.entries ? "text-ink-2" : "text-ink"}`}
                >
                  {qty(m[c.key] as number, c.sign)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={`py-3 pr-4 text-left font-semibold text-ink ${stick}`}>
              Total
            </th>
            {cols.map((c) => (
              <td key={c.key} className={`py-3 pr-4 ${num} ${colCls(c)} font-semibold text-ink`}>
                {qty(total[c.key] as number, c.sign)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </Scroll>
  );
}

export function StockTable({ groups, pieces, value }: { groups: ProductGroup[]; pieces: number; value: number }) {
  if (groups.length === 0) return <Empty>No products on sale yet.</Empty>;
  const groupLine = "pb-2 pr-4 pt-5 text-left";
  return (
    <Scroll label="Stock on hand by product">
      <table className="w-full min-w-[40rem] text-left text-[0.9375rem]">
        <thead>
          <tr>
            <th scope="col" className={`${th} ${stick}`}>Size · color</th>
            <th scope="col" className={`${th} text-right`}>Stock</th>
            <th scope="col" className={`${th} text-right`}>Value</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={`${th} text-right`}>Price</th>
            <th scope="col" className={th}>SKU</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.productId} className="report-group">
            <tr>
              <th scope="rowgroup" className={`${groupLine} ${stick} text-[1rem] font-semibold text-ink`}>
                <Link href={`/admin/products/${g.productId}`} className="hover:underline">
                  {g.productName}
                </Link>
              </th>
              <td className={`${groupLine} ${num} text-[0.875rem] text-ink-2`}>{g.pieces} pcs</td>
              <td className={`${groupLine} ${num} text-[0.875rem] text-ink-2`}>{formatPeso(g.value)}</td>
              <td colSpan={3} />
            </tr>
            {g.rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} ${stick} text-ink`}>{variantLabel(r) || "—"}</td>
                <td className={`${td} ${num} ${r.state === "in" ? "text-ink" : "font-semibold text-ink"}`}>{r.stock}</td>
                <td className={`${td} ${num} text-ink`}>{formatPeso(r.value)}</td>
                <td className={td}>
                  <StatusPill state={r.state} />
                </td>
                <td className={`${td} ${num} text-ink-2`}>{formatPeso(r.price)}</td>
                <td className={`${td} tabular whitespace-nowrap text-ink-2`}>{r.sku ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        ))}
        <tfoot>
          <tr>
            <th scope="row" className={`py-4 pr-4 text-left text-[1rem] font-semibold text-ink ${stick}`}>
              All products
            </th>
            <td className={`py-4 pr-4 ${num} font-semibold text-ink`}>{pieces}</td>
            <td className={`py-4 pr-4 ${num} font-semibold text-ink`}>{formatPeso(value)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </Scroll>
  );
}
