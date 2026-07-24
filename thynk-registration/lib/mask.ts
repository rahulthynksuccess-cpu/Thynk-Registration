// lib/mask.ts
// Shared helpers for masking personally identifiable information (PII)
// before it's sent to roles that shouldn't see it in full — e.g. consultants
// viewing student registrations. Keep enough of the value visible for the
// viewer to recognize/sanity-check a record, without exposing the full
// contact detail.

/**
 * Masks an email address, e.g. "rahul.sharma@gmail.com" -> "ra***a@gm***.com"
 * Keeps the first 2 and last 1 character of the local part, and the first 2
 * characters of the domain name (before the TLD).
 */
export function maskEmail(email?: string | null): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return '***'; // not a valid email shape, mask entirely

  const maskedLocal = local.length <= 3
    ? local[0] + '*'.repeat(Math.max(local.length - 1, 1))
    : local.slice(0, 2) + '*'.repeat(Math.max(local.length - 3, 2)) + local.slice(-1);

  const domainParts = domain.split('.');
  const domainName = domainParts[0] || '';
  const tld = domainParts.slice(1).join('.');
  const maskedDomainName = domainName.length <= 2
    ? domainName[0] + '*'.repeat(Math.max(domainName.length - 1, 1))
    : domainName.slice(0, 2) + '*'.repeat(Math.max(domainName.length - 2, 2));

  return `${maskedLocal}@${maskedDomainName}${tld ? '.' + tld : ''}`;
}

/**
 * Masks a phone number, e.g. "+91 9876543210" -> "+91 ******3210"
 * Keeps any leading "+countrycode" prefix and the last 4 digits, masks the rest.
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '';
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length <= 4) return '*'.repeat(digitsOnly.length);

  const visibleTail = digitsOnly.slice(-4);
  const maskedCount = digitsOnly.length - 4;

  // Preserve a leading "+" if present, for readability
  const prefix = phone.trim().startsWith('+') ? '+' : '';
  return `${prefix}${'*'.repeat(maskedCount)}${visibleTail}`;
}
