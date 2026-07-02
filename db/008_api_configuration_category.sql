-- =============================================================================
-- 008_api_configuration_category.sql — split campaign name into real fields
-- =============================================================================
-- Adds api_configurations.category and .sub_name so the "campaign section"
-- (e.g. "Auto Insurance") and sub-name (e.g. "Bathroom") are stored as their
-- own columns instead of only being baked into the free-text `name` column
-- and re-derived by regex every time the edit form opens (which was silently
-- shifting the second word of a custom category into sub_name on reopen).
--
-- One-time backfill for existing rows so they aren't blank. Only splits off a
-- sub_name when the remainder starts with a recognized category from the
-- historical hardcoded list (a safe, unambiguous split). Otherwise the whole
-- remainder becomes the category and sub_name is left NULL — deliberately NOT
-- splitting on the first space here, since that heuristic is exactly what
-- caused the original bug (custom multi-word categories like "HS Bathroom"
-- getting the second word misfiled as a sub-name). Any row that still isn't
-- quite right can be corrected once by an admin reopening and resaving it,
-- which is now safe since parsing no longer happens on every open.
-- =============================================================================

alter table public.api_configurations
  add column if not exists category text,
  add column if not exists sub_name text;

comment on column public.api_configurations.category is
  'Campaign section (e.g. "Auto Insurance"), used to group related API configs on the agent call screen. Set explicitly from the admin form, not re-derived from name.';
comment on column public.api_configurations.sub_name is
  'Free-text sub-label under the category (e.g. "Bathroom"), set explicitly from the admin form, not re-derived from name.';

-- One-time backfill from existing `name` values: "D<n> <category> [<sub>]".
with parsed as (
  select
    id,
    (regexp_match(name, '^D\d+\s*(.*)$'))[1] as rest
  from public.api_configurations
  where category is null
),
known_categories as (
  select unnest(array[
    'Auto Insurance', 'Home Insurance', 'Health Insurance', 'Life Insurance', 'Medicare',
    'Home Warranty', 'Home Security', 'Bathroom', 'Roofing', 'Windows',
    'Pest Control', 'Walk-in Tub', 'Plumbing', 'Water Damage', 'Solar', 'Mass Tort'
  ]) as cat
),
matched as (
  select
    p.id,
    p.rest,
    (select k.cat from known_categories k where p.rest like k.cat || '%' order by length(k.cat) desc limit 1) as known_cat
  from parsed p
)
update public.api_configurations c
   set category = coalesce(m.known_cat, nullif(m.rest, '')),
       sub_name = case
         when m.known_cat is not null
           then nullif(trim(substring(m.rest from length(m.known_cat) + 1)), '')
         else null
       end
  from matched m
 where c.id = m.id
   and m.rest is not null
   and m.rest <> '';
