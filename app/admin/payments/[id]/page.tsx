import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/admin/live-refresh";
import { PaymentView } from "@/components/admin/payments/payment-view";
import { fetchPayment } from "@/lib/admin/payments";
import { requireStaff } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Payment · J&J Sportswear Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentPage({ params }: PageProps<"/admin/payments/[id]">) {
  const { supabase } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { payment, error } = await fetchPayment(supabase, id);
  if (error) {
    return (
      <div className="mx-auto max-w-[80rem] px-4 pt-8 sm:px-6 sm:pt-10 lg:px-10">
        <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
          {error}
        </p>
      </div>
    );
  }
  if (!payment) notFound();
  return (
    <>
      <LiveRefresh tables={["payments", "custom_orders"]} />
      <PaymentView payment={payment} />
    </>
  );
}
