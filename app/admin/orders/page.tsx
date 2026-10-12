import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { ago } from "@/components/admin/orders/order-bits";
import { OrdersList } from "@/components/admin/orders/orders-list";
import { fetchOrders, PRODUCTION_MIGRATION, VIEWS, type OrderView } from "@/lib/admin/orders";
import { ORDER_TABLES } from "@/features/shared/orders/tables";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Custom orders · J&J Sportswear Admin" };

const EMPTY: Record<OrderView, string> = {
  open: "No orders are waiting or in production. New custom orders from customers show up here.",
  pending: "No new orders to review.",
  accepted: "No accepted orders waiting to start production.",
  in_progress: "Nothing is in production right now.",
  ready: "No orders are waiting for pickup.",
  completed: "No completed orders yet.",
  closed: "No declined or cancelled orders.",
  all: "No custom orders yet.",
};

/** Custom orders: what's new, what's in production, and what's ready to hand over. */
export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { supabase, profile } = await requireStaff();
  const raw = (await searchParams).view;
  const view = (VIEWS.some((v) => v.id === raw) ? raw : "open") as OrderView;
  const { orders, more, counts, migrated, error } = await fetchOrders(supabase, view, "");
  const now = new Date();
  const ages = Object.fromEntries(orders.map((o) => [o.id, ago(o.created_at, now)]));
  const countFor = (v: (typeof VIEWS)[number]) => (v.statuses.length ? v.statuses.reduce((s, st) => s + (counts[st] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0));

  return (
    <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
      <LiveRefresh tables={ORDER_TABLES} />
      <header className="mb-6">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Custom orders</h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] text-ink-2">
          {profile.role === "owner"
            ? "Review new orders, set the price, and follow each one through production to pickup."
            : "Follow each order from new through production to pickup, and record payments for them."}
        </p>
      </header>

      {!migrated && (
        <p role="status" className="auth-alert mb-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          Production steps and photos need the latest database update ({PRODUCTION_MIGRATION}). Orders still show; their
          progress appears once it’s run.
        </p>
      )}

      <nav aria-label="Order status" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1.5">
          {VIEWS.map((v) => {
            const on = v.id === view;
            const n = countFor(v);
            return (
              <li key={v.id}>
                <Link
                  href={v.id === "open" ? "/admin/orders" : `/admin/orders?view=${v.id}`}
                  aria-current={on ? "page" : undefined}
                  className={`press inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[0.875rem] font-semibold ${
                    on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                  }`}
                >
                  {v.label}
                  <span className={`tabular text-[0.8125rem] ${on ? "opacity-80" : ""}`}>{n}</span>
                  {v.id === "pending" && n > 0 && !on && <span aria-hidden="true" className="lamp" data-state="live" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {error ? (
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load the orders just now. Refresh the page to try again.
        </p>
      ) : (
        <>
          <OrdersList key={view} view={view} orders={orders} ages={ages} emptyNote={EMPTY[view]} />
          {more && (
            <p className="mt-4 text-[0.875rem] text-ink-2">Showing the newest 300 orders here. Search covers these; pick a narrower tab to find older ones.</p>
          )}
        </>
      )}
    </div>
  );
}
