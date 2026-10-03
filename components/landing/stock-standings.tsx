import { GarmentIcon } from "./garments";
import { LOW_STOCK_THRESHOLD, SAMPLE_PRODUCTS, stockState } from "./data";

const SIZES = ["S", "M", "L", "XL", "2XL"];

const STATE_LABEL = { in: "in stock", low: "low stock", out: "sold out" } as const;

/** A size run set into a strip of board: lit cards in stock, amber when low, an empty slot when sold out. */
function SizeRail({ stock, labelled }: { stock: { size: string; qty: number }[]; labelled: boolean }) {
  return (
    <ul className="on-board grid grid-cols-5 gap-1.5 rounded-xl bg-board p-1.5" aria-label="Sizes">
      {stock.map((s) => {
        const st = stockState(s.qty);
        return (
          <li
            key={s.size}
            data-stock={st}
            className="cell flex h-14 flex-col items-center justify-center rounded-lg md:h-12"
            aria-label={`${s.size}: ${st === "out" ? STATE_LABEL.out : `${s.qty} ${STATE_LABEL[st]}`}`}
          >
            {labelled && (
              <span aria-hidden="true" className="voice-label text-[0.6875rem] leading-none opacity-70">
                {s.size}
              </span>
            )}
            <span aria-hidden="true" className="voice-board tabular text-[1.375rem] leading-tight md:text-[1.5rem]">
              {st === "out" ? "–" : s.qty}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LegendCell({ state }: { state: "in" | "low" | "out" }) {
  return (
    <span aria-hidden="true" className="on-board inline-grid rounded-[5px] bg-board p-[3px]">
      <span data-stock={state} className="cell block size-3.5 rounded-[3px]" />
    </span>
  );
}

/** Sizes and stock laid out like league standings: one row per product. */
export function StockStandings() {
  return (
    <div>
      <table className="w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Sample stock by product and size</caption>
        <thead className="hidden md:table-header-group">
          <tr className="text-[0.8125rem] text-ink-2">
            <th scope="col" className="voice-label pb-3 font-semibold">
              Product
            </th>
            <th scope="col" className="w-[22rem] pb-3 font-semibold">
              <span className="sr-only">Stock by size</span>
              <span aria-hidden="true" className="voice-label grid grid-cols-5 gap-1.5 px-1.5 text-center">
                {SIZES.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_PRODUCTS.map((p) => (
            <tr key={p.name} className="flex flex-col gap-3 border-t border-line py-4 md:table-row md:py-0">
              <th scope="row" className="font-normal md:border-t md:border-line md:py-4 md:pr-6">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-board text-card">
                    <GarmentIcon garment={p.garment} className="size-9" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[1.0625rem] font-semibold leading-tight text-ink">{p.name}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem] text-ink-2">
                      {p.colors.map((c) => (
                        <span key={c.name} className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="size-3 rounded-full shadow-[inset_0_0_0_1.5px_var(--line)]"
                            style={{ background: c.swatch }}
                          />
                          {c.name}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
              </th>
              <td className="md:w-[22rem] md:border-t md:border-line md:py-4">
                <div className="md:hidden">
                  <SizeRail stock={p.stock} labelled />
                </div>
                <div className="hidden md:block">
                  <SizeRail stock={p.stock} labelled={false} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[0.875rem] text-ink-2" aria-label="Legend">
          <li className="inline-flex items-center gap-2">
            <LegendCell state="in" />
            In stock
          </li>
          <li className="inline-flex items-center gap-2">
            <LegendCell state="low" />
            Low, {LOW_STOCK_THRESHOLD} or fewer left
          </li>
          <li className="inline-flex items-center gap-2">
            <LegendCell state="out" />
            Sold out
          </li>
        </ul>
        <p className="text-[0.875rem] text-ink-2">Sample stock. The shop shows live counts.</p>
      </div>
    </div>
  );
}
