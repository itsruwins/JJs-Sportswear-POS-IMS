import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { PaymentView } from "@/features/admin/payments/components/payment-view";
import { fetchPayment } from "@/features/admin/payments/data";
import { fetchProviders } from "@/features/shared/payments/data";
import { requireStaff } from "@/features/admin/shell/session";

export const metadata: Metadata = { title: "Payment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentPage({ params }: PageProps<"/admin/payments/[id]">) {
  const { supabase } = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [{ payment, error }, { providers }] = await Promise.all([fetchPayment(supabase, id), fetchProviders(supabase)]);
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
      <PaymentView payment={payment} providers={providers.map((p) => ({ code: p.code, name: p.name }))} />
    </>
  );
}
