-- =============================================================================
-- 010_duplicate_protection.sql — block duplicate sales per buyer + campaign
-- =============================================================================
-- Business rule: once a lead sells (a DID comes back) on a given buyer +
-- campaign pair, that same phone number cannot be submitted to the same
-- buyer + campaign again until the configured window expires.
--
--   buyer    = the "D<n>" prefix of api_configurations.name ("D43")
--   campaign = api_configurations.campaign_section          ("Bathroom")
--
-- Nothing else in the ping/post flow changes. A blocked submission is
-- rejected before any external HTTP call is made.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- buyer_code — promote the "D43" name prefix to a real column.
--
-- Until now this value only existed inside the composed `name` string and was
-- recovered by regex in the admin UI. Dedupe has to key on it, so it needs to
-- be stored and queryable.
-- ---------------------------------------------------------------------------
alter table public.api_configurations
  add column if not exists buyer_code text;

comment on column public.api_configurations.buyer_code is
  'Buyer identifier taken from the "Name" prefix dropdown (e.g. "D43"). Used with campaign_section as the duplicate-sale dedupe key.';

-- One-time backfill using the same pattern the admin UI already parses with
-- (see ApiConfigurations.tsx — /^(D\d+)\s*(.*)/). Rows whose name does not
-- start with D<digits> stay NULL and are handled by the application, which
-- falls back to dedupe-within-that-single-config rather than grouping all
-- NULLs together.
update public.api_configurations
   set buyer_code = substring(name from '^(D[0-9]+)')
 where buyer_code is null;

-- ---------------------------------------------------------------------------
-- Per-API duplicate-protection settings.
-- Enabled by default at 30 days: the rule is meant to apply to every API,
-- and an admin can turn it off or retune the window per config.
-- ---------------------------------------------------------------------------
alter table public.api_configurations
  add column if not exists dedupe_enabled boolean not null default true,
  add column if not exists dedupe_days    integer not null default 30;

comment on column public.api_configurations.dedupe_enabled is
  'When true, a phone number that already sold on this buyer + campaign is blocked until the window expires.';
comment on column public.api_configurations.dedupe_days is
  'Length of the duplicate-block window in days (15 / 30 / 60 / custom).';

create index if not exists idx_api_configs_buyer_campaign
  on public.api_configurations (lower(buyer_code), lower(campaign_section));

-- ---------------------------------------------------------------------------
-- campaign_lead_sales — one row per (buyer, campaign, phone) that has sold.
--
-- dedupe_buyer / dedupe_campaign store the RESOLVED key as literal text rather
-- than FKs, so a later rename of a config cannot silently re-open a block that
-- is already running.
--
-- phone_key is digits-only, US numbers reduced to their last 10 digits, so the
-- match is immune to +1 / dashes / parens formatting differences in the raw
-- caller_number the agent form submits.
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_lead_sales (
  id               uuid        primary key default gen_random_uuid(),
  owner_admin_id   uuid        not null references public.app_users(id) on delete cascade,
  dedupe_buyer     text        not null,
  dedupe_campaign  text        not null,
  phone_key        text        not null,

  sold_lead_id     uuid        references public.leads(id) on delete set null,
  sold_config_id   uuid        references public.api_configurations(id) on delete set null,
  sold_by_user_id  uuid,
  sold_at          timestamptz not null default now(),

  duration_days    integer     not null,
  expires_at       timestamptz not null,

  released_at      timestamptz,
  released_by      uuid        references public.app_users(id),
  release_reason   text,

  created_at       timestamptz not null default now()
);

-- Only ONE live block per (owner, buyer, campaign, phone); released rows stay
-- behind as history. The partial predicate is what makes both true at once.
create unique index if not exists campaign_lead_sales_active_uniq
  on public.campaign_lead_sales (owner_admin_id, lower(dedupe_buyer), lower(dedupe_campaign), phone_key)
  where released_at is null;

create index if not exists campaign_lead_sales_lookup
  on public.campaign_lead_sales (phone_key, expires_at desc);

create index if not exists campaign_lead_sales_sold_at
  on public.campaign_lead_sales (sold_at desc);
