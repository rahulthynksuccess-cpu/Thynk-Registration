/**
 * dedup.ts — Remove duplicate registrations from a flat list.
 *
 * Rule: if the same student (matched by school + name + phone + email) appears
 * in BOTH a paid AND a non-paid registration, the non-paid entry is suppressed.
 *
 * This handles re-registration after a failed/abandoned payment attempt.
 *
 * Match key:
 *   school_id (UUID)  ← primary school identifier (unambiguous)
 *   OR school_name    ← fallback only if school_id is null
 *   + student_name    (lowercased, trimmed)
 *   + contact_phone   (last 10 digits — strips country code +91, spaces, dashes)
 *   + contact_email   (lowercased, trimmed)
 *
 * Safety rules:
 *   - If ALL four key parts are empty, the row is kept ungrouped (not deduped).
 *   - Confirmed PAID rows are NEVER dropped, even if duplicated.
 *   - If no paid row exists in a group, ALL rows in that group are kept
 *     (multiple pending/failed attempts remain visible for follow-up).
 *
 * Pagination note:
 *   Dedup is correct only when the full dataset is passed in.
 *   Admin API fetches up to 1000 rows per call (covers all real-world cases).
 *   If pagination is ever reduced below total row count, move dedup to DB layer.
 */

type FlatRow = Record<string, any>;

/** Normalise a phone number to its last 10 digits (strips country code). */
function normalisePhone(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  // Take last 10 digits — handles +91XXXXXXXXXX and plain XXXXXXXXXX equally
  return digits.slice(-10);
}

function dedupKey(r: FlatRow): string | null {
  // school_id (UUID) is unambiguous. Fall back to school_name only when
  // school_id is absent (walk-in / unlinked registrations).
  const schoolPart  = String(r.school_id ?? r.school_name ?? '').toLowerCase().trim();
  const studentName = String(r.student_name  ?? '').toLowerCase().trim();
  const phone       = normalisePhone(r.contact_phone);
  const email       = String(r.contact_email ?? '').toLowerCase().trim();

  // If every part is empty this row has no usable identity — do not group it.
  if (!schoolPart && !studentName && !phone && !email) return null;

  return `${schoolPart}||${studentName}||${phone}||${email}`;
}

export function deduplicateRegistrations(rows: FlatRow[]): FlatRow[] {
  const groups: Record<string, FlatRow[]> = {};
  const ungrouped: FlatRow[] = [];   // rows with no usable key — always kept

  for (const row of rows) {
    const key = dedupKey(row);
    if (key === null) {
      ungrouped.push(row);
      continue;
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const result: FlatRow[] = [...ungrouped];

  for (const group of Object.values(groups)) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const paidRows   = group.filter(r => r.payment_status === 'paid');
    const unpaidRows = group.filter(r => r.payment_status !== 'paid');

    if (paidRows.length > 0) {
      // Keep ALL paid rows (never drop confirmed payments).
      // Drop non-paid duplicates — stale re-registration attempts.
      result.push(...paidRows);
    } else {
      // No paid row — keep all so follow-up list is complete.
      result.push(...unpaidRows);
    }
  }

  // Restore original ordering (newest first, matching DB order)
  result.sort((a, b) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );

  return result;
}
