/**
 * lib/preview-token.ts
 * Short-lived HMAC-signed tokens for admin preview of school dashboards.
 * No JWT library needed — uses Node.js built-in crypto.
 */
import { createHmac, randomBytes } from 'crypto';

const PREVIEW_SECRET =
  process.env.PREVIEW_TOKEN_SECRET ??
  process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 32) ??
  'thynk-preview-secret-change-me';

const TTL_MS = 15 * 60 * 1000; // 15 minutes

function sign(payload: string): string {
  return createHmac('sha256', PREVIEW_SECRET).update(payload).digest('hex');
}

export function buildPreviewToken(schoolId: string): string {
  const exp    = Date.now() + TTL_MS;
  const nonce  = randomBytes(8).toString('hex');
  const payload = `${schoolId}:${exp}:${nonce}`;
  const sig     = sign(payload);
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyPreviewToken(token: string): { schoolId: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts   = decoded.split(':');
    if (parts.length < 4) return null;

    const sig      = parts[parts.length - 1];
    const payload  = parts.slice(0, -1).join(':');
    const expected = sign(payload);

    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const [schoolId, expStr] = parts;
    if (Date.now() > parseInt(expStr, 10)) return null;

    return { schoolId };
  } catch {
    return null;
  }
}
