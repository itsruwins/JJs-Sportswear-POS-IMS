@AGENTS.md

# Folder structure

One folder per feature. Full map and history: `docs/structure-plan.md`.

```
app/                     routes only: page, layout, route, not-found
features/admin/<x>/      admin-only features (shell/ = dock, top bar, nav, session)
features/customer/<x>/   customer-only features (shell/ = same for the customer side)
features/landing/        the public home page
features/shared/         used by more than one side: ui/, auth/, catalog/, chat/, orders/, photos/
lib/                     app-wide plumbing: supabase/, theme.ts, paths.ts, shop.ts
```

Rules:

1. `app/` only holds Next route files. They import from `features/` and render. Server actions live in the feature folder, not in `app/`.
2. `features/admin` and `features/customer` never import each other. Anything both need goes in `features/shared` (or `lib` if it's plumbing). `features/shared` never imports from a side.
3. Features on the same side may import each other (admin orders ↔ payments is fine).
4. Use `@/` imports. `./` only for a file in the same folder.
5. File roles in a feature folder:
   - `components/` — React components only, named with the feature prefix (`order-view.tsx`); a feature's small building blocks go in `<feature>-parts.tsx`
   - `actions.ts` — server actions (`"use server"`)
   - `data.ts` — Supabase reads and the types they return
   - `model.ts` — pure types, constants, and rules (no database)
   - `validation.ts` — form input checks
   - any other `.ts` — one clear job, named for it (`sku.ts`, `csv.ts`, `flux.ts`)
