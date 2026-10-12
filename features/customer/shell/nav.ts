import { CircleUserRound, ClipboardList, Palette, Shirt, type LucideIcon } from "lucide-react";

export { CUSTOMER_HOME } from "@/lib/paths";

export type CustomerTab = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** On desktop, Account lives in the avatar menu instead of the top bar. */
  desktop: boolean;
};

export const CUSTOMER_TABS: CustomerTab[] = [
  { label: "Shop", href: "/shop", icon: Shirt, desktop: true },
  { label: "Orders", href: "/orders", icon: ClipboardList, desktop: true },
  { label: "Design", href: "/design", icon: Palette, desktop: true },
  { label: "Account", href: "/account", icon: CircleUserRound, desktop: false },
];

export function isActiveTab(href: string, current: string) {
  return current === href || current.startsWith(`${href}/`);
}
