-- Migration: Onboarding & account descriptions
-- Description: Adds a plain-language description column to the chart of accounts
--               so users and AI_riane understand what each account is for.
--               Re-runnable.

ALTER TABLE public.fintrack_accounts ADD COLUMN IF NOT EXISTS description TEXT;
