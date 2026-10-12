import Link from "next/link";
import { formatPeso } from "@/features/shared/catalog/catalog";
import { change, type SalesReport } from "@/features/admin/reports/data";
import { CsvLink, ReportSection, Scroll, stick } from "./report-tables";
import { SalesChart } from "./sales-chart";

const th = "voice-label border-b border-line py-2.5 pr-4 text-[0.8125rem] font-semibold text-ink-2";
const td = "border-b border-line py-2.5 pr-4";
const num = "tabular text-right";
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/** The owner's sales report: headline figures against the period before, sales over time, best sellers, and cashiers. */
export function SalesReportView({ report: r, periodLabel, csv }: { report: SalesReport; periodLabel: string; csv: string }) {
  const t = r.totals;
  const p = r.previous;
  const average = t.sales ? Math.round((t.revenue / t.sales) * 100) / 100 : 0;
  const prevAverage = p?.sales ? Math.round((p.revenue / p.sales) * 100) / 100 : 0; // rounded like the figure it compares with
  const what = r.bucket === "hour" ? "hour" : r.bucket === "day" ? "day" : "month";

  if (t.sales === 0 && t.voided === 0) {
    return (
      <div className="mt-8 border-y border-line py-8">
        <p className="text-[1rem] font-semibold text-ink">No sales in this period</p>
        <p className="mt-1 max-w-[56ch] text-[0.9375rem] text-ink-2">
          Counter sales from{" "}
          <Link href="/admin/pos" className="font-semibold text-ink underline underline-offset-2">
            Point of sale
          </Link>{" "}
          show up here. Try a longer period.
        </p>
      </div>
    );
  }

  return (
    <>
      <ReportSection id="summary-title" title="Summary" note={periodLabel} csv={`${csv}&kind=sales-summary`} csvText="Summary CSV">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 py-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Sales total" value={formatPeso(t.revenue)} delta={p ? change(t.revenue, p.revenue) : null} wide />
          <Stat label="Sales" value={t.sales.toLocaleString("en-PH")} delta={p ? change(t.sales, p.sales) : null} />
          <Stat label="Average sale" value={formatPeso(average)} delta={p ? change(average, prevAverage) : null} />
          <Stat label="Pieces sold" value={t.pieces.toLocaleString("en-PH")} delta={p ? change(t.pieces, p.pieces) : null} />
          <Stat label="Cash" value={formatPeso(t.cash)} note={share(t.cash, t.revenue)} />
          <Stat label="GCash" value={formatPeso(t.gcash)} note={share(t.gcash, t.revenue)} />
        </dl>
        <p className="text-[0.875rem] text-ink-2">
          {r.previousLabel && p ? `Changes compare with ${r.previousLabel}. ` : ""}
          {t.voided > 0
            ? `${t.voided} voided ${t.voided === 1 ? "sale" : "sales"} (${formatPeso(t.voided_revenue)}) left out.`
            : "No voided sales."}
        </p>
      </ReportSection>

      <ReportSection id="time-title" title={`Sales by ${what}`} note={`Total of each ${what}, voided sales left out`} csv={`${csv}&kind=sales-series`}>
        {/* A new period is a new chart, so its keyboard stop starts on the latest bar. */}
        <SalesChart key={`${r.bucket}:${r.series[0]?.bucket}:${r.series.length}`} series={r.series} bucket={r.bucket} />
      </ReportSection>


      <ReportSection id="best-title" title="Best sellers" note="Products by sales total; sizes and colors by pieces">
        <div className="grid gap-x-10 gap-y-8 pt-2 lg:grid-cols-2">
          <div>
            <TableTitle id="best-products" title="Products" csv={`${csv}&kind=sales-products`} label="Best-selling products" />
            <Scroll label="Best-selling products">
              <table aria-labelledby="best-products" className="w-full min-w-[20rem] text-left text-[0.9375rem]">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} ${stick}`}>Product</th>
                    <th scope="col" className={`${th} text-right`}>Pieces</th>
                    <th scope="col" className={`${th} text-right`}>Total</th>
                    <th scope="col" className={`${th} pr-0 text-right`}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {r.products.map((x, i) => (
                    <tr key={x.product_id}>
                      <th scope="row" className={`${td} ${stick} max-w-[11rem] font-semibold text-ink sm:max-w-none`}>
                        <span className="tabular mr-2 inline-block w-5 font-normal text-ink-2">{i + 1}</span>
                        <Link href={`/admin/products/${x.product_id}`} className="hover:underline">
                          {x.name}
                        </Link>
                      </th>
                      <td className={`${td} ${num} text-ink`}>{x.pieces}</td>
                      <td className={`${td} ${num} font-semibold text-ink`}>{formatPeso(x.revenue)}</td>
                      <td className={`${td} ${num} pr-0 text-ink-2`}>{share(x.revenue, t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          </div>
          <div>
            <TableTitle id="best-variants" title="Sizes and colors" csv={`${csv}&kind=sales-variants`} label="Best-selling sizes and colors" />
            <Scroll label="Best-selling sizes and colors">
              <table aria-labelledby="best-variants" className="w-full min-w-[20rem] text-left text-[0.9375rem]">
                <thead>
                  <tr>
                    <th scope="col" className={`${th} ${stick}`}>Item</th>
                    <th scope="col" className={`${th} text-right`}>Pieces</th>
                    <th scope="col" className={`${th} pr-0 text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.variants.map((x, i) => (
                    <tr key={`${x.product_id}-${x.size}-${x.color}`}>
                      <th scope="row" className={`${td} ${stick} max-w-[12rem] font-normal text-ink sm:max-w-none`}>
                        <span className="flex gap-2">
                          <span className="tabular inline-block w-5 shrink-0 text-ink-2">{i + 1}</span>
                          <span>
                            <span className="font-semibold">{x.name}</span>
                            <span className="block text-[0.875rem] text-ink-2">{[x.size, x.color].filter(Boolean).join(" · ") || "One size"}</span>
                          </span>
                        </span>
                      </th>
                      <td className={`${td} ${num} font-semibold text-ink`}>{x.pieces}</td>
                      <td className={`${td} ${num} pr-0 text-ink`}>{formatPeso(x.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroll>
          </div>
        </div>
      </ReportSection>

      <ReportSection id="cashier-title" title="By cashier" note="Who rang up the sales" csv={`${csv}&kind=sales-cashiers`}>
        <Scroll label="Sales by cashier">
          {/* Phones keep Sales, Total, and Share; Average returns from the small breakpoint up. */}
          <table className="w-full min-w-[20rem] text-left text-[0.9375rem]">
            <thead>
              <tr>
                <th scope="col" className={`${th} ${stick}`}>Cashier</th>
                <th scope="col" className={`${th} text-right`}>Sales</th>
                <th scope="col" className={`${th} hidden text-right sm:table-cell`}>Average</th>
                <th scope="col" className={`${th} text-right`}>Total</th>
                <th scope="col" className={`${th} pr-0 text-right`}>Share</th>
              </tr>
            </thead>
            <tbody>
              {r.cashiers.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className={`${td} ${stick} font-semibold text-ink`}>
                    {c.full_name?.trim() || `@${c.username}`}
                    {c.full_name?.trim() && <span className="block font-normal text-ink-2 sm:ml-2 sm:inline">@{c.username}</span>}
                  </th>
                  <td className={`${td} ${num} text-ink`}>{c.sales}</td>
                  <td className={`${td} ${num} hidden text-ink-2 sm:table-cell`}>{formatPeso(Math.round((c.revenue / c.sales) * 100) / 100)}</td>
                  <td className={`${td} ${num} font-semibold text-ink`}>{formatPeso(c.revenue)}</td>
                  <td className={`${td} ${num} pr-0 text-ink-2`}>{share(c.revenue, t.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      </ReportSection>
    </>
  );
}

/** A small title above one of a section's tables, with that table's own CSV. */
function TableTitle({ id, title, csv, label }: { id: string; title: string; csv: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 pb-1 pt-3">
      <h3 id={id} className="text-[1rem] font-semibold text-ink">
        {title}
      </h3>
      <CsvLink href={csv} text="CSV" label={label} />
    </div>
  );
}

/** A figure with its change against the period before: "+12%" in ink, never green or red (no judgement, just the number). */
function Stat({ label, value, delta, note, wide = false }: { label: string; value: string; delta?: string | null; note?: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-1" : undefined}>
      <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className="voice-board mt-1 text-[1.75rem] leading-none text-ink">{value}</dd>
      {(delta || note) && (
        <dd className="tabular mt-1.5 text-[0.8125rem] text-ink-2">
          {delta === "new" ? "New this period" : delta === "same" ? "No change" : delta ? <span className="font-semibold text-ink">{delta}</span> : note}
          {delta && delta !== "new" && delta !== "same" && <span> vs before</span>}
          {!delta && note && " of sales"}
        </dd>
      )}
    </div>
  );
}
