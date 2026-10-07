import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { personName } from "@/components/admin/orders/order-bits";
import { unreadFor, type ChatCustomer, type ChatMessage, type CustomerOrder } from "@/lib/admin/chat";
import { STATUS_LABEL } from "@/lib/admin/orders";
import { clock, dayLabel, firstNameOf, initials, sameDay } from "./chat-bits";
import { Composer, MarkRead, ScrollToEnd } from "./chat-client";

type Props = {
  customer: ChatCustomer;
  messages: ChatMessage[];
  more: boolean;
  orders: CustomerOrder[];
  ownerId: string;
  preselectOrder: string | null;
  /** False until the chat photos migration has run. */
  photos: boolean;
  error: boolean;
  now: Date;
};

/** One customer's conversation with the shop, newest at the bottom, with the reply box under it. */
export function ChatThread({ customer, messages, more, orders, ownerId, preselectOrder, photos, error, now }: Props) {
  const name = personName(customer);
  const unread = messages.filter((m) => unreadFor(m, ownerId)).length;
  const last = messages.at(-1);
  const latest = last?.id ?? "none";
  // Show the shop's sender names only when more than one person has replied.
  const shopSenders = new Set(messages.filter((m) => !m.fromCustomer).map((m) => m.sender?.id));
  const openOrders = orders.filter((o) => !["completed", "declined", "cancelled"].includes(o.status));

  return (
    <div>
      <MarkRead customerId={customer.id} unread={unread} latest={latest} />
      {/* Stays under the top bar while the conversation scrolls, so who you're writing to is always in view. */}
      <header className="sticky top-16 z-[5] -mx-4 -mt-8 flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line bg-ground px-4 pb-3 pt-3 sm:-mx-6 sm:-mt-10 sm:px-6 sm:pt-4 lg:mx-0 lg:mt-0 lg:gap-x-4 lg:px-0 lg:pt-1">
        <Link
          href="/admin/chat"
          aria-label="Back to all conversations"
          className="press -ml-2 grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-ground-2 lg:hidden"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-ground-2 text-[0.8125rem] font-bold text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] sm:size-10 lg:size-12 lg:text-[0.9375rem]">
          {initials(customer)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="voice-display truncate text-[clamp(1.375rem,3.5vw,2rem)] leading-tight">{name}</h2>
          <p className="mt-0.5 flex min-w-0 items-center gap-x-3 text-[0.875rem] text-ink-2 sm:flex-wrap sm:gap-y-1">
            <span className="min-w-0 truncate">@{customer.username}</span>
            {customer.phone && (
              <a
                href={`tel:${customer.phone.replace(/\s/g, "")}`}
                aria-label={`Call ${customer.phone}`}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-ink hover:underline"
              >
                <Phone aria-hidden="true" className="size-3.5" />
                <span className="tabular hidden min-[400px]:inline">{customer.phone}</span>
              </a>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} aria-label={`Email ${customer.email}`} className="hidden min-w-0 items-center gap-1 hover:text-ink hover:underline sm:inline-flex">
                <Mail aria-hidden="true" className="size-3.5" />
                <span className="truncate">{customer.email}</span>
              </a>
            )}
          </p>
        </div>
        {orders.length > 0 && (
          <nav aria-label={`${name}’s orders`} className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:mx-0 lg:w-full lg:px-0">
            <ul className="flex w-max gap-1.5">
              {(openOrders.length ? openOrders : orders.slice(0, 3)).map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="press inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[0.8125rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
                  >
                    <span className="tabular">{o.order_number}</span>
                    <span className="font-normal text-ink-2">{STATUS_LABEL[o.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {error ? (
        <p role="alert" className="auth-alert mt-6 rounded-2xl px-5 py-4 text-[0.9375rem]">
          We couldn’t load this conversation just now. Refresh the page to try again.
        </p>
      ) : (
        <ol aria-label={`Conversation with ${name}`} className="flex flex-col gap-1.5 py-6">
          {more && <li className="pb-3 text-center text-[0.8125rem] text-ink-2">Showing the latest 200 messages.</li>}
          {messages.length === 0 && (
            <li className="py-10 text-center text-[0.9375rem] text-ink-2">
              No messages yet. Write to {firstNameOf(customer)} below; they’ll get a notification.
            </li>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.created_at, m.created_at);
            const sideChanged = !prev || prev.fromCustomer !== m.fromCustomer || newDay;
            const orderChanged = m.order && (!prev || prev.order?.id !== m.order.id || newDay);
            const mine = !m.fromCustomer;
            const who = mine ? (m.sender?.id === ownerId ? "You" : personName(m.sender)) : name;
            return (
              <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${sideChanged && !newDay ? "mt-3" : ""}`}>
                {newDay && (
                  <p className="voice-label my-3 self-center text-[0.75rem] text-ink-2">{dayLabel(m.created_at, now)}</p>
                )}
                {orderChanged && m.order && (
                  <Link href={`/admin/orders/${m.order.id}`} className="tabular mb-1 text-[0.75rem] font-semibold text-ink-2 hover:text-ink hover:underline">
                    About {m.order.order_number}
                  </Link>
                )}
                <span className="sr-only">{who}: </span>
                {m.photoUrl && (
                  <a href={m.photoUrl} target="_blank" rel="noreferrer" className="chat-photo press max-w-[min(20rem,70%)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photoUrl} alt={mine ? "Photo you sent" : `Photo from ${name}`} />
                  </a>
                )}
                {m.photoPath && !m.photoUrl && <p className="rounded-2xl bg-ground-2 px-4 py-2.5 text-[0.9375rem] text-ink-2">Photo unavailable</p>}
                {m.message.trim() && (
                  <div
                    className={`max-w-[min(34rem,85%)] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed ${
                      mine ? "rounded-br-md bg-ink text-ground" : "rounded-bl-md bg-ground-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]"
                    } ${m.photoUrl ? "mt-1" : ""}`}
                  >
                    {m.message}
                  </div>
                )}
                <p className="tabular mt-1 px-1 text-[0.75rem] text-ink-2">
                  {mine && shopSenders.size > 1 && <>{who} · </>}
                  {clock(m.created_at)}
                  {unreadFor(m, ownerId) && <span className="font-semibold text-ink"> · New</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <ScrollToEnd latest={latest} mine={!!last && !last.fromCustomer && last.sender?.id === ownerId} />
      <Composer customerId={customer.id} ownerId={ownerId} firstName={firstNameOf(customer)} orders={orders} preselectOrder={preselectOrder} photos={photos} />
    </div>
  );
}
