import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { RequestForm } from "@/features/customer/orders/components/request-form";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { fetchMyOrder } from "@/features/customer/orders/data";
import { fromLines, type RequestDraft } from "@/features/customer/orders/model";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Edit request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditRequestPage({ params }: PageProps<"/orders/[id]/edit">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { supabase, profile } = await requireCustomer();
  const { order } = await fetchMyOrder(supabase, id);
  if (!order) notFound();
  // Once the shop has reviewed it, the request is fixed; the order page explains why.
  if (order.status !== "pending" || !order.migrated) redirect(`/orders/${id}`);

  const initial: RequestDraft = {
    team: order.team_name ?? "",
    description: order.description ?? "",
    neededBy: order.needed_by ?? "",
    notes: order.notes ?? "",
    references: order.references,
    garments: fromLines(order.lines),
    design: order.design,
  };

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-[46rem]">
        <Link href={`/orders/${id}`} className="press -ml-2 mb-5 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="tabular">{order.order_number}</span>
        </Link>
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Edit your request</h1>
        <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
          You can change anything until the shop accepts it. Saving replaces what the shop sees.
        </p>
      </div>
      <div className="mt-8">
        <RequestForm uid={profile.id} initial={initial} orderId={id} migrated />
      </div>
    </div>
  );
}
