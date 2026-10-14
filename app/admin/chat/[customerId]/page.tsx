import { notFound, redirect } from "next/navigation";
import { ChatThread } from "@/features/admin/chat/components/chat-thread";
import { fetchThread, findCustomer } from "@/features/admin/chat/data";
import { requireStaff, STAFF_HOME } from "@/features/admin/shell/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One customer's conversation. `?order=` picks the order a new message is about. */
export default async function ChatThreadPage({ params, searchParams }: PageProps<"/admin/chat/[customerId]">) {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") redirect(STAFF_HOME);
  const { customerId } = await params;
  if (!UUID.test(customerId)) notFound();

  const found = await findCustomer(supabase, customerId);
  // An older alert may point at an order; open that customer's conversation instead.
  if (found.kind === "order") redirect(`/admin/chat/${found.customerId}?order=${customerId}`);
  if (found.kind === "missing") notFound();
  if (found.kind === "error") {
    return (
      <p role="alert" className="auth-alert rounded-2xl px-5 py-4 text-[0.9375rem]">
        We couldn’t load this conversation just now. Refresh the page to try again.
      </p>
    );
  }

  const { messages, more, orders, photos, error } = await fetchThread(supabase, customerId);
  const order = (await searchParams).order;
  return (
    <ChatThread
      customer={found.customer}
      messages={messages}
      more={more}
      orders={orders}
      ownerId={profile.id}
      preselectOrder={typeof order === "string" ? order : null}
      photos={photos}
      error={error}
      now={new Date()}
    />
  );
}
