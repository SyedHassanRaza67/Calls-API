// Shared blocklist of free/public email providers.
// Keep this list in sync with the backend (the server enforces the same rule).
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "hey.com",
  "fastmail.com",
  "tutanota.com",
  "qq.com",
  "163.com",
  "126.com",
]);

/**
 * Extracts the lowercased domain part from an email address.
 * Returns null if the value does not look like a single email with a domain.
 */
export function getEmailDomain(email: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
  const domain = trimmed.slice(atIndex + 1);
  if (!domain.includes(".")) return null;
  return domain;
}

/**
 * Returns true when the email's domain is a known free/public provider.
 */
export function isFreeEmailProvider(email: string): boolean {
  const domain = getEmailDomain(email);
  if (!domain) return false;
  return FREE_EMAIL_DOMAINS.has(domain);
}
