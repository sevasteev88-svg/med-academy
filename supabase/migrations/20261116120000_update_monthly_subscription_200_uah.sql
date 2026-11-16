-- ==============================================================================
-- Migration: 20261116120000_update_monthly_subscription_200_uah.sql
-- Description: Крок 1 — додавання нового значення 'monthly_200_uah' в enum billing_plan_code.
--              У PostgreSQL нове значення enum має бути закомічене до використання в ALTER TABLE.
-- ==============================================================================

ALTER TYPE public.billing_plan_code ADD VALUE IF NOT EXISTS 'monthly_200_uah';
