import { redirect } from "next/navigation";

/** Chat lives in the bubble on every page now; old links open it over the shop. */
export default function ChatPage() {
  redirect("/shop?chat=open");
}
