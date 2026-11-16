-- ==============================================================================
-- Migration: 20261116130000_add_annual_2000_uah_enum.sql
-- Description: Додавання нового значення 'annual_2000_uah' (2 000 грн/рік) в enum billing_plan_code.
-- ==============================================================================

ALTER TYPE public.billing_plan_code ADD VALUE IF NOT EXISTS 'annual_2000_uah';
