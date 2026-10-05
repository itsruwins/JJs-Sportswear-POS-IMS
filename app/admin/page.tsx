import { AdminHomeView, type RestockRow } from "@/components/admin/admin-home";
import { LiveRefresh } from "@/components/admin/live-refresh";
import type { Readout } from "@/components/admin/readout-board";
import { fetchRecentMoves } from "@/lib/admin/catalog";
import { historyBounds, manilaToday, shiftDate } from "@/lib/admin/history";
import { fetchMovements, fetchStockRows, needsRestock, stockSummary } from "@/lib/admin/inventory";
import { firstName, requireOwner } from "@/lib/admin/session";

const TZ = "Asia/Manila";

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-PH", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome() {
  const { supabase, profile } = await requireOwner();
  const now = new Date();
  const today = manilaToday(now);
  const week = historyBounds({ from: shiftDate(today, -6), to: today });

  const [productsRes, stock, weekRes, recentRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
    fetchStockRows(supabase),
    fetchMovements(supabase, week.fromIso, week.toIso),
    fetchRecentMoves(supabase, 5),
  ]);

  const loadFailed = Boolean(productsRes.error || stock.error);
  const productCount = productsRes.count ?? 0;
  const summary = stockSummary(stock.rows);
  const restock = needsRestock(stock.rows);
  const isOwner = profile.role === "owner";

  const readouts: Readout[] = [
    { label: "Products", value: productCount, note: "Active in the catalog" },
    { label: "Variants", value: summary.variants, note: "Sizes and colors on sale" },
    { label: "Low stock", value: summary.low, note: "At or below their alert level", alert: summary.low > 0 },
    { label: "Out of stock", value: summary.out, note: "Sizes with none left", alert: summary.out > 0 },
  ];

  const restockRows: RestockRow[] = restock.slice(0, 8).map((r) => ({
    id: r.id,
    product_id: r.productId,
    size: r.size,
    color: r.color,
    sku: r.sku,
    stock_quantity: r.stock,
    product: { name: r.productName },
  }));

  const stockLine = {
    pieces: summary.pieces,
    // Peso values are for the owner only.
    value: isOwner ? summary.value : null,
    weekIn: weekRes.error ? null : weekRes.total.piecesIn,
    weekOut: weekRes.error ? null : weekRes.total.piecesOut,
  };

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
        needsRestock={restockRows}
        attentionCount={restock.length}
        stockLine={stockLine}
        recentMoves={recentRes.error ? null : recentRes.moves}
      />
    </>
  );
}
