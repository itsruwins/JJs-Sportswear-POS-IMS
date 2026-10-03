"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import type { StaffRole } from "@/lib/admin/session";
import { DOCK_SECTIONS, MORE_SECTIONS, visibleTo, type AdminSection } from "./nav";
import { usePopoverOpen } from "./use-popover-open";

function DockItem({ section, active }: { section: AdminSection; active: boolean }) {
  const Icon = section.icon;
  const body = (
    <>
      <Icon aria-hidden="true" className="size-[1.375rem]" strokeWidth={1.9} />
      <span>{section.label}</span>
    </>
  );

  if (!section.href) {
    return (
      <span className="admin-dock-item" aria-disabled="true">
        {body}
        <span className="admin-soon" aria-hidden="true">
          Soon
        </span>
        <span className="sr-only">(coming soon)</span>
      </span>
    );
  }
  return (
    <Link href={section.href} className="admin-dock-item press" aria-current={active ? "page" : undefined}>
      {body}
      <ReservedRow />
    </Link>
  );
}

/** Keeps every dock icon on one line, whether or not the item carries "Soon". */
function ReservedRow() {
  return (
    <span aria-hidden="true" className="admin-soon invisible">
      Soon
    </span>
  );
}

/** The admin's navigation: a floating dock on larger screens, a tab bar on phones. */
export function AdminDock({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const moreRef = useRef<HTMLDivElement>(null);
  const moreOpen = usePopoverOpen(moreRef);
  const more = MORE_SECTIONS.filter(visibleTo(role));

  return (
    <nav aria-label="Admin sections" className="admin-dock">
      <ul className="admin-dock-list">
        {DOCK_SECTIONS.map((s) => (
          <li key={s.label} className="flex flex-1 sm:flex-none">
            <DockItem section={s} active={s.href === pathname} />
          </li>
        ))}
        <li className="flex flex-1 sm:flex-none">
          <button
            type="button"
            popoverTarget="admin-more"
            aria-expanded={moreOpen}
            aria-controls="admin-more"
            className="admin-dock-item press"
          >
            <Ellipsis aria-hidden="true" className="size-[1.375rem]" strokeWidth={1.9} />
            <span>More</span>
            <ReservedRow />
          </button>
        </li>
      </ul>

      <div id="admin-more" ref={moreRef} popover="auto" className="admin-pop admin-more" aria-label="More sections">
        <p className="voice-label px-3 pb-1 pt-2 text-[0.8125rem] text-ink-2">More sections</p>
        <ul>
          {more.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.label} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ground-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-semibold leading-tight text-ink">{s.label}</span>
                  <span className="block text-[0.8125rem] leading-snug text-ink-2">{s.description}</span>
                </span>
                {!s.href && (
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.02em] text-ink-2 shadow-[inset_0_0_0_1px_var(--line)]">
                    Soon
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
