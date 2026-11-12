import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { OrderView } from "@/features/admin/orders/components/order-view";
import { fetchProviders } from "@/features/shared/payments/data";
import { fetchOrder, VIEWS, type OrderView as OrdersTab } from "@/features/admin/orders/data";
import { ORDER_TABLES } from "@/features/shared/orders/tables";
import { fetchOrderMessages } from "@/features/admin/chat/data";
import { fetchOrderMoney } from "@/features/admin/payments/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Custom order" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderPage({ params, searchParams }: PageProps<"/admin/orders/[id]">) {
  const { supabase, profile } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ order, error }, { providers }] = await Promise.all([fetchOrder(supabase, id), fetchProviders(supabase)]);
  if (error) {
    return (
      <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          {error}
        </p>
      </div>
    );
  }
  if (!order) notFound();
  const isOwner = profile.role === "owner";
  const [money, chat] = await Promise.all([
    fetchOrderMoney(supabase, order.id, order.total_price),
    isOwner && order.customer ? fetchOrderMessages(supabase, order.id, order.customer.id) : Promise.resolve(null),
  ]);
  // Back to the tab staff came from (In production, Ready, …).
  const from = (await searchParams).from;
  return (
    <>
      <LiveRefresh tables={isOwner ? [...ORDER_TABLES, "chat_messages"] : ORDER_TABLES} />
      <OrderView order={order} money={money} chat={chat ? { ...chat, ownerId: profile.id } : undefined} isOwner={isOwner} providers={providers.filter((p) => p.isActive)} backView={VIEWS.some((v) => v.id === from) ? (from as OrdersTab) : "open"} />
    </>
  );
}
