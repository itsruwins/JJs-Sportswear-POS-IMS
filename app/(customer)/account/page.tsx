import type { Metadata } from "next";
import { AccountView } from "@/components/customer/tab-views";
import { requireCustomer } from "@/lib/customer/session";

export const metadata: Metadata = { title: "Account · J&J Sportswear" };

export default async function AccountPage() {
  const { profile } = await requireCustomer();
  const joined = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(profile.created_at));

  return (
    <AccountView
      fullName={profile.full_name}
      username={profile.username}
      phone={profile.phone}
      email={profile.email}
      joined={joined}
    />
  );
}
