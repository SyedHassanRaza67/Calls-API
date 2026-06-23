import { query } from "../db";

/**
 * Server-side lead-row persistence. The frontend no longer writes the `leads`
 * table directly — these helpers own the lifecycle for the lead endpoints.
 *
 * Columns (per db schema / supabase types):
 *   user_id, caller_number, caller_state, caller_zip, api_configuration_id,
 *   status, submission_stage, external_lead_id, ping_response, api_response,
 *   returned_did, created_at
 */

export interface InsertLeadArgs {
  userId: string;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  api_configuration_id?: string | null;
  status?: string;
  submission_stage?: string;
  external_lead_id?: string | null;
  returned_did?: string | null;
  ping_response?: unknown;
  api_response?: unknown;
}

/** Insert a new lead row and return its id. */
export async function insertLead(args: InsertLeadArgs): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO leads (
        user_id, caller_number, caller_state, caller_zip, api_configuration_id,
        status, submission_stage, external_lead_id, returned_did, ping_response, api_response
     ) VALUES (
        $1, $2, $3, $4, $5,
        COALESCE($6,'pending'), COALESCE($7,'initial'), $8, $9, $10, $11
     ) RETURNING id`,
    [
      args.userId,
      args.caller_number,
      args.caller_state,
      args.caller_zip,
      args.api_configuration_id ?? null,
      args.status ?? null,
      args.submission_stage ?? null,
      args.external_lead_id ?? null,
      args.returned_did ?? null,
      args.ping_response !== undefined ? JSON.stringify(args.ping_response) : null,
      args.api_response !== undefined ? JSON.stringify(args.api_response) : null,
    ]
  );
  return rows[0].id;
}

export interface UpdateLeadArgs {
  status?: string;
  submission_stage?: string;
  external_lead_id?: string | null;
  returned_did?: string | null;
  ping_response?: unknown;
  api_response?: unknown;
}

/** Update an existing lead row (only provided fields). Scoped to owner. */
export async function updateLead(
  leadId: string,
  userId: string,
  args: UpdateLeadArgs
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (args.status !== undefined) add("status", args.status);
  if (args.submission_stage !== undefined) add("submission_stage", args.submission_stage);
  if (args.external_lead_id !== undefined) add("external_lead_id", args.external_lead_id);
  if (args.returned_did !== undefined) add("returned_did", args.returned_did);
  if (args.ping_response !== undefined) add("ping_response", JSON.stringify(args.ping_response));
  if (args.api_response !== undefined) add("api_response", JSON.stringify(args.api_response));
  if (sets.length === 0) return;

  params.push(leadId);
  const leadIdx = params.length;
  params.push(userId);
  const userIdx = params.length;
  await query(
    `UPDATE leads SET ${sets.join(", ")} WHERE id = $${leadIdx} AND user_id = $${userIdx}`,
    params
  );
}
