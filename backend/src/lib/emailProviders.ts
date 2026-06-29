// Free / public email providers that are not allowed for company signups.
// Keep this list in sync with the frontend validation rules.
export const FREE_EMAIL_DOMAINS = new Set<string>([
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

/** Extract the lowercased domain portion of an email, or null if it has no `@`. */
export function getEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) {
    return null;
  }
  return email.slice(at + 1).trim().toLowerCase();
}

/** True if the email belongs to a known free / public provider. */
export function isFreeEmailProvider(email: string): boolean {
  const domain = getEmailDomain(email);
  return domain !== null && FREE_EMAIL_DOMAINS.has(domain);
}
