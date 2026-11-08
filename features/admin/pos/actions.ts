"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { requireStaff } from "@/features/admin/shell/session";
import { usernameToEmail } from "@/features/shared/auth/credentials";
import { fetchProviders } from "@/features/shared/payments/data";
import { cleanReference, GCASH } from "@/features/shared/payments/model";
import { geminiConfigured, GeminiError, readReceiptImage } from "@/features/admin/pos/gemini";
import { checkReading, type ScanFailure, type ScanResult } from "@/features/admin/pos/scan";
import { normalizeTicketCode, ticketState, ticketTime, type TicketStatus } from "@/features/shared/tickets/model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The sale function with payment parts arrives with this update (after 20261016000000_e_payment_methods.sql).
const MIGRATION = "supabase/migrations/20261016120000_e_payments.sql";
// Charging a customer's counter ticket arrives with this update.
const TICKET_SALES_MIGRATION = "supabase/migrations/20261025000000_ticket_sales.sql";

export type CartItem = { variantId: string; quantity: number };

/** One part of the payment: cash, or an e-payment through a provider with its reference number. */
export type PaymentPart =
  | { method: "cash"; amount: number }
  | {
      method: "e_payment";
      provider: string;
      reference: string;
      amount: number;
      /** The receipt scan it was read from (receipt_scans), when it was scanned. */
      scanId?: string | null;
      /** The owner's approval for an amount different from the receipt. */
      overrideId?: string | null;
    };

/** A refused item points back to its cart line, so the cart can offer the fix. */
export type LineProblem = { variantId?: string; sku?: string; kind: "short"; available: number } | { variantId?: string; sku?: string; kind: "unavailable" };

export type SaleResult =
  | { ok: true; id: string }
  | {
      ok: false;
      message: string;
      problem?: LineProblem;
      /** The ticket can't be charged anymore (paid, expired, cancelled): sell without it or ask the customer. */
      ticketClosed?: boolean;
    };
export type VoidResult = { ok: true } | { ok: false; message: string };

const amountOk = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 10_000_000;

/**
 * Records a counter sale through create_pos_sale; prices, stock, and references are checked by the
 * database. With a ticket, create_ticket_sale charges it in the same step and marks it paid.
 */
export async function createSale(
  items: CartItem[],
  payments: PaymentPart[],
  /** One key per sale from the register; a retried Charge with the same key returns the same sale. */
  requestId: string,
  /** The customer's counter ticket this sale pays, if it came from one. */
  ticketId: string | null = null,
): Promise<SaleResult> {
  const { supabase } = await requireStaff();

  // Server actions take whatever a POST sends, so the shape is checked here too.
  const valid =
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= 200 &&
    items.every((i) => i && typeof i.variantId === "string" && UUID.test(i.variantId) && Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 9999) &&
    Array.isArray(payments) &&
    payments.length > 0 &&
    payments.length <= 50 &&
    payments.every(
      (p) =>
        p &&
        amountOk(p.amount) &&
        (p.method === "cash" ||
          (p.method === "e_payment" &&
            typeof p.provider === "string" &&
            /^[a-z][a-z0-9_]{1,31}$/.test(p.provider) &&
            typeof p.reference === "string" &&
            p.reference.length <= 80 &&
            (p.scanId == null || (typeof p.scanId === "string" && UUID.test(p.scanId))) &&
            (p.overrideId == null || (typeof p.overrideId === "string" && UUID.test(p.overrideId))))),
    ) &&
    typeof requestId === "string" &&
    UUID.test(requestId) &&
    (ticketId === null || (typeof ticketId === "string" && UUID.test(ticketId)));
  if (!valid) return { ok: false, message: "This sale doesn’t look right. Check the cart and try again." };

  const p_payments = payments.map((p) =>
    p.method === "cash"
      ? { method: "cash" as const, amount: Math.round(p.amount * 100) / 100 }
      : {
          method: "e_payment" as const,
          provider: p.provider,
          reference: cleanReference(p.reference),
          amount: Math.round(p.amount * 100) / 100,
          scan_id: p.scanId ?? null,
          override_id: p.overrideId ?? null,
        },
  );
  if (p_payments.some((p) => p.method === "e_payment" && !p.reference)) return { ok: false, message: "Enter the reference number from the customer’s receipt." };

  const p_items = items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }));
  let { data, error } = ticketId
    ? await supabase.rpc("create_ticket_sale", { p_ticket_id: ticketId, p_items, p_payments, p_request_id: requestId })
    : await supabase.rpc("create_pos_sale", { p_items, p_payments, p_request_id: requestId });
  if (ticketId && error?.code === "PGRST202") {
    return { ok: false, message: `Charging tickets needs the latest database update (${TICKET_SALES_MIGRATION}). Remove the ticket to sell these items as a regular sale.` };
  }
  // A ticket that can't be charged: say what happened to it.
  const ticketDetail = (error?.details ?? "").match(/^ticket:([a-z]+)$/)?.[1];
  if (ticketDetail) {
    const why: Record<string, string> = {
      paid: "This ticket was already paid.",
      expired: "This ticket expired.",
      cancelled: "The customer cancelled this ticket.",
      replaced: "This ticket was replaced by a newer one. Ask the customer for their latest code.",
      missing: "This ticket doesn’t exist anymore.",
    };
    return {
      ok: false,
      message: `${why[ticketDetail] ?? "This ticket can’t be charged."} Nothing was charged. Remove the ticket to sell the items as a regular sale.`,
      ticketClosed: true,
    };
  }
  // Before the update runs, only the cash-or-GCash function exists. A sale paid in one go by cash
  // or GCash still works through it; other providers and split payments wait.
  if (!ticketId && error?.code === "PGRST202") {
    const [only] = p_payments;
    if (p_payments.length !== 1 || (only.method === "e_payment" && (only.provider !== GCASH || only.scan_id))) {
      return { ok: false, message: `This payment needs the latest database update (${MIGRATION}). Cash and GCash work in the meantime.` };
    }
    ({ data, error } = await supabase.rpc("create_pos_sale", {
      p_items,
      p_amount_paid: only.amount,
      p_payment_method: only.method === "cash" ? "cash" : "gcash",
      p_gcash_reference: only.method === "cash" ? null : only.reference,
      p_request_id: requestId,
    }));
  }

  if (error) {
    const text = error.message ?? "";
    // The updated function names the variant in DETAIL ("variant:<id>:short:<n>"); the original only in
    // the message, by SKU (which may contain spaces) or by id.
    const detail = (error.details ?? "").match(/^variant:([0-9a-f-]{36}):(short|unavailable)(?::(\d+))?$/i);
    const short = text.match(/Insufficient stock for (.+): (\d+) available/);
    const gone = text.match(/Variant (.+?) \(.*\) is not available for sale/);
    const who = (raw: string) => (UUID.test(raw) ? { variantId: raw } : { sku: raw });
    if (detail?.[2] === "short" || short) {
      const id = detail ? { variantId: detail[1] } : who(short![1]);
      const available = Number(detail ? detail[3] : short![2]);
      return {
        ok: false,
        message: available === 0 ? "One item just sold out. Remove it to continue." : `One item has only ${available} left now. Lower it to continue.`,
        problem: { ...id, kind: "short", available },
      };
    }
    if (detail?.[2] === "unavailable" || gone) {
      const id = detail ? { variantId: detail[1] } : who(gone![1]);
      return { ok: false, message: "One item is no longer on sale. Remove it to continue.", problem: { ...id, kind: "unavailable" } };
    }
    // A refused payment part: DETAIL is "payment:<n>:<problem>[:<receipt>]" (or "payment:short" for the whole sale).
    const pay = (error.details ?? "").match(/^payment:(?:\d+:)?([a-z_]+)(?::(.+))?$/);
    switch (pay?.[1]) {
      case "reference":
        return { ok: false, message: `${text.replace(/\.$/, "")}. Check it against the customer’s receipt.` };
      case "duplicate":
        return {
          ok: false,
          message: pay[2]
            ? `That reference was already used (${pay[2]}). Check the number on the customer’s receipt.`
            : "The same reference is in this sale twice. Check the numbers.",
        };
      case "provider":
        return { ok: false, message: "That bank or e-wallet isn’t accepted anymore. Pick another one." };
      case "cash_not_needed":
        return { ok: false, message: "The e-payments already cover the total, so take no cash." };
      case "cash_twice":
        return { ok: false, message: "Put all the cash in one payment." };
      case "needs_override":
        return { ok: false, message: "An amount differs from its receipt, and the owner’s approval is missing or expired. Reopen the payment and ask again." };
      case "scan":
        return { ok: false, message: "A receipt scan can’t be used for this sale. Reopen the payment and scan it again, or type the details." };
      case "amount":
      case "method":
        return { ok: false, message: "A payment doesn’t look right. Check the amounts and try again." };
    }
    if (error.code === "23505") return { ok: false, message: "That reference is already on another sale. Check the number on the customer’s receipt." };
    // A price can change between the last refresh and Charge; the database total is the real one.
    if (/less than the total/i.test(text)) return { ok: false, message: "The payment is less than the total. A price may have just changed; check the total." };
    if (/GCash reference/i.test(text)) return { ok: false, message: "Enter the 13-digit GCash reference number." };
    if (error.code === "42501") return { ok: false, message: "Your account isn’t allowed to record sales." };
    if (error.code === "P0002") return { ok: false, message: "An item in the sale doesn’t exist anymore. Remove it and try again." };
    return { ok: false, message: "We couldn’t record the sale, so nothing was saved. Try again." };
  }

  const sale = data as { id: string } | null;
  if (!sale?.id) return { ok: false, message: "The sale may not have saved. Check Sales before trying again." };
  return { ok: true, id: sale.id };
}

/** Owner only: returns the pieces to stock and marks the sale void. */
export async function voidSale(saleId: string, reason: string): Promise<VoidResult> {
  const { supabase, profile } = await requireStaff();
  if (profile.role !== "owner") return { ok: false, message: "Only the owner can void a sale." };
  if (typeof saleId !== "string" || !UUID.test(saleId) || typeof reason !== "string") {
    return { ok: false, message: "That sale doesn’t exist." };
  }
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { ok: false, message: "Say why the sale is being voided." };

  const { error } = await supabase.rpc("void_pos_sale", { p_sale_id: saleId, p_reason: why });
  if (error) {
    if (error.code === "PGRST202") return { ok: false, message: `Voiding needs the latest database update (${MIGRATION}).` };
    if (/already voided/i.test(error.message)) return { ok: false, message: "This sale was already voided." };
    if (error.code === "42501") return { ok: false, message: "Only the owner can void a sale." };
    if (error.code === "P0002") return { ok: false, message: "That sale doesn’t exist." };
    return { ok: false, message: "We couldn’t void the sale. Nothing changed; try again." };
  }
  return { ok: true };
}

const SCAN_TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
};
const SCAN_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_DAYS = 90;

/**
 * Reads a payment receipt photo for the counter: keeps the photo (private, 90 days), asks the
 * reader, checks every field it returns, and logs the scan. Nothing is charged here.
 */
export async function scanReceipt(form: FormData): Promise<ScanResult> {
  const { supabase, profile } = await requireStaff();
  const fail = (kind: ScanFailure, message: string): ScanResult => ({ ok: false, kind, message });

  const photo = form.get("photo");
  const picked = form.get("provider");
  if (!(photo instanceof File) || typeof picked !== "string") return fail("file", "That photo didn’t come through. Try again.");
  if (photo.size === 0 || photo.size > SCAN_MAX_BYTES) return fail("file", "That photo is too large. Take it again.");
  // The file's own first bytes decide its type, not the name or the label the browser gave it.
  const bytes = Buffer.from(await photo.arrayBuffer());
  const type = Object.keys(SCAN_TYPES).find((t) => SCAN_TYPES[t](bytes));
  if (!type) return fail("file", "That file isn’t a JPG, PNG, or WebP photo.");

  const { providers } = await fetchProviders(supabase);
  const active = providers.filter((p) => p.isActive);
  const chosen = active.find((p) => p.code === picked);
  if (!chosen) return fail("file", "That bank or e-wallet isn’t accepted anymore.");
  if (!geminiConfigured()) return fail("unavailable", "Receipt reading isn’t connected yet.");

  // Keep the photo first, so even a scan that fails to read leaves a record of what was shown.
  const ext = type === "image/jpeg" ? "jpg" : type.split("/")[1];
  const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
  const stored = await supabase.storage.from("pos-receipts").upload(path, bytes, { contentType: type });
  const photoPath = stored.error ? null : path;

  const started = Date.now();
  let model: string | null = null;
  let result: ScanResult;
  let outcome: "read" | "not_receipt" | "unreadable" | "quota" | "failed";
  let reading: Record<string, unknown> | null = null;
  try {
    const answer = await readReceiptImage({ bytes, type }, { picked: chosen.name, providers: active });
    model = answer.model;
    const checked = checkReading(answer.raw, active);
    if (checked.ok) {
      outcome = "read";
      reading = { fields: checked.fields, unsure: checked.unsure, problems: checked.problems, confidence: checked.confidence };
      result = {
        ok: true,
        fields: checked.fields,
        unsure: checked.unsure,
        duplicateOf: await takenBy(supabase, checked.fields.provider ?? chosen.code, checked.fields.reference),
        concerns: checked.concerns,
        scanId: null,
      };
    } else {
      outcome = checked.kind;
      reading = { problems: checked.problems };
      result = fail(checked.kind, checked.kind === "not_receipt" ? "This doesn’t look like a payment receipt." : "We couldn’t read this receipt.");
    }
  } catch (e) {
    const kind = e instanceof GeminiError ? e.kind : "failed";
    outcome = kind === "quota" ? "quota" : "failed";
    // The kind only: never the photo, the reply, or the key.
    console.error(kind === "key" ? "scanReceipt: Google refused GEMINI_API_KEY (deleted, disabled, or mistyped); put a working key in the environment" : `scanReceipt: reader ${kind}`);
    result = kind === "quota" ? fail("quota", "Receipt reading has reached its limit for now.") : fail("unavailable", "Receipt reading isn’t available right now.");
  }

  const { data: logged, error: logError } = await supabase
    .from("receipt_scans")
    .insert({ provider: chosen.code, photo_path: photoPath, outcome, model, reading, duration_ms: Date.now() - started })
    .select("id")
    .single();
  if (logError) console.error(`scanReceipt: log failed (${logError.code})`);
  if (result.ok) result.scanId = logged?.id ?? null;

  await deleteExpiredPhotos(supabase);
  return result;
}

/** The standing sale or custom-order payment already carrying this reference, so the cashier hears it before Charge. */
async function takenBy(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"], provider: string, reference: string | null) {
  if (!reference) return null;
  const [sale, order] = await Promise.all([
    supabase
      .from("sale_payments")
      .select("sale:sales!sale_payments_sale_id_fkey (receipt_number)")
      .eq("provider", provider)
      .eq("reference", reference)
      .is("voided_at", null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("order:custom_orders (order_number)")
      .eq("provider", provider)
      .eq("reference", reference)
      .neq("status", "rejected")
      .limit(1)
      .maybeSingle(),
  ]);
  return (
    (sale.data as { sale: { receipt_number: string } | null } | null)?.sale?.receipt_number ??
    (order.data as { order: { order_number: string } | null } | null)?.order?.order_number ??
    null
  );
}

/** Each scan clears a few photos past their 90 days; the scan rows themselves stay. */
async function deleteExpiredPhotos(supabase: Awaited<ReturnType<typeof requireStaff>>["supabase"]) {
  const cutoff = new Date(Date.now() - PHOTO_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("receipt_scans")
    .select("id, photo_path")
    .not("photo_path", "is", null)
    .is("photo_deleted_at", null)
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(5);
  const old = (data ?? []) as { id: string; photo_path: string }[];
  if (!old.length) return;
  const { error } = await supabase.storage.from("pos-receipts").remove(old.map((s) => s.photo_path));
  if (error) return;
  await supabase
    .from("receipt_scans")
    .update({ photo_deleted_at: new Date().toISOString() })
    .in(
      "id",
      old.map((s) => s.id),
    );
}

export type OverrideRequest = {
  provider: string;
  reference: string;
  amount: number;
  receiptAmount: number | null;
  reason: string;
  /** The owner's sign-in, when the cashier isn't the owner. */
  username?: string;
  password?: string;
};

export type OverrideResult =
  | { ok: true; id: string; approver: string }
  | { ok: false; field?: "username" | "password" | "reason" | "form"; message: string };

/**
 * The owner approves an e-payment amount that differs from its receipt, for this cashier and this
 * payment only (one use, 10 minutes). A staff cashier stays signed in: the owner's password is
 * checked on a separate client that keeps no session, and the approval is written as the owner.
 */
export async function approveOverride(req: OverrideRequest): Promise<OverrideResult> {
  const { supabase, profile } = await requireStaff();
  const reason = typeof req?.reason === "string" ? req.reason.trim() : "";
  const reference = typeof req?.reference === "string" ? cleanReference(req.reference) : "";
  if (reason.length < 3) return { ok: false, field: "reason", message: "Say why the amount is different." };
  if (reason.length > 300) return { ok: false, field: "reason", message: "Keep the reason under 300 characters." };
  if (
    typeof req.provider !== "string" ||
    !/^[a-z][a-z0-9_]{1,31}$/.test(req.provider) ||
    !/^[A-Z0-9]{1,60}$/.test(reference) ||
    !amountOk(req.amount) ||
    !(req.receiptAmount === null || amountOk(req.receiptAmount))
  ) {
    return { ok: false, field: "form", message: "This payment doesn’t look right. Check the reference and amount." };
  }
  const row = {
    requested_by: profile.id,
    provider: req.provider,
    reference,
    receipt_amount: req.receiptAmount,
    amount: Math.round(req.amount * 100) / 100,
    reason,
  };

  // The owner at the counter approves as themselves.
  if (profile.role === "owner") {
    const { data, error } = await supabase.from("payment_overrides").insert(row).select("id").single();
    if (error || !data) return { ok: false, field: "form", message: overrideError(error?.code) };
    return { ok: true, id: (data as { id: string }).id, approver: profile.full_name?.trim() || `@${profile.username}` };
  }

  const username = typeof req.username === "string" ? req.username.trim() : "";
  const password = typeof req.password === "string" ? req.password : "";
  if (!username) return { ok: false, field: "username", message: "Enter the owner’s username." };
  if (!password) return { ok: false, field: "password", message: "Enter the owner’s password." };

  const owner = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signIn = await owner.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (signIn.error || !signIn.data.user) {
    if (signIn.error?.status === 429) return { ok: false, field: "form", message: "Too many tries. Wait a few minutes, then try again." };
    if (signIn.error && !signIn.error.status) return { ok: false, field: "form", message: "We couldn’t reach the server. Check the connection and try again." };
    return { ok: false, field: "password", message: "That username and password don’t match." };
  }
  try {
    const { data: who } = await owner.from("profiles").select("role, username, full_name").eq("id", signIn.data.user.id).single();
    const p = who as { role: string; username: string; full_name: string | null } | null;
    if (p?.role !== "owner") return { ok: false, field: "username", message: "Only the owner can approve this." };
    const { data, error } = await owner.from("payment_overrides").insert(row).select("id").single();
    if (error || !data) return { ok: false, field: "form", message: overrideError(error?.code) };
    return { ok: true, id: (data as { id: string }).id, approver: p.full_name?.trim() || `@${p.username}` };
  } finally {
    // The owner's sign-in was only for this approval.
    await owner.auth.signOut({ scope: "local" });
  }
}

const overrideError = (code?: string) =>
  code === "PGRST205" || code === "42P01"
    ? "Approvals need the latest database update (supabase/migrations/20261018000000_e_payment_checks.sql)."
    : "We couldn’t save the approval. Try again.";

// ---------------------------------------------------------------------------
// Counter tickets: a customer's cart, sealed into a code, loaded into the sale
// ---------------------------------------------------------------------------

export type TicketLine = { variantId: string | null; quantity: number; name: string; size: string | null; color: string | null; price: number };
export type LoadedTicket = { id: string; code: string; customer: string; expiresAt: string; lines: TicketLine[] };
export type LoadTicketResult = { ok: true; ticket: LoadedTicket } | { ok: false; message: string };

type TicketRow = {
  id: string;
  code: string;
  status: TicketStatus;
  expires_at: string;
  closed_at: string | null;
  profiles: { full_name: string | null; username: string } | null;
  counter_ticket_items: { position: number; variant_id: string | null; quantity: number; product_name: string; size: string | null; color: string | null; unit_price: number | string }[] | null;
};

/** Looks up a ticket by its code (typed, scanned, or read off the customer's phone) for the sale. */
export async function loadTicket(input: string): Promise<LoadTicketResult> {
  const { supabase } = await requireStaff();
  const code = typeof input === "string" ? normalizeTicketCode(input) : null;
  if (!code) return { ok: false, message: "That isn’t a ticket code. Codes look like JJ-7K3QM." };

  const { data, error } = await supabase
    .from("counter_tickets")
    .select(
      "id, code, status, expires_at, closed_at, profiles!counter_tickets_customer_id_fkey (full_name, username), counter_ticket_items (position, variant_id, quantity, product_name, size, color, unit_price)",
    )
    .eq("code", code)
    .maybeSingle<TicketRow>();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return { ok: false, message: "Counter tickets need the latest database update (supabase/migrations/20261024000000_counter_tickets.sql)." };
    }
    return { ok: false, message: "We couldn’t look up the ticket. Check the connection and try again." };
  }
  if (!data) return { ok: false, message: `No ticket ${code}. Check the code with the customer.` };

  const customer = data.profiles?.full_name?.trim() || (data.profiles ? `@${data.profiles.username}` : "Customer");
  const state = ticketState({ status: data.status, expiresAt: data.expires_at, closedAt: data.closed_at });
  switch (state) {
    case "paid":
      return { ok: false, message: `${code} was already paid${data.closed_at ? ` on ${ticketTime(data.closed_at)}` : ""}.` };
    case "expired":
      return {
        ok: false,
        message: `${code} expired on ${ticketTime(data.expires_at)}. ${customer} can put its items back in their cart and make a new ticket.`,
      };
    case "cancelled":
      return { ok: false, message: `${customer} cancelled ${code}. Ask for their latest ticket.` };
    case "replaced":
      return { ok: false, message: `${code} was replaced by a newer ticket. Ask ${customer} for their latest code.` };
  }

  const lines = [...(data.counter_ticket_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ variantId: i.variant_id, quantity: i.quantity, name: i.product_name, size: i.size, color: i.color, price: Number(i.unit_price) }));
  return { ok: true, ticket: { id: data.id, code: data.code, customer, expiresAt: data.expires_at, lines } };
}
