import { AdminHomeView, type RestockRow } from "@/components/admin/admin-home";
import { LiveRefresh } from "@/components/admin/live-refresh";
import type { Readout } from "@/components/admin/readout-board";
import { firstName, requireStaff } from "@/lib/admin/session";

type VariantRow = RestockRow & {
  low_stock_threshold: number;
};

const TZ = "Asia/Manila";

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome() {
  const { supabase, profile } = await requireStaff();
  const now = new Date();

  const [productsRes, variantsRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("product_variants")
      .select("id, product_id, size, color, sku, stock_quantity, low_stock_threshold, product:products!inner(name)")
      .eq("is_active", true)
      .eq("products.is_active", true)
      .returns<VariantRow[]>(),
  ]);

  const loadFailed = Boolean(productsRes.error || variantsRes.error);
  const productCount = productsRes.count ?? 0;
  const variants = variantsRes.data ?? [];
  const out = variants.filter((v) => v.stock_quantity <= 0);
  const low = variants.filter((v) => v.stock_quantity > 0 && v.stock_quantity <= v.low_stock_threshold);
  const needsRestock = [...out, ...low.sort((a, b) => a.stock_quantity - b.stock_quantity)].slice(0, 8);

  const readouts: Readout[] = [
    { label: "Products", value: productCount, note: "Active in the catalog" },
    { label: "Variants", value: variants.length, note: "Sizes and colors on sale" },
    { label: "Low stock", value: low.length, note: "At or below their alert level", alert: low.length > 0 },
    { label: "Out of stock", value: out.length, note: "Sizes with none left", alert: out.length > 0 },
  ];

  const dateLine = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  }).format(now);

  return (
    <>
      <LiveRefresh />
      <AdminHomeView
      firstName={firstName(profile)}
      username={profile.username}
      role={profile.role}
      greeting={greeting(now)}
      dateLine={dateLine}
      loadFailed={loadFailed}
      readouts={readouts}
      productCount={productCount}
      needsRestock={needsRestock}
      attentionCount={out.length + low.length}
      />
    </>
  );
}
