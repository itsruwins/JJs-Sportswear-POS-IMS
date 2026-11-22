# Name fields plan

One phase per session. Each phase ends finished and tested, and the next one starts only after you approve it. Every phase opens with its own questions.

Goal: wherever a person's name is typed, the single "Full name" box becomes First, Middle, Last, and Suffix. The database stores the parts. Screens that only show a name keep showing one combined name, so the ~30 places that read `full_name` (receipts, orders, chat, payments, reports, staff list) don't change.

## Decisions (2026-11-22)

- **Where the name is typed:** everywhere a name is entered. That means three forms:
  1. Sign-up (`features/shared/auth/components/auth-dialog.tsx`)
  2. The customer's Account page (`features/customer/account/`)
  3. The walk-in buyer form in the admin's counter design orders (`features/admin/design-orders/components/design-order-screen.tsx`). When a ticket is loaded, it is filled in from the customer's account.
- **Required:** First and Last are required. Middle and Suffix are optional.
- **Display:** the middle name is shortened to an initial and the suffix goes at the end, e.g. `Juan D. Dela Cruz Jr.`. Suffix choices: Jr., Sr., II, III, IV, V.
- **Old data:** existing names are split as well as possible. A trailing suffix (Jr., III, ...) comes off. The last word becomes Last, plus any surname particles right before it (de, del, dela, la, los, delos, san, sta., sto., ...). Everything before that becomes First, so two-word first names like "John Paul" stay together. Middle is left blank. Customers can fix their name on the Account page. *(Changed 2026-11-23 from "first word is First".)*
- **Capitalization (2026-11-23):** every word of every part is title-cased, particles too: "dela cruz" becomes "Dela Cruz", "o'brien" becomes "O'Brien", and "McArthur" becomes "Mcarthur". The database applies this on every write.
- **Characters (2026-11-23):** letters (accented ones too, like ñ and é), spaces, periods, apostrophes, and hyphens, at most 50 per part. The forms and `create_counter_order` refuse anything else. Profiles aren't checked in the database, because some old names might not pass.
- **`full_name` stays:** it is no longer typed directly. A trigger rebuilds it from the parts, so every existing reader and SQL function keeps working unchanged. An older client that still writes `full_name` keeps working, because the trigger splits what it wrote. That means the migration can run before N2 and N3 ship.

## Phases

### Phase N1: Database
- A new migration (applied migrations are never edited):
  - `profiles` gets `first_name`, `middle_name`, `last_name`, `suffix`, with length limits and the suffix limited to the allowed list.
  - Existing rows are split as described above.
  - A trigger rebuilds `full_name` as `First M. Last Suffix` whenever a part changes.
  - `handle_new_user` reads the parts from the sign-up metadata. If a sign-up only sends the old `full_name`, it is split the same way as old rows.
  - The column grants let a user update their own name parts.
  - `custom_orders` gets the same four parts for walk-in buyers. `create_counter_order` accepts them in `p_buyer` and builds `walk_in_name` from them. Its parameters don't change. An old `name` key is still accepted.
- A shared `features/shared/names/` folder: `model.ts` (the parts type, the suffix list, `formatName`, and `splitName` with the same particle rules as the SQL) and `validation.ts`.
- **Done when:** the migration is tested in PGlite against every migration in order: the split works on sample Filipino names, `full_name` follows edits, sign-up works with both the new parts and the old `full_name`, and walk-in orders store and show the combined name.
- **Built 2026-11-23 (uncommitted):**
  - Migration `20261030000000_name_parts.sql`:
    - Helpers in `private`: `clean_name_part` (initcap, trims and collapses spaces, straightens ’), `clean_name_suffix`, `name_part_ok`, `format_person_name`, and `split_person_name`.
    - `profiles` gets `first_name`, `middle_name`, `last_name`, and `suffix`, with a check for 50-character parts and the suffix list.
    - Trigger `profiles_name_parts` (security definer) tidies the parts and rebuilds `full_name`. If only `full_name` changed, it splits it instead.
    - A one-time split of old names, with `updated_at` left untouched; all-space names become null.
    - `handle_new_user` reads `first_name`, `middle_name`, `last_name`, and `suffix` from the sign-up data. Users get a column grant to update their own parts.
    - `custom_orders` gets the same four parts with a `walk_in_` prefix, plus trigger `custom_orders_walk_in_name` and the same backfill.
    - `create_counter_order` is recreated with the same arguments. `p_buyer` takes `first_name`, `middle_name`, `last_name`, and `suffix`, with refusals for `order:first_name`, `order:middle_name`, `order:last_name`, and `order:suffix`. The old `name` key still works.
  - `features/shared/names/model.ts` (`NameParts`, `SUFFIXES`, `cleanNamePart`, `toSuffix`, `formatName`, `splitName`, `nameFromRow`, `nameToRow`) and `validation.ts` (`checkName(parts, whose)`).
  - Tested in PGlite against all 35 migrations with Supabase's default grants: 92 checks.
    - The split of 10 sample old names, and `updated_at` kept.
    - The migration run twice.
    - Sign-up with parts, with only `full_name`, with no name, and with a bad suffix.
    - A customer editing their parts, an old client writing `full_name`, unrelated edits, someone else's row, and a bad suffix.
    - Counter orders with parts, without the optional parts, and with the old `name` key; 9 refusals; and a retry with the same key.
    - The TypeScript and SQL versions of the split, the combined name, and the allowed characters agree on 20 names and 13 character cases.
- **Left for N2/N3:** the forms still send one name. Once both phases ship, revoking the `full_name` update grant could be a later follow-up.

### Phase N2: Sign-up and Account page (customer)
- Sign-up: First and Last side by side, then Middle and Suffix, with the same field style and error messages as the rest of the form.
- Account page: the same four fields, saved through the account action. The header shows the combined name.
- The customer top bar and the admin's `firstName()` greeting read `first_name`.
- **Done when:** a new customer signs up with the parts, the combined name shows on their account and in admin screens, and editing the parts updates it everywhere.

### Phase N3: Walk-in buyer (admin)
- The counter design order's Buyer step gets the four fields. A loaded ticket fills them in from the customer's parts.
- The draft saved in the tab keeps the parts, and an older saved draft with only `name` still loads.
- **Done when:** a walk-in order is made with the parts, and the order slip, order view, and payments show `Juan D. dela Cruz Jr.`.
