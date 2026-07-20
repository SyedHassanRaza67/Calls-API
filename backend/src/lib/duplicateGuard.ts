/**
 * Duplicate-sale protection.
 *
 * Once a phone number sells (a DID comes back) on a given buyer + campaign
 * pair, the same number cannot be submitted to that pair again until the
 * configured window expires.
 *
 *   buyer    = api_configurations.buyer_code      ("D43")
 *   campaign = api_configurations.campaign_section ("Bathroom")
 *
 * The check runs BEFORE any external HTTP call, so a blocked attempt never
 * reaches the buyer. Nothing else in the ping/post flow is affected.
 */
import { query } from "../db";

export interface DedupeConfigFields {
  id: string;
  buyer_code?: string | null;
  campaign_section?: string | null;
  dedupe_enabled?: boolean | null;
  dedupe_days?: number | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

export interface ActiveBlock {
  buyer: string;
  campaign: string;
  sold_at: string;
  expires_at: string;
  days_remaining: number;
}

/**
 * Canonical phone form used for matching: digits only, US numbers reduced to
 * their last 10. `leads.caller_number` is stored raw exactly as the agent form
 * submitted it, so formatting varies ("+15551234567", "(555) 123-4567",
 * "5551234567") and a literal comparison would miss most real duplicates.
 */
export function toPhoneKey(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Resolve the dedupe key for a config.
 *
 * A config whose name never matched `D<digits>` has a NULL buyer_code. Those
 * fall back to a per-config key so they dedupe only against themselves —
 * grouping every unnamed config under a shared empty buyer would block
 * unrelated campaigns against each other.
 */
export function resolveDedupeKey(cfg: DedupeConfigFields): { buyer: string; campaign: string } {
  const buyer = (cfg.buyer_code || "").trim();
  const campaign = (cfg.campaign_section || "").trim();
  if (!buyer) return { buyer: `cfg:${cfg.id}`, campaign: campaign || "*" };
  return { buyer, campaign: campaign || "*" };
}

/** Owning admin for the block. Falls back through the config's own ownership. */
function resolveOwner(cfg: DedupeConfigFields, fallbackUserId: string): string {
  return cfg.assigned_to || cfg.created_by || fallbackUserId;
}

/**
 * Look for a live block on (owner, buyer, campaign, phone).
 * Returns null when dedupe is off for this config, the phone is unusable, or
 * nothing is currently blocking.
 */
export async function findActiveBlock(
  cfg: DedupeConfigFields,
  callerNumber: string,
  submittingUserId: string
): Promise<ActiveBlock | null> {
  if (cfg.dedupe_enabled === false) return null;

  const phoneKey = toPhoneKey(callerNumber);
  if (phoneKey.length !== 10) return null;

  const { buyer, campaign } = resolveDedupeKey(cfg);
  const owner = resolveOwner(cfg, submittingUserId);

  const { rows } = await query<{
    sold_at: string;
    expires_at: string;
    days_remaining: number;
  }>(
    `SELECT sold_at,
            expires_at,
            ceil(extract(epoch FROM (expires_at - now())) / 86400)::int AS days_remaining
       FROM campaign_lead_sales
      WHERE owner_admin_id = $1
        AND lower(dedupe_buyer) = lower($2)
        AND lower(dedupe_campaign) = lower($3)
        AND phone_key = $4
        AND released_at IS NULL
        AND expires_at > now()
      LIMIT 1`,
    [owner, buyer, campaign, phoneKey]
  );

  if (rows.length === 0) return null;
  return {
    buyer,
    campaign,
    sold_at: rows[0].sold_at,
    expires_at: rows[0].expires_at,
    days_remaining: rows[0].days_remaining,
  };
}

/** Shape returned to the client for a blocked submission (HTTP 409). */
export function blockResponse(block: ActiveBlock, configName: string): Record<string, unknown> {
  const buyerLabel = block.buyer.startsWith("cfg:") ? configName : block.buyer;
  const when = new Date(block.expires_at).toISOString().slice(0, 10);
  const human =
    `This number already sold on ${buyerLabel}` +
    (block.campaign !== "*" ? ` · ${block.campaign}` : "") +
    `. It can be submitted again on ${when} (${block.days_remaining} day(s) left).`;

  // `error` carries the human sentence because src/lib/api.ts surfaces exactly
  // that field to the agent on a non-2xx. The machine code goes in `code`, so
  // neither agent form needs changing.
  return {
    ok: false,
    error: human,
    code: "DUPLICATE_SALE_BLOCKED",
    message: human,
    buyer: buyerLabel,
    campaign: block.campaign === "*" ? null : block.campaign,
    sold_at: block.sold_at,
    expires_at: block.expires_at,
    days_remaining: block.days_remaining,
  };
}

/**
 * Record a sale so future submissions of the same number are blocked.
 *
 * Written as a single atomic upsert against the partial unique index so two
 * agents submitting the same number within milliseconds cannot both win. A
 * repeat sale refreshes the window rather than erroring.
 *
 * Never throws: dedupe bookkeeping must not fail a lead that already sold.
 */
export async function recordSale(
  cfg: DedupeConfigFields,
  callerNumber: string,
  submittingUserId: string,
  leadId: string | null
): Promise<void> {
  if (cfg.dedupe_enabled === false) return;

  const phoneKey = toPhoneKey(callerNumber);
  if (phoneKey.length !== 10) return;

  const { buyer, campaign } = resolveDedupeKey(cfg);
  const owner = resolveOwner(cfg, submittingUserId);
  const days = Number(cfg.dedupe_days) > 0 ? Number(cfg.dedupe_days) : 30;

  try {
    await query(
      `INSERT INTO campaign_lead_sales (
          owner_admin_id, dedupe_buyer, dedupe_campaign, phone_key,
          sold_lead_id, sold_config_id, sold_by_user_id,
          duration_days, expires_at
       ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, now() + ($8 || ' days')::interval
       )
       ON CONFLICT (owner_admin_id, lower(dedupe_buyer), lower(dedupe_campaign), phone_key)
         WHERE released_at IS NULL
       DO UPDATE SET
          sold_lead_id    = EXCLUDED.sold_lead_id,
          sold_config_id  = EXCLUDED.sold_config_id,
          sold_by_user_id = EXCLUDED.sold_by_user_id,
          sold_at         = now(),
          duration_days   = EXCLUDED.duration_days,
          expires_at      = EXCLUDED.expires_at`,
      [owner, buyer, campaign, phoneKey, leadId, cfg.id, submittingUserId, days]
    );
  } catch (err) {
    console.error("recordSale failed (lead still succeeded)", err);
  }
}
