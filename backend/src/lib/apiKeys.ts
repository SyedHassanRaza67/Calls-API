import crypto from "crypto";
import { query } from "../db";

/** Ports of create_api_key / verify_api_key (SQL functions). Keys are stored
 * hashed (sha256 hex) + a display prefix; the plaintext is returned once. */

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateKey(): string {
  // 'sk_live_' + base64(24 random bytes), url-safe-ish (matches SQL behavior)
  let key = "sk_live_" + crypto.randomBytes(24).toString("base64");
  key = key.replace(/\//g, "_").replace(/\+/g, "-").replace(/=/g, "");
  return key;
}

export async function createApiKey(
  userId: string,
  keyName: string
): Promise<{ api_key: string; key_id: string }> {
  const newKey = generateKey();
  const hash = sha256Hex(newKey);
  const prefix = newKey.slice(0, 12) + "...";

  const { rows } = await query<{ id: string }>(
    `INSERT INTO api_keys (user_id, key_name, api_key_hash, key_prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, keyName, hash, prefix]
  );
  return { api_key: newKey, key_id: rows[0].id };
}

export async function verifyApiKey(providedKey: string, userId: string): Promise<boolean> {
  const { rows } = await query<{ api_key_hash: string }>(
    `SELECT api_key_hash FROM api_keys
      WHERE user_id = $1 AND is_active = true
      LIMIT 1`,
    [userId]
  );
  const storedHash = rows[0]?.api_key_hash;
  if (!storedHash) return false;
  return storedHash === sha256Hex(providedKey);
}
