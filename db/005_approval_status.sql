-- =============================================================================
-- 005_approval_status.sql — add a self-signup approval workflow column
-- =============================================================================
-- Adds profiles.approval_status to support the "signup → pending Super-Admin
-- approval" flow. Default is 'approved' so the seeded super_admin and every
-- admin-created agent remain immediately usable; only self-signup sets 'pending'.
-- =============================================================================

alter table public.profiles
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected'));

comment on column public.profiles.approval_status is
  'Self-signup approval state. ''approved'' by default (seed/admin-created users); self-signup sets ''pending'' until a super_admin approves or rejects.';
