import {
  ChartColumn,
  ClipboardList,
  History,
  House,
  MessageCircle,
  PackagePlus,
  ReceiptText,
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

/**
 * Where staff land. Following the manuscript, staff ring up sales at the counter and look
 * things up; the owner manages products, stock, orders, and the team.
 */
export const STAFF_HOME = "/admin/pos";

/** Always on the owner's dock. */
export const DOCK_SECTIONS: AdminSection[] = [
  { label: "Home", icon: House, href: "/admin", description: "Today at the shop" },
  { label: "Products", icon: Shirt, href: "/admin/products", description: "Catalog, sizes, and colors" },
  { label: "Stock", icon: PackagePlus, href: "/admin/stock", description: "Restock and adjust counts" },
  { label: "History", icon: History, href: "/admin/history", description: "Every stock change, logged" },
];

/** Behind the owner's More button. */
export const MORE_SECTIONS: AdminSection[] = [
  { label: "Point of sale", icon: ScanBarcode, href: "/admin/pos", description: "Ring up counter sales" },
  { label: "Sales", icon: ReceiptText, href: "/admin/sales", description: "Receipts, reprints, and voids" },
  { label: "Custom orders", icon: ClipboardList, href: "/admin/orders", description: "Accept, track, and finish orders" },
  { label: "Payments", icon: Wallet, href: "/admin/payments", description: "Check GCash payments for custom orders" },
  { label: "Chat", icon: MessageCircle, href: "/admin/chat", description: "Messages with customers", ownerOnly: true },
  { label: "Reports", icon: ChartColumn, href: "/admin/reports", description: "Sales and inventory, print and CSV", ownerOnly: true },
  { label: "Staff", icon: Users, href: "/admin/staff", description: "Accounts and roles", ownerOnly: true },
];

/**
 * Staff, following the manuscript: they sell at the counter and look stock up by size and
 * design. Orders are view only. Five tabs, so nothing waits behind More.
 */
export const STAFF_SECTIONS: AdminSection[] = [
  { label: "POS", icon: ScanBarcode, href: STAFF_HOME, description: "Ring up counter sales" },
  { label: "Sales", icon: ReceiptText, href: "/admin/sales", description: "Today’s receipts and reprints" },
  { label: "Products", icon: Shirt, href: "/admin/products", description: "Look up stock by size and design" },
  { label: "Orders", icon: ClipboardList, href: "/admin/orders", description: "Follow custom orders" },
  { label: "Payments", icon: Wallet, href: "/admin/payments", description: "Check GCash payments for custom orders" },
];

/** The dock and the More panel for a role. */
export function navFor(role: StaffRole): { dock: AdminSection[]; more: AdminSection[] } {
  return role === "owner" ? { dock: DOCK_SECTIONS, more: MORE_SECTIONS } : { dock: STAFF_SECTIONS, more: [] };
}

export function visibleTo(role: StaffRole) {
  return (s: AdminSection) => !s.ownerOnly || role === "owner";
}

export const ROLE_LABEL: Record<StaffRole, string> = { owner: "Owner", staff: "Staff" };
