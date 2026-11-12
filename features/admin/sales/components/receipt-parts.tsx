import { BrandBadge } from "@/features/shared/ui/brand-badge";
import { SHOP } from "@/lib/shop";

/**
 * The top of every slip (sales receipt, payment slip, order slip): the round badge, the shop's name in text
 * so it stays sharp on any printer, and where to find the shop. The badge is orange on screen and on A4, and
 * the one-color black version on the thermal roll (see `.slip-badge` in globals.css). `children` is the
 * slip's own line under the address ("Order slip").
 */
export function SlipHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="text-center">
      <BrandBadge className="slip-badge mx-auto size-12" />
      <p className="voice-display mt-3 text-[1.5rem] uppercase leading-none">{SHOP.name}</p>
      {SHOP.address && <p className="mt-1.5">{SHOP.address}</p>}
      <p className={SHOP.address ? undefined : "mt-1.5"}>{SHOP.city}</p>
      {SHOP.phone && <p className="tabular">{SHOP.phone}</p>}
      {children}
    </header>
  );
}
