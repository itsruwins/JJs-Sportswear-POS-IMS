"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CUSTOMER_TABS, isActiveTab } from "./nav";

/**
 * The customer's tabs: the admin's dock, so both sides of the counter move the same way.
 * A tab bar on phones, a floating dock on tablets; on desktop the tabs sit in the top bar.
 */
export function CustomerDock({ activeHref }: { activeHref?: string }) {
  const current = usePathname();
  const pathname = activeHref ?? current;

  return (
    <nav aria-label="Sections" className="admin-dock customer-dock">
      <ul className="admin-dock-list">
        {CUSTOMER_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <li key={t.href} className="flex flex-1 sm:flex-none">
              <Link
                href={t.href}
                aria-current={isActiveTab(t.href, pathname) ? "page" : undefined}
                className="admin-dock-item press"
              >
                <span className="admin-dock-icon">
                  <Icon aria-hidden="true" className="size-[1.375rem]" strokeWidth={1.9} />
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
