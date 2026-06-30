-- =============================================================================
-- 007_company_branding.sql — store each company's logo for per-company branding
-- =============================================================================
-- Adds profiles.company_logo so admins can brand their account with a logo
-- alongside the existing company name. The logo is set by the admin; agents
-- inherit their managing admin's branding via profiles.managed_by. The column
-- is NULL until an admin uploads a logo.
-- =============================================================================

alter table public.profiles
  add column if not exists company_logo text;

comment on column public.profiles.company_logo is
  'Company logo stored as a data URL, set by the admin for per-company branding. Agents inherit their managing admin''s logo via managed_by. NULL until an admin uploads one.';
