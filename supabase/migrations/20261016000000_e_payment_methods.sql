-- =============================================================================
-- E-payments (E1), part 1 of 2: the new payment method values
-- =============================================================================
-- Counter sales can now be paid by e-wallet or bank (GCash, Maya, MariBank,
-- UnionBank, GoTyme Bank, BDO, BPI, Metrobank) and in several parts:
--   * 'e_payment'  one payment part made through a provider
--   * 'mixed'      a sale paid in more than one way (sales.payment_method only)
-- Postgres can't use a new enum value in the same transaction that adds it, so
-- the tables and functions that use these come in the next file,
-- 20261016120000_e_payments.sql. Run this one first.
-- Safe to run more than once.
-- =============================================================================

alter type public.payment_method add value if not exists 'e_payment';
alter type public.payment_method add value if not exists 'mixed';
