import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RequestForm } from "@/features/customer/orders/components/request-form";
import { pageShell } from "@/features/customer/shell/components/page-parts";
import { fetchMyDesign } from "@/features/customer/design/data";
import { picksSummary } from "@/features/customer/design/model";
import { requestsReady } from "@/features/customer/orders/data";
import { blankGarment, garmentForProduct, type AttachedDesign, type RequestDraft } from "@/features/customer/orders/model";
import { requireCustomer } from "@/features/customer/shell/session";

export const metadata: Metadata = { title: "Request a custom order" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewRequestPage({ searchParams }: PageProps<"/orders/new">) {
  const { supabase, profile } = await requireCustomer();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

  // "Make a custom version" on a shop product starts with that garment and color.
  let first = blankGarment();
  let basedOn: string | null = null;
  const productId = one(params.product);
  if (UUID.test(productId)) {
    const { data } = await supabase
      .from("products")
      .select("name, product_tags (tag)")
      .eq("id", productId)
      .maybeSingle<{ name: string; product_tags: { tag: string }[] | null }>();
    if (data) {
      basedOn = data.name;
      first = blankGarment(garmentForProduct(data.name, (data.product_tags ?? []).map((t) => t.tag)), one(params.color).slice(0, 40));
    }
  }

  // "Use this design" from the studio: attach it and start from its picks.
  let design: AttachedDesign | null = null;
  let team = "";
  const designId = one(params.design);
  if (UUID.test(designId)) {
    const d = await fetchMyDesign(supabase, designId);
    if (d) {
      const picks = d.details ?? {};
      design = { id: d.id, url: d.url, label: [picks.team, picksSummary(picks)].filter(Boolean).join(" · ") || "AI design" };
      team = picks.team ?? "";
      if (picks.garment) {
        first = blankGarment(picks.garment, (picks.colors ?? []).join(" / "));
        if (picks.playerName || picks.number) first.notes = [picks.playerName?.toUpperCase(), picks.number].filter(Boolean).join(" ");
      }
      basedOn = null;
    }
  }

  const initial: RequestDraft = { team, description: "", neededBy: "", notes: "", references: [], garments: [first], design };
  const migrated = await requestsReady(supabase);

  return (
    <div className={pageShell}>
      <div className="mx-auto max-w-[46rem]">
        <Link href={design ? "/design" : basedOn ? `/shop/${productId}` : "/orders"} className="press -ml-2 mb-5 inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft aria-hidden="true" className="size-4" />
          {design ? "Design" : basedOn ? basedOn : "Orders"}
        </Link>
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">Request a custom order</h1>
        <p className="mt-3 max-w-[48ch] text-[1.0625rem] leading-relaxed text-ink-2">
          {design
            ? "Starting from your studio design. Add sizes and anything else; the shop prices it after you send it."
            : basedOn
            ? `Starting from the ${basedOn}. Change anything you like; the shop prices it after you send it.`
            : "Tell the shop what to make. There’s no price yet: the shop sends one after it reviews your request."}
        </p>
      </div>
      <div className="mt-8">
        <RequestForm uid={profile.id} initial={initial} migrated={migrated} />
      </div>
    </div>
  );
}
