import { LogOutButton } from "./log-out-button";
import { NotYetPanel, PageHeader, pageShell } from "./page-parts";

/** The stages every custom order moves through, as the shop's admin tracks them. */
const STAGES = ["Placed", "Accepted", "In production", "Ready", "Picked up"];

export function ShopView({ greeting, name, dateLine, products }: { greeting: string; name: string; dateLine: string; products: number | null }) {
  return (
    <div className={pageShell}>
      <header className="mb-8 sm:mb-10">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">
          {greeting}, {name}.
        </h1>
        <p className="voice-label mt-3 text-[0.9375rem] text-ink-2">{dateLine}</p>
      </header>

      <NotYetPanel title="Every product, with what’s left on the rack." soon="Opens in the next update">
        <p>
          You’ll see every jersey, shirt, and pair of shorts with its sizes, colors, and the pieces left on the rack,
          updated as the counter sells. Ready-made items are bought at the shop.
        </p>
        {products !== null && products > 0 && (
          <p className="mt-4 flex items-baseline gap-2 text-ink">
            <span className="voice-board tabular text-[1.75rem] leading-none">{products}</span>
            <span>{products === 1 ? "product has" : "products have"} stock on the rack right now.</span>
          </p>
        )}
      </NotYetPanel>
    </div>
  );
}

export function OrdersView() {
  return (
    <div className={pageShell}>
      <PageHeader title="Orders" sub="Custom kits you’ve asked the shop to make, and where each one is." />

      {/* The order board, idle: nothing placed yet, so no lamp is lit. */}
      <div className="board mb-6 max-w-[46rem] rounded-[1.25rem] px-4 py-3.5 text-board-ink sm:px-5">
        <ol aria-label="How an order moves" className="grid grid-cols-5 gap-2">
          {STAGES.map((label) => (
            // Phones: lamp centered over a two-line label box in every cell, so a wrapped label keeps the run even.
            <li key={label} className="flex min-w-0 flex-col items-center gap-2 sm:flex-row sm:items-center">
              <span aria-hidden="true" className="lamp shrink-0" />
              <span className="flex min-h-[2lh] items-start text-center text-[0.75rem] leading-tight text-board-ink-2 sm:min-h-0 sm:text-left sm:text-[0.8125rem]">
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <NotYetPanel title="No custom orders yet." soon="Opens in a later update">
        <p>
          When you send a request, it shows up here and moves along this board: the shop accepts it with a price, you pay
          at least half as a down payment, then it goes through printing, cutting, sewing, and inspection until it’s ready
          for pickup.
        </p>
      </NotYetPanel>
    </div>
  );
}

export function DesignView() {
  return (
    <div className={pageShell}>
      <PageHeader title="Design" sub="Describe a jersey in your own words and see it drawn." />
      <NotYetPanel title="The design studio is still being built." soon="Opens in a later update">
        <p>
          Every try is saved to your account. Pick the one you like and attach it to a custom order, so the shop sees
          exactly what you mean.
        </p>
      </NotYetPanel>
    </div>
  );
}

export function ChatView() {
  return (
    <div className={pageShell}>
      <PageHeader title="Chat" sub="Ask the shop about sizes, stock, or your order." />
      <NotYetPanel title="Messaging is still being built." soon="Opens in a later update">
        <p>
          You’ll have one conversation with the shop. Messages about a specific order stay linked to it, so nobody has to
          ask which one you mean.
        </p>
      </NotYetPanel>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="voice-label text-[0.8125rem] text-ink-2">{label}</dt>
      <dd className={`break-words text-[0.9375rem] ${value ? "text-ink" : "text-ink-2"}`}>{value ?? "Not added"}</dd>
    </div>
  );
}

export function AccountView({
  fullName,
  username,
  phone,
  email,
  joined,
}: {
  fullName: string | null;
  username: string;
  phone: string | null;
  email: string | null;
  joined: string;
}) {
  return (
    <div className={pageShell}>
      <PageHeader title="Account" sub="The details the shop sees when you order or message them." />

      <section aria-labelledby="details-title" className="max-w-[40rem]">
        <h2 id="details-title" className="voice-display border-b border-line pb-3 text-[1.75rem]">
          Your details
        </h2>
        <dl className="divide-y divide-line">
          <Row label="Name" value={fullName} />
          <Row label="Username" value={`@${username}`} />
          <Row label="Phone" value={phone} />
          <Row label="Email" value={email} />
          <Row label="Member since" value={joined} />
        </dl>
        <p className="mt-2 border-t border-line pt-4 text-[0.875rem] text-ink-2">
          Editing your details and adding a profile photo come in a later update.
        </p>
        <LogOutButton className="mt-8" />
      </section>
    </div>
  );
}
