import type { Metadata } from "next";
import { DesignView } from "@/components/customer/tab-views";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Design · J&J Sportswear" };

export default async function DesignPage() {
  await requireCustomer();
  return <DesignView />;
}
