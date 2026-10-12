import { AuthButton } from "@/features/shared/auth/components/auth-provider";
import { ArrowRight, BadgeCheck, BellRing, Boxes, ChartColumn, ClipboardList, ScanBarcode } from "lucide-react";

const ROWS = [
  {
    icon: ScanBarcode,
    name: "Point of sale",
    detail: "Ring up sales by size and color, take cash or GCash, and the change and receipt number are worked out for you.",
  },
  {
    icon: Boxes,
    name: "Inventory",
    detail: "Every restock, sale, adjustment, damage, and return is logged with the stock before and after.",
  },
  {
    icon: BellRing,
    name: "Low-stock alerts",
    detail: "Each size and color has its own threshold, so you hear about it before a size runs out.",
  },
  {
    icon: ClipboardList,
    name: "Custom orders",
    detail: "Accept or decline with a reason, move orders through production, and post a photo of the finished kit.",
  },
  {
    icon: BadgeCheck,
    name: "Payment checks",
    detail: "Match GCash reference numbers and screenshots, then verify or reject each down payment and balance.",
  },
  {
    icon: ChartColumn,
    name: "Reports",
    detail: "Sales and inventory reports are calculated from the counter’s own records, with nothing to re-encode.",
  },
];

/** The staff side, set as a box score on the board's own green. */
export function StaffBoxScore() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <h2 id="staff-title" className="voice-display text-[clamp(2.5rem,5.5vw,4.25rem)] text-board-ink">
          The same board, behind the counter.
        </h2>
        <p className="mt-5 max-w-[46ch] text-[1.0625rem] leading-relaxed text-board-ink-2">
          Owners and staff sign in with the same username login. Their role opens the counter tools, and the orders,
          stock, and payments they handle are the ones customers see.
        </p>
        <AuthButton
          mode="login"
          className="press mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-card px-5 text-[1rem] font-semibold text-card-ink shadow-[0_6px_14px_-6px_oklch(0_0_0/0.45)] hover:bg-white"
        >
          Staff log in
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
        </AuthButton>
      </div>

      <table className="w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Tools for owners and staff</caption>
        <tbody>
          {ROWS.map(({ icon: Icon, name, detail }) => (
            <tr key={name} className="align-top">
              <th scope="row" className="w-[42%] border-t border-board-line py-5 pr-4 font-normal sm:w-[36%]">
                <span className="flex items-center gap-3">
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-board-ink-2" strokeWidth={1.75} />
                  <span className="voice-board text-[1.375rem] uppercase leading-none text-board-ink sm:text-[1.5rem]">
                    {name}
                  </span>
                </span>
              </th>
              <td className="border-t border-board-line py-5 text-[0.9375rem] leading-relaxed text-board-ink-2 sm:text-[1rem]">
                {detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
