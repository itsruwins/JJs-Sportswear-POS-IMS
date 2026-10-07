import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { OrderDetailView } from "@/components/customer/orders/order-views";
import { pageShell } from "@/components/customer/page-parts";
import { fetchMyOrder } from "@/lib/customer/order-data";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Order · J&J Sportswear" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_TABLES = ["custom_orders", "custom_order_items"] as const;

export default async function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase } = await requireCustomer();
  const sp = await searchParams;
  const { order, error } = await fetchMyOrder(supabase, id);
  if (error) {
    return (
      <div className={pageShell}>
        <p role="alert" className="auth-alert mx-auto max-w-[46rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load this order just now. Check your connection, then refresh the page.
        </p>
      </div>
    );
  }
  if (!order) notFound();
  const flash = sp.sent ? "sent" : sp.saved ? "saved" : null;
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <OrderDetailView order={order} flash={flash} />
    </>
  );
}
