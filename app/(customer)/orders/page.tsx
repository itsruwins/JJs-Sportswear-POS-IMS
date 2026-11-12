import type { Metadata } from "next";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { OrdersListView } from "@/features/customer/orders/components/orders-list";
import { fetchMyOrders } from "@/features/customer/orders/data";
import { fetchMyTickets } from "@/features/customer/tickets/data";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Orders" };

// Orders and payments move, and a ticket turns Paid at the counter; the list follows them.
const LIVE_TABLES = ["custom_orders", "payments", "counter_tickets"] as const;

export default async function OrdersPage() {
  const { supabase, profile } = await requireCustomer();
  const [{ orders, error, migrated }, { tickets }] = await Promise.all([fetchMyOrders(supabase), fetchMyTickets(supabase, profile.id)]);
  // Rendered per request: which tickets have run out is decided at this visit.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <OrdersListView orders={orders} tickets={tickets} now={now} error={Boolean(error)} migrated={migrated} />
    </>
  );
}
