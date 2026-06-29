-- =============================================================================
-- 006_company_domain.sql — store each account's company email domain
-- =============================================================================
-- Adds profiles.company_domain to enforce that admin-created agents use their
-- admin's company email domain (agent@company.com). The column is NULL for
-- super_admin and for accounts on free/public email providers, which keeps the
-- domain rule dormant for those accounts. A one-time backfill populates the
-- column for existing rows whose email is on a real (non-free) company domain.
-- =============================================================================

alter table public.profiles
  add column if not exists company_domain citext;

comment on column public.profiles.company_domain is
  'Company email domain (e.g. ''acme.com'') used to enforce that admin-created agents share their admin''s domain. NULL for super_admin and for free/public-provider accounts, leaving the rule dormant for them.';

-- One-time backfill: only for existing rows on non-free (real company) domains.
-- Free/public providers are intentionally left NULL so the rule stays dormant.
update public.profiles
   set company_domain = lower(split_part(email, '@', 2))
 where company_domain is null
   and email is not null
   and position('@' in email) > 0
   and lower(split_part(email, '@', 2)) not in (
     'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com',
     'outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com',
     'mac.com','aol.com','protonmail.com','proton.me','pm.me','gmx.com','gmx.net',
     'mail.com','zoho.com','yandex.com','hey.com','fastmail.com','tutanota.com',
     'qq.com','163.com','126.com'
   );
