import type { Metadata } from "next";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { OrdersListView } from "@/features/customer/orders/components/orders-list";
import { fetchMyOrders } from "@/features/customer/orders/data";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Orders · J&J Sportswear" };

const LIVE_TABLES = ["custom_orders", "payments"] as const;

export default async function OrdersPage() {
  const { supabase } = await requireCustomer();
  const { orders, error, migrated } = await fetchMyOrders(supabase);
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <OrdersListView orders={orders} error={Boolean(error)} migrated={migrated} />
    </>
  );
}
