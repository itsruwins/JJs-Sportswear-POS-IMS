import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/features/shared/ui/live-refresh";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { normalizeTicketCode, ticketState } from "@/features/shared/tickets/model";
import { TicketView } from "@/features/customer/tickets/components/ticket-view";
import { fetchMyTicket, fetchTicketOrder, fetchTicketReceipt } from "@/features/customer/tickets/data";
import { ticketQr } from "@/features/customer/tickets/qr";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Counter ticket" };

// Stock moves under a ticket, and the counter can mark it paid or ordered while it's on screen; the
// page follows them, and the order a design ticket made as the shop works on it and takes payments
// (and checks the clock each minute).
const LIVE_TABLES = ["products", "product_variants", "counter_tickets", "custom_orders", "payments"] as const;

export default async function TicketPage({ params }: PageProps<"/orders/tickets/[code]">) {
  const { code: raw } = await params;
  const code = normalizeTicketCode(decodeURIComponent(raw));
  if (!code) notFound();
  const { supabase, profile } = await requireCustomer();
  const { ticket, error } = await fetchMyTicket(supabase, profile.id, code);
  if (error && !ticket) {
    return (
      <div className={pageShell}>
        <p role="alert" className="auth-alert max-w-[46rem] rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load this ticket just now. Check your connection, then refresh the page.
        </p>
      </div>
    );
  }
  if (!ticket) notFound();

  // The page is rendered per request, so the clock here is the visit's.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const state = ticketState(ticket, now);
  const [qr, receipt, order] = await Promise.all([
    state === "ready" ? ticketQr(ticket.code) : null,
    state === "paid" ? fetchTicketReceipt(supabase, ticket) : null,
    state === "ordered" && ticket.order ? fetchTicketOrder(supabase, ticket.order.id) : null,
  ]);
  return (
    <>
      <LiveRefresh tables={LIVE_TABLES} />
      <TicketView ticket={ticket} qr={qr} now={now} receipt={receipt} order={order} />
    </>
  );
}
