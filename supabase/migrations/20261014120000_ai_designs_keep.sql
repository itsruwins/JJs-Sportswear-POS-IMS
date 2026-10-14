-- =============================================================================
-- AI designs stay once made (follow-up to 20261014000000_ai_design_studio.sql)
-- =============================================================================
-- The daily limit counts the designs a customer made today, so deleting one would
-- hand a try back (and each try is a paid AI generation). Customers keep every
-- design; there's no delete in the studio, and now none through the API either.
-- Safe to run more than once.
-- =============================================================================

drop policy if exists "ai_designs: delete own" on public.ai_designs;
revoke delete on public.ai_designs from anon, authenticated;
