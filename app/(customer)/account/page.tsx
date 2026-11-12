import type { Metadata } from "next";
import { AccountView } from "@/features/customer/account/components/account-view";
import { initials, requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Account" };

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
      uid={profile.id}
      username={profile.username}
      initials={initials(profile.full_name, profile.username)}
      fullName={profile.full_name}
      phone={profile.phone}
      email={profile.email}
      avatarUrl={profile.avatar_url}
      joined={joined}
    />
  );
}
