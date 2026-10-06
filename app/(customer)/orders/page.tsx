import type { Metadata } from "next";
import { OrdersView } from "@/components/customer/tab-views";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Orders · J&J Sportswear" };

export default async function OrdersPage() {
  await requireCustomer();
  return <OrdersView />;
}
