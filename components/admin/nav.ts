import {
  ChartColumn,
  ClipboardList,
  History,
  House,
  MessageCircle,
  PackagePlus,
  ScanBarcode,
  Shirt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { StaffRole } from "@/lib/admin/session";

export type AdminSection = {
  label: string;
  icon: LucideIcon;
  /** Set once the section is built; until then it shows as "Soon". */
  href?: string;
  description: string;
  ownerOnly?: boolean;
};

/** Always on the dock. */
export const DOCK_SECTIONS: AdminSection[] = [
  { label: "Home", icon: House, href: "/admin", description: "Today at the shop" },
  { label: "Products", icon: Shirt, href: "/admin/products", description: "Catalog, sizes, and colors" },
  { label: "Stock", icon: PackagePlus, href: "/admin/stock", description: "Restock and adjust counts" },
  { label: "History", icon: History, description: "Every stock change, logged" },
];

/** Behind the dock's More button. */
export const MORE_SECTIONS: AdminSection[] = [
  { label: "Point of sale", icon: ScanBarcode, description: "Ring up counter sales" },
  { label: "Custom orders", icon: ClipboardList, description: "Accept, track, and finish orders" },
  { label: "Payments", icon: Wallet, description: "Check GCash and cash payments" },
  { label: "Chat", icon: MessageCircle, description: "Messages with customers" },
  { label: "Reports", icon: ChartColumn, description: "Sales and inventory reports", ownerOnly: true },
  { label: "Staff", icon: Users, description: "Accounts and roles", ownerOnly: true },
];

export function visibleTo(role: StaffRole) {
  return (s: AdminSection) => !s.ownerOnly || role === "owner";
}

export const ROLE_LABEL: Record<StaffRole, string> = { owner: "Owner", staff: "Staff" };
