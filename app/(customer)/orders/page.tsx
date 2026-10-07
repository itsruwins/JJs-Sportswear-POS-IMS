import type { Metadata } from "next";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { OrdersListView } from "@/components/customer/orders/order-views";
import { fetchMyOrders } from "@/lib/customer/order-data";
import { requireCustomer } from "@/lib/customer/session";

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
