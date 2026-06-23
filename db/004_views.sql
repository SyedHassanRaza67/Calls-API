-- =============================================================================
-- 004_views.sql — api_configurations_safe
-- =============================================================================
-- The "safe" projection of api_configurations, used when serving rows to
-- non-owners. It exposes every configuration column EXCEPT the secret `api_key`.
--
-- In Supabase the original view used `CASE WHEN is_super_admin(auth.uid())
-- THEN api_key ELSE NULL END`. There is no auth.uid() here and authorization is
-- enforced in the backend, so this view simply omits api_key entirely. When the
-- backend needs the real key (owner/super_admin), it selects from the base
-- table directly.
-- =============================================================================

create or replace view public.api_configurations_safe as
select
  id,
  name,
  api_provider,
  api_type,
  api_mode,
  http_method,
  ping_url,
  post_url,
  is_active,
  assigned_to,
  created_by,
  created_at,
  updated_at,
  custom_fields,
  notes,
  trackdrive_number,
  trackdrive_number_id,
  publisher_id
from public.api_configurations;
