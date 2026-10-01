-- =============================================================================
-- 011_google_sheets_sync.sql — mirror lead submissions into Google Sheets
-- =============================================================================
-- The super admin connects a Google service account + spreadsheet (stored in
-- system_settings under the 'google_sheets' key). A background worker in the
-- backend appends every finished lead to a per-company tab and stamps
-- sheet_synced_at so each lead is written exactly once.
-- =============================================================================

alter table public.leads
  add column if not exists sheet_synced_at timestamptz;

comment on column public.leads.sheet_synced_at is
  'When this lead was appended to the Google Sheets export. NULL = not exported yet.';

-- The worker only ever scans unsynced rows, oldest first.
create index if not exists idx_leads_sheet_unsynced
  on public.leads (created_at)
  where sheet_synced_at is null;
