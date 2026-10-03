// TEMPORARY visual-check route. Delete before committing.
import { AdminDock } from "@/components/admin/admin-dock";
import { AdminHomeView } from "@/components/admin/admin-home";
import { AdminTopBar } from "@/components/admin/admin-top-bar";

export default async function Preview({ searchParams }: PageProps<"/zz-preview-admin">) {
  const q = await searchParams;
  const empty = q.empty === "1";
  const role = q.role === "staff" ? "staff" : "owner";
  const rows = [
    { id: "1", size: "L", color: "Black", sku: "JRS-LIGA-BLK-L", stock_quantity: 0, product: { name: "Reversible Liga Jersey" } },
    { id: "2", size: "S", color: "Charcoal", sku: "JKT-WRM-CHR-S", stock_quantity: 0, product: { name: "Warmer Jacket" } },
    { id: "3", size: "XL", color: "Charcoal", sku: "JKT-WRM-CHR-XL", stock_quantity: 2, product: { name: "Warmer Jacket" } },
    { id: "4", size: "L", color: "Black", sku: "SHR-BB-BLK-L", stock_quantity: 3, product: { name: "Basketball Shorts" } },
    { id: "5", size: "XL", color: "Court green", sku: "TEE-DF-GRN-XL", stock_quantity: 4, product: { name: "Dri-fit Practice Tee" } },
  ];
  return (
    <>
      <AdminTopBar username="ruwins" fullName="Roince R. Jumao-as" role={role} />
      <main className="flex-1 pb-36 sm:pb-40">
        <AdminHomeView
          firstName="Roince"
          username="ruwins"
          role={role}
          greeting="Good morning"
          dateLine="Sunday, October 4"
          loadFailed={false}
          readouts={[
            { label: "Products", value: empty ? 0 : 12, note: "Active in the catalog" },
            { label: "Variants", value: empty ? 0 : 96, note: "Sizes and colors on sale" },
            { label: "Low stock", value: empty ? 0 : 3, note: "At or below their alert level", alert: !empty },
            { label: "Out of stock", value: empty ? 0 : 2, note: "Sizes with none left", alert: !empty },
          ]}
          productCount={empty ? 0 : 12}
          needsRestock={empty ? [] : rows}
          attentionCount={empty ? 0 : 5}
        />
      </main>
      <AdminDock role={role} />
    </>
  );
}
