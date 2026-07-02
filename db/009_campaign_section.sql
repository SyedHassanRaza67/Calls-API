-- =============================================================================
-- 009_campaign_section.sql — dedicated "Campaign Names" grouping field
-- =============================================================================
-- Adds api_configurations.campaign_section: a standalone section label (e.g.
-- "Auto Insurance") that an admin assigns an API config to via the new
-- "Campaign Names" dropdown, independent of the "Name" field (D3 HS Bathroom
-- etc., stored in name/category/sub_name). This is the field the agent call
-- screen groups API configs by — category/sub_name remain purely about
-- composing the display "Name" and are not used for grouping anymore.
--
-- One-time backfill: seed campaign_section from the existing `category`
-- column so configs that were already grouped on the agent call screen
-- (under the previous category-based grouping) keep their groupings after
-- this change, until an admin explicitly assigns a real "Campaign Names"
-- section.
-- =============================================================================

alter table public.api_configurations
  add column if not exists campaign_section text;

comment on column public.api_configurations.campaign_section is
  'Campaign section (e.g. "Auto Insurance") assigned via the "Campaign Names" field, used to group related API configs on the agent call screen. Independent of name/category/sub_name.';

update public.api_configurations
   set campaign_section = category
 where campaign_section is null
   and category is not null;
