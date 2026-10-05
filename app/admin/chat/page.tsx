import { MessagesSquare } from "lucide-react";

/** Wide screens: what sits beside the inbox until a conversation is picked. Phones show only the inbox. */
export default function ChatIndexPage() {
  return (
    <div className="grid min-h-[24rem] place-items-center rounded-3xl bg-ground-2/60 px-6 py-16 text-center shadow-[inset_0_0_0_1px_var(--line)] lg:mt-2">
      <div className="max-w-[30ch]">
        <MessagesSquare aria-hidden="true" className="mx-auto size-8 text-ink-2" strokeWidth={1.6} />
        <p className="mt-3 text-[1rem] font-semibold text-ink">Pick a conversation</p>
        <p className="mt-1 text-[0.9375rem] text-ink-2">Choose a customer on the left to read and reply.</p>
      </div>
    </div>
  );
}
