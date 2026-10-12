"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { saveProduct } from "@/features/admin/products/actions";
import { SIZE_GROUPS, STANDARD_SIZES, UPCHARGE_SIZES } from "@/features/shared/catalog/sizes";
import { suggestSku } from "@/features/admin/products/sku";
import { formatPeso, sortSizes, unique, variantState, type CatalogProduct } from "@/features/shared/catalog/catalog";
import {
  LIMITS,
  formatMoneyInput,
  validateProduct,
  variantKey,
  type FieldErrors,
  type ProductInput,
} from "@/features/admin/products/validation";
import { ChipInput } from "./chip-input";
import { prepareForUpload } from "@/features/shared/photos/prepare-upload";
import { PhotoPicker, type PhotoItem } from "./photo-picker";

type Props = {
  /** The product being edited, or null to create one. */
  product: CatalogProduct | null;
  images: { id: string; url: string; is_primary: boolean }[];
  suggestions: { colors: string[]; tags: string[] };
  /** SKUs used by other products. */
  takenSkus: string[];
};

type Override = { sku?: string; price?: string; threshold?: string; opening?: string; active?: boolean };

const OVERRIDE_FIELD: Record<keyof Override, string> = {
  sku: "sku",
  price: "price",
  threshold: "low_stock_threshold",
  opening: "opening_stock",
  active: "is_active",
};

const parseMoney = (s: string) => {
  const t = s.replace(/[,₱\s]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
};
const parseWhole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);
const sentenceCase = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};
const fieldAttr = (key: string) => encodeURIComponent(key);

export function ProductForm({ product, images, suggestions, takenSkus }: Props) {
  const router = useRouter();
  const isNew = !product;

  const [id] = useState(() => product?.id ?? crypto.randomUUID());
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [basePrice, setBasePrice] = useState(product ? formatMoneyInput(product.base_price) : "");
  const [upcharge, setUpcharge] = useState("");
  const [threshold, setThreshold] = useState("5");
  const [tags, setTags] = useState(() => (product?.tags ?? []).filter((t) => t.toLowerCase() !== "sample"));
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    images.map((i) => ({ key: i.id, id: i.id, url: i.url, is_primary: i.is_primary })),
  );
  // Every photo URL this form has shown; the server only removes saved photos from this set.
  const [knownImageUrls, setKnownImageUrls] = useState<string[]>(() => images.map((i) => i.url));

  const existing = useMemo(
    () => new Map((product?.variants ?? []).map((v) => [variantKey({ color: v.color ?? "", size: v.size ?? "" }), v])),
    [product],
  );
  const live = (product?.variants ?? []).filter((v) => v.is_active);
  const [sizes, setSizes] = useState<string[]>(() => unique(live.map((v) => v.size)));
  const [colors, setColors] = useState<string[]>(() => unique(live.map((v) => v.color)));
  const [overrides, setOverrides] = useState<Record<string, Override>>(() => {
    const gaps: Record<string, Override> = {};
    for (const c of unique(live.map((v) => v.color)))
      for (const sz of unique(live.map((v) => v.size))) {
        const key = variantKey({ color: c, size: sz });
        if (!(product?.variants ?? []).some((v) => variantKey({ color: v.color ?? "", size: v.size ?? "" }) === key))
          gaps[key] = { active: false };
      }
    return gaps;
  });

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = (...fields: string[]) => {
    setDirty(true);
    if (!fields.length) return;
    setErrors((prev) => {
      if (!fields.some((f) => prev[f])) return prev;
      const next = { ...prev };
      for (const f of fields) delete next[f];
      if (Object.keys(next).length === 0) setFormError("");
      return next;
    });
  };
  const setOverride = (key: string, patch: Override) => {
    setOverrides((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
    touch(...Object.keys(patch).map((k) => `variants.${key}.${OVERRIDE_FIELD[k as keyof Override]}`));
  };

  // Sizes already used by this product that aren't on the standard list stay pickable.
  const extraSizes = unique((product?.variants ?? []).map((v) => v.size)).filter((s) => !STANDARD_SIZES.includes(s));
  const groups = extraSizes.length ? [...SIZE_GROUPS, { id: "other", label: "Other", sizes: extraSizes }] : SIZE_GROUPS;

  const base = parseMoney(basePrice);
  const extra = upcharge.trim() ? parseMoney(upcharge) : 0;
  const anyUpcharge = sizes.some((s) => UPCHARGE_SIZES.has(s));

  const rows = colors.flatMap((color) =>
    sortSizes(sizes).map((size) => {
      const key = variantKey({ color, size });
      const ex = existing.get(key);
      const ov = overrides[key] ?? {};
      const auto = base + (UPCHARGE_SIZES.has(size) ? extra : 0);
      return {
        key,
        color,
        size,
        id: ex?.id,
        stock: ex?.stock_quantity,
        state: ex ? variantState(ex) : undefined,
        sku: ov.sku ?? ex?.sku ?? suggestSku(name.trim() || "Product", color, size),
        price: ov.price ?? (ex ? formatMoneyInput(ex.price) : formatMoneyInput(auto)),
        threshold: ov.threshold ?? (ex ? String(ex.low_stock_threshold) : threshold),
        opening: ov.opening ?? "0",
        active: ov.active ?? ex?.is_active ?? true,
      };
    }),
  );
  const outOfGrid = (v: { size: string | null; color: string | null }) =>
    !(sizes.includes(v.size ?? "") && colors.includes(v.color ?? ""));
  const hiding = [...existing.values()].filter((v) => v.is_active && outOfGrid(v));
  const willHide = hiding.length;
  const hidingStock = hiding.reduce((sum, v) => sum + v.stock_quantity, 0);
  // SKUs kept by this product's hidden sizes/colors can't be reused by another of its variants.
  const heldSkus = new Map(
    [...existing.values()].filter((v) => v.sku && outOfGrid(v)).map((v) => [v.sku!, `${v.color} ${v.size}`]),
  );

  // Bringing back a size/color that was hidden makes it visible again.
  const reactivate = (nextSizes: string[], nextColors: string[]) => {
    const patch: Record<string, Override> = {};
    for (const c of nextColors)
      for (const s of nextSizes) {
        const key = variantKey({ color: c, size: s });
        const ex = existing.get(key);
        const wasInGrid = sizes.includes(s) && colors.includes(c);
        if (ex && !ex.is_active && !wasInGrid) patch[key] = { ...overrides[key], active: true };
      }
    if (Object.keys(patch).length) setOverrides((o) => ({ ...o, ...patch }));
  };

  const toggleSize = (size: string) => {
    const next = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size];
    reactivate(next, colors);
    setSizes(next);
    touch("variants");
  };

  const changeColors = (next: string[]) => {
    reactivate(sizes, next);
    setColors(next);
    touch("variants");
  };

  const saved = rows.filter((r) => r.id || r.active);

  const buildInput = (current: PhotoItem[], seenUrls: string[] = knownImageUrls): ProductInput => ({
    id,
    name,
    description,
    base_price: base,
    tags,
    images: current.map((p) => ({ id: p.id, url: p.url, is_primary: p.is_primary })),
    known_image_urls: seenUrls,
    variants: saved.map((r) => ({
      id: r.id,
      size: r.size,
      color: r.color,
      sku: r.sku.trim().toUpperCase(),
      price: parseMoney(r.price),
      low_stock_threshold: parseWhole(r.threshold),
      opening_stock: r.id ? 0 : parseWhole(r.opening),
      is_active: r.active,
    })),
  });

  const focusFirst = (found: FieldErrors) => {
    const order = ["name", "description", "tags", "images", "sizes", "variants", "base_price"];
    const first = Object.keys(found).sort((a, b) => {
      const ia = order.indexOf(a.split(".")[0]);
      const ib = order.indexOf(b.split(".")[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })[0];
    if (!first) return;
    const el = document.querySelector<HTMLElement>(`[data-field="${fieldAttr(first)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status) return;
    setFormError("");

    const found = validateProduct(buildInput(photos));
    const taken = new Set(takenSkus);
    for (const r of saved) {
      const k = `variants.${r.key}.sku`;
      const sku = r.sku.trim().toUpperCase();
      const holder = heldSkus.get(sku);
      if (found[k]) continue;
      if (taken.has(sku)) found[k] = "Another product already uses this SKU.";
      else if (holder && holder !== `${r.color} ${r.size}`) found[k] = `${holder} of this product (hidden) still uses this SKU. Use a different one.`;
    }
    if (sizes.length === 0 && colors.length === 0) found.variants = "Pick at least one size and add one color.";
    else if (sizes.length === 0) found.variants = "Pick at least one size.";
    else if (colors.length === 0) found.variants = "Add at least one color.";
    else if (saved.length === 0) found.variants = "Turn on “Visible” for at least one size and color.";
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError("Some fields need a look before saving.");
      focusFirst(found);
      return;
    }

    let current = photos;
    const pending = photos.filter((p) => p.file);
    if (pending.length) {
      const storage = createClient().storage.from("product-images");
      for (const [i, p] of pending.entries()) {
        setStatus(`Uploading photos (${i + 1} of ${pending.length})…`);
        try {
          const { blob, ext, type } = await prepareForUpload(p.file!);
          const path = `${id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await storage.upload(path, blob, { contentType: type, upsert: false });
          if (error) {
            const denied = /row-level security|unauthorized|403/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ""}`);
            throw new Error(
              denied
                ? "Your account can’t upload photos. Log in again as staff, then save."
                : "A photo didn’t upload. Check your connection and save again.",
            );
          }
          const url = storage.getPublicUrl(path).data.publicUrl;
          URL.revokeObjectURL(p.url);
          current = current.map((x) => (x.key === p.key ? { ...x, url, file: undefined } : x));
          setPhotos(current);
          setKnownImageUrls((urls) => [...urls, url]);
        } catch (err) {
          setStatus(null);
          setFormError(err instanceof Error ? err.message : "A photo didn’t upload. Try again.");
          return;
        }
      }
    }

    setStatus("Saving…");
    const seen = [...new Set([...knownImageUrls, ...current.map((p) => p.url).filter((u) => !u.startsWith("blob:"))])];
    const result = await saveProduct(buildInput(current, seen), isNew ? "create" : "update");
    if (!result.ok) {
      setStatus(null);
      setErrors(result.fieldErrors ?? {});
      setFormError(result.message);
      if (result.fieldErrors) focusFirst(result.fieldErrors);
      return;
    }
    setDirty(false);
    router.push(`/admin/products/${id}?saved=1`);
    router.refresh();
  };

  const err = (key: string) => errors[key];
  const backHref = isNew ? "/admin/products" : `/admin/products/${id}`;

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-[80rem] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-10">
      <Link
        href={backHref}
        className="press -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[0.9375rem] font-medium text-ink-2 hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {isNew ? "Products" : product.name}
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="voice-display text-[clamp(2.25rem,5vw,3.5rem)]">{isNew ? "New product" : "Edit product"}</h1>
        <FormActions status={status} cancelHref={backHref} label={isNew ? "Create product" : "Save changes"} />
      </header>

      {formError && (
        <p role="alert" className="auth-alert mt-6 rounded-xl px-4 py-3 text-[0.9375rem]">
          {formError}
        </p>
      )}

      <Section title="Details">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="Name" id="p-name" error={err("name")}>
            <input
              id="p-name"
              data-field={fieldAttr("name")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                touch("name");
              }}
              maxLength={LIMITS.name}
              placeholder="e.g. Reversible Liga Jersey"
              aria-invalid={!!err("name") || undefined}
              aria-describedby="p-name-msg"
              className={`auth-input px-4 ${err("name") ? "is-invalid" : ""}`}
            />
          </Field>
          <Field
            label="Tags"
            id="p-tags"
            error={err("tags")}
            hint="Words staff and customers search for, like basketball or jersey. Press Enter after each."
          >
            <ChipInput
              id="p-tags"
              values={tags}
              onChange={(next) => {
                setTags(next.map((t) => t.toLowerCase()));
                touch("tags");
              }}
              suggestions={suggestions.tags}
              placeholder="Add a tag"
              format={(s) => s.trim().toLowerCase()}
              max={LIMITS.tags}
              invalid={!!err("tags")}
              describedBy="p-tags-msg"
              removeLabel={(t) => `Remove tag ${t}`}
            />
          </Field>
          <div className="lg:col-span-2">
            <Field label="Description" id="p-desc" error={err("description")} optional>
              <textarea
                id="p-desc"
                data-field={fieldAttr("description")}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  touch("description");
                }}
                rows={3}
                maxLength={LIMITS.description}
                placeholder="Fabric, fit, and what it’s for."
                aria-describedby="p-desc-msg"
                className="auth-input auth-input-grow min-h-24 resize-y px-4 py-3 leading-relaxed"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Photos">
        <div data-field={fieldAttr("images")} tabIndex={-1} className="outline-none">
          <PhotoPicker
            photos={photos}
            errorId="p-photos-msg"
            error={err("images")}
            onAdd={(files) => {
              setPhotos((ps) => {
                const added = files.map((file, i) => ({
                  key: `new-${crypto.randomUUID()}`,
                  url: URL.createObjectURL(file),
                  file,
                  is_primary: ps.length === 0 && i === 0,
                }));
                return [...ps, ...added].slice(0, LIMITS.images);
              });
              touch("images");
            }}
            onRemove={(key) => {
              const gone = photos.find((p) => p.key === key);
              if (!gone) return;
              if (gone.file) URL.revokeObjectURL(gone.url);
              const rest = photos.filter((p) => p.key !== key);
              if (gone.is_primary && rest.length) rest[0] = { ...rest[0], is_primary: true };
              setPhotos(rest);
              touch("images");
            }}
            onMakeMain={(key) => {
              setPhotos((ps) => ps.map((p) => ({ ...p, is_primary: p.key === key })));
              touch("images");
            }}
          />
        </div>
      </Section>

      <Section title="Sizes and colors">
        <fieldset data-field={fieldAttr("variants")} tabIndex={-1} className="outline-none">
          <legend className="mb-3 text-[0.9375rem] font-semibold text-ink">Sizes</legend>
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                <p className="voice-label w-28 shrink-0 pt-2 text-[0.8125rem] text-ink-2">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.sizes.map((s) => {
                    const on = sizes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleSize(s)}
                        className={`press h-9 min-w-11 rounded-full px-3 text-[0.875rem] font-semibold ${
                          on ? "bg-ink text-ground" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-ink"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 max-w-[40rem]">
          <Field label="Colors" id="p-colors" hint="Type a color and press Enter. Colors already in the catalog are suggested.">
            <ChipInput
              id="p-colors"
              values={colors}
              onChange={changeColors}
              suggestions={suggestions.colors}
              placeholder="Add a color"
              format={sentenceCase}
              removeLabel={(c) => `Remove color ${c}`}
            />
          </Field>
        </div>
        {err("variants") && (
          <p className="mt-3 flex gap-2 text-[0.875rem] font-semibold leading-snug text-ink">
            <span aria-hidden="true" className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-amber" />
            {err("variants")}
          </p>
        )}

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Field label="Base price" id="p-price" error={err("base_price")}>
            <MoneyInput
              id="p-price"
              field="base_price"
              value={basePrice}
              invalid={!!err("base_price")}
              onChange={(v) => {
                setBasePrice(v);
                touch("base_price");
              }}
            />
          </Field>
          <Field
            label="Extra for 2XL and up"
            id="p-upcharge"
            optional
            hint={anyUpcharge ? "Added to the base price for 2XL, 3XL, 4XL, 5XL, and W-2XL." : "Applies once you pick 2XL or larger."}
          >
            <MoneyInput
              id="p-upcharge"
              value={upcharge}
              placeholder="0"
              onChange={(v) => {
                setUpcharge(v);
                touch();
              }}
            />
          </Field>
          <Field label="Low-stock alert at" id="p-threshold" hint="Staff are alerted when a size and color drops to this many.">
            <input
              id="p-threshold"
              inputMode="numeric"
              value={threshold}
              onChange={(e) => {
                setThreshold(e.target.value.replace(/[^\d]/g, ""));
                touch();
              }}
              aria-describedby="p-threshold-msg"
              className="auth-input tabular px-4"
            />
          </Field>
        </div>
      </Section>

      <Section title={isNew ? "Opening stock" : "Stock"}>
        {rows.length === 0 ? (
          <p className="text-[0.9375rem] text-ink-2">Pick sizes and add colors above to set up stock.</p>
        ) : (
          <>
            <p className="mb-5 max-w-[60ch] text-[0.9375rem] text-ink-2">
              {isNew
                ? "How many of each are on the shelf right now. This is logged as the opening stock."
                : "Change existing stock with Adjust stock on the product page or in Stock, so every change is logged. New sizes and colors start with the opening stock you enter."}
            </p>
            <div className="flex flex-col gap-6">
              {colors.map((color) => (
                <div key={color}>
                  <p className="mb-2 text-[0.9375rem] font-semibold text-ink">{color}</p>
                  <ul className="flex flex-wrap gap-2">
                    {rows
                      .filter((r) => r.color === color)
                      .map((r) => (
                        <li key={r.key} className="flex w-[4.5rem] flex-col items-center gap-1">
                          <label htmlFor={`open-${fieldAttr(r.key)}`} className="voice-label text-[0.75rem] text-ink-2">
                            {r.size}
                          </label>
                          {r.id ? (
                            <span
                              id={`open-${fieldAttr(r.key)}`}
                              data-stock={r.state}
                              className="cell voice-board tabular grid h-11 w-full place-items-center rounded-lg text-[1.25rem]"
                              title="Current stock"
                            >
                              {r.stock}
                            </span>
                          ) : (
                            <input
                              id={`open-${fieldAttr(r.key)}`}
                              data-field={fieldAttr(`variants.${r.key}.opening_stock`)}
                              inputMode="numeric"
                              value={r.opening}
                              onChange={(e) => {
                                const opening = e.target.value.replace(/[^\d]/g, "");
                                // Stock typed into a hidden new size/color means it's meant to be sold.
                                setOverride(r.key, Number(opening) > 0 && !r.active ? { opening, active: true } : { opening });
                              }}
                              onFocus={(e) => e.target.select()}
                              aria-label={`Opening stock, ${color} ${r.size}`}
                              aria-invalid={!!err(`variants.${r.key}.opening_stock`) || undefined}
                              className={`auth-input voice-board tabular h-11 px-0 text-center text-[1.25rem] ${
                                err(`variants.${r.key}.opening_stock`) ? "is-invalid" : ""
                              }`}
                            />
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {rows.length > 0 && (
        <Section title="Variant details">
          <p className="mb-4 max-w-[62ch] text-[0.9375rem] text-ink-2">
            SKUs and prices fill in for you; change any of them. Turn off “Visible” to hide one size and color from the shop.
          </p>
          {willHide > 0 && (
            <p className="mb-4 rounded-xl bg-ground-2 px-4 py-3 text-[0.9375rem] text-ink shadow-[inset_0_0_0_1px_var(--line)]">
              {willHide} {willHide === 1 ? "size and color" : "sizes and colors"} you removed
              {hidingStock > 0 ? `, holding ${hidingStock} in stock,` : ""} will be hidden from the shop. They aren’t deleted, and
              their stock history stays.
            </p>
          )}
          <div className="hidden grid-cols-[minmax(0,9rem)_minmax(0,1fr)_9rem_7rem_5rem] gap-3 border-b border-line pb-2 text-[0.8125rem] text-ink-2 md:grid">
            {["Variant", "SKU", "Price", "Alert at", "Visible"].map((h) => (
              <span key={h} className="voice-label font-semibold">
                {h}
              </span>
            ))}
          </div>
          <ul>
            {rows.map((r) => {
              const skuErr = err(`variants.${r.key}.sku`);
              const priceErr = err(`variants.${r.key}.price`);
              const thrErr = err(`variants.${r.key}.low_stock_threshold`);
              return (
                <li
                  key={r.key}
                  className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-line py-3 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_9rem_7rem_5rem] md:items-start"
                >
                  <p className="col-span-2 pt-0 text-[0.9375rem] font-semibold text-ink md:col-span-1 md:pt-2.5">
                    {r.color} · {r.size}
                    {r.id && <span className="block text-[0.8125rem] font-normal text-ink-2 md:mt-0.5">{r.stock} in stock</span>}
                  </p>
                  <div className="col-span-2 md:col-span-1">
                    <label className="mb-1 block text-[0.75rem] text-ink-2 md:sr-only" htmlFor={`sku-${fieldAttr(r.key)}`}>
                      SKU
                    </label>
                    <input
                      id={`sku-${fieldAttr(r.key)}`}
                      data-field={fieldAttr(`variants.${r.key}.sku`)}
                      value={r.sku}
                      onChange={(e) => setOverride(r.key, { sku: e.target.value.toUpperCase().replace(/\s+/g, "-") })}
                      maxLength={LIMITS.sku}
                      spellCheck={false}
                      autoCapitalize="characters"
                      aria-invalid={!!skuErr || undefined}
                      className={`auth-input tabular h-11 px-3 text-[0.9375rem] ${skuErr ? "is-invalid" : ""}`}
                    />
                    {skuErr && <p className="mt-1 text-[0.8125rem] font-semibold text-ink">{skuErr}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.75rem] text-ink-2 md:sr-only" htmlFor={`price-${fieldAttr(r.key)}`}>
                      Price
                    </label>
                    <MoneyInput
                      id={`price-${fieldAttr(r.key)}`}
                      field={`variants.${r.key}.price`}
                      value={r.price}
                      compact
                      invalid={!!priceErr}
                      onChange={(v) => setOverride(r.key, { price: v })}
                    />
                    {priceErr && <p className="mt-1 text-[0.8125rem] font-semibold text-ink">{priceErr}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-[0.75rem] text-ink-2 md:sr-only" htmlFor={`thr-${fieldAttr(r.key)}`}>
                      Alert at
                    </label>
                    <input
                      id={`thr-${fieldAttr(r.key)}`}
                      data-field={fieldAttr(`variants.${r.key}.low_stock_threshold`)}
                      inputMode="numeric"
                      value={r.threshold}
                      onChange={(e) => setOverride(r.key, { threshold: e.target.value.replace(/[^\d]/g, "") })}
                      aria-invalid={!!thrErr || undefined}
                      className={`auth-input tabular h-11 px-3 text-[0.9375rem] ${thrErr ? "is-invalid" : ""}`}
                    />
                  </div>
                  <label className="col-span-2 flex items-center gap-2.5 text-[0.9375rem] text-ink md:col-span-1 md:h-11">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={(e) => setOverride(r.key, { active: e.target.checked })}
                      className="size-5 accent-[var(--ink)]"
                    />
                    <span className="md:sr-only">Visible in the shop</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {Number.isFinite(base) && (
            <p className="mt-4 text-[0.875rem] text-ink-2">
              New variants start at {formatPeso(base)}
              {anyUpcharge && extra > 0 ? `, or ${formatPeso(base + extra)} for 2XL and up` : ""}.
            </p>
          )}
        </Section>
      )}

      <div className="mt-10 flex justify-end border-t border-line pt-6">
        <FormActions status={status} cancelHref={backHref} label={isNew ? "Create product" : "Save changes"} />
      </div>
    </form>
  );
}

function FormActions({ status, cancelHref, label }: { status: string | null; cancelHref: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={cancelHref}
        className="press inline-flex h-11 items-center rounded-xl px-4 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2"
      >
        Cancel
      </Link>
      <button
        type="submit"
        disabled={!!status}
        className="press inline-flex h-11 items-center gap-2 rounded-xl bg-board px-5 text-[0.9375rem] font-semibold text-board-ink hover:bg-board-deep disabled:cursor-progress disabled:opacity-85"
      >
        {status && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
        <span aria-live="polite">{status ?? label}</span>
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="voice-display mb-5 border-b border-line pb-3 text-[1.625rem]">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  optional,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[0.9375rem] font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-2">(optional)</span>}
      </label>
      {children}
      {(error || hint) && (
        <p id={`${id}-msg`} className={`mt-2 flex gap-2 text-[0.875rem] leading-snug ${error ? "font-semibold text-ink" : "text-ink-2"}`}>
          {error && <span aria-hidden="true" className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-amber" />}
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function MoneyInput({
  id,
  field,
  value,
  onChange,
  invalid,
  placeholder = "0",
  compact,
}: {
  id: string;
  field?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  return (
    <div className={`auth-input flex items-center ${compact ? "h-11" : ""} ${invalid ? "is-invalid" : ""}`}>
      <span aria-hidden="true" className={`${compact ? "pl-3" : "pl-4"} text-ink-2`}>
        ₱
      </span>
      <input
        id={id}
        data-field={field ? fieldAttr(field) : undefined}
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        onBlur={(e) => {
          const n = parseMoney(e.target.value);
          if (Number.isFinite(n)) onChange(formatMoneyInput(n));
        }}
        aria-invalid={invalid || undefined}
        className={`tabular h-full min-w-0 flex-1 bg-transparent pl-1 ${compact ? "pr-3 text-[0.9375rem]" : "pr-4"} outline-none placeholder:text-ink-2`}
      />
    </div>
  );
}
