import { Check, Shirt } from "lucide-react";
import type { StaffRole } from "@/lib/admin/session";
import { DOCK_SECTIONS, MORE_SECTIONS, ROLE_LABEL, visibleTo } from "./nav";
import { ReadoutBoard, type Readout } from "./readout-board";

export type RestockRow = {
  id: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  stock_quantity: number;
  product: { name: string } | null;
};

type Props = {
  firstName: string;
  username: string;
  role: StaffRole;
  greeting: string;
  dateLine: string;
  loadFailed: boolean;
  readouts: Readout[];
  productCount: number;
  needsRestock: RestockRow[];
  attentionCount: number;
};

/** The admin home screen. The page fetches; this only renders. */
export function AdminHomeView({
  firstName,
  username,
  role,
  greeting,
  dateLine,
  loadFailed,
  readouts,
  productCount,
  needsRestock,
  attentionCount,
}: Props) {
  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <header className="mb-7 sm:mb-8">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">
          {greeting}, {firstName}.
        </h1>
        <p className="voice-label mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.9375rem] text-ink-2">
          <span>{dateLine}</span>
          <span aria-hidden="true">·</span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[0.8125rem] ${
              role === "owner" ? "bg-board text-board-ink" : "bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]"
            }`}
          >
            {ROLE_LABEL[role]}
          </span>
        </p>
      </header>

      {loadFailed ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the shop’s numbers just now. Refresh the page to try again.
        </p>
      ) : (
        <ReadoutBoard items={readouts} />
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-14">
        <section aria-labelledby="restock-title">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h2 id="restock-title" className="voice-display text-[1.75rem]">
              Needs restock
            </h2>
            {needsRestock.length > 0 && (
              <p className="tabular text-[0.875rem] text-ink-2">
                {attentionCount} {attentionCount === 1 ? "size" : "sizes"}
              </p>
            )}
          </div>

          {productCount === 0 ? (
            <EmptyState
              title="No products yet"
              body="Once products are added, any size running low shows up here so you know what to restock."
            />
          ) : needsRestock.length === 0 ? (
            <EmptyState
              title="Everything’s stocked"
              body="No size is at or below its low-stock level right now."
            />
          ) : (
            <ul>
              {needsRestock.map((v) => {
                const sold = v.stock_quantity <= 0;
                return (
                  <li key={v.id} className="flex items-center gap-4 border-b border-line py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[1rem] font-semibold text-ink">{v.product?.name ?? "Unnamed product"}</p>
                      <p className="mt-0.5 text-[0.875rem] text-ink-2">{[v.size, v.color].filter(Boolean).join(" · ")}</p>
                      {v.sku && <p className="tabular mt-0.5 whitespace-nowrap text-[0.8125rem] text-ink-2">{v.sku}</p>}
                    </div>
                    <span
                      data-stock={sold ? "zero" : "low"}
                      className="cell voice-board tabular grid h-11 min-w-12 shrink-0 place-items-center rounded-lg px-2 text-[1.375rem]"
                    >
                      {v.stock_quantity}
                    </span>
                    <span
                      className={`w-[4.5rem] shrink-0 text-right text-[0.875rem] ${sold ? "font-semibold text-ink" : "text-ink-2"}`}
                    >
                      {sold ? "Sold out" : "Low"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {role === "owner" ? (
          <section aria-labelledby="setup-title">
            <h2 id="setup-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
              Getting set up
            </h2>
            <ol>
              <SetupStep done title="Owner account" body={`You’re signed in as @${username}.`} />
              <SetupStep
                done={productCount > 0}
                title="Add your products"
                body={productCount > 0 ? `${productCount} in the catalog.` : "Arrives with the Products section."}
              />
              <SetupStep
                title="Bring in your staff"
                body="Staff create an account on the shop page, then you give them access from Staff."
              />
              <SetupStep title="Open the counter" body="Ring up sales here once Point of sale is ready." />
            </ol>
          </section>
        ) : (
          <section aria-labelledby="next-title">
            <h2 id="next-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
              Coming to the admin
            </h2>
            <ul>
              {[...DOCK_SECTIONS, ...MORE_SECTIONS]
                .filter((s) => !s.href)
                .filter(visibleTo(role))
                .map((s) => (
                  <li key={s.label} className="border-b border-line py-3.5">
                    <p className="text-[1rem] font-semibold text-ink">{s.label}</p>
                    <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">{s.description}</p>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-4 py-8">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
        <Shirt aria-hidden="true" className="size-6" strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-[1.0625rem] font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-2">{body}</p>
      </div>
    </div>
  );
}

function SetupStep({ done = false, title, body }: { done?: boolean; title: string; body: string }) {
  return (
    <li className="flex gap-3.5 border-b border-line py-3.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
          done ? "bg-board text-board-ink" : "shadow-[inset_0_0_0_1.5px_var(--line)]"
        }`}
      >
        {done && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <div>
        <p className="text-[1rem] font-semibold text-ink">
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </p>
        <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">{body}</p>
      </div>
    </li>
  );
}
