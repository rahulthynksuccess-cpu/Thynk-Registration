/**
 * dedup.ts — Remove duplicate registrations from a flat list.
 *
 * Rules:
 *   A) If the same student has BOTH a paid AND non-paid registration
 *      → keep only the paid row(s), drop all non-paid duplicates.
 *
 *   B) If the same student has ONLY non-paid rows (all failed/initiated/pending)
 *      → keep only the LATEST one (by created_at), drop older attempts.
 *      This handles multiple failed payment attempts for the same registration.
 *
 * Match key  (all four must match to be considered the same student):
 *   school_id     (UUID, unambiguous) OR school_name (fallback if school_id null)
 *   student_name  (lowercased, trimmed)
 *   contact_phone (last 10 digits — strips country code prefix & spaces)
 *   contact_email (lowercased, trimmed)
 *
 * Safety rules:
 *   - If ALL key parts are empty the row has no identity → kept ungrouped.
 *   - Paid rows are NEVER dropped, even if duplicated.
 *   - .sort() always operates on a spread copy — original array never mutated.
 */

type FlatRow = Record<string, any>;

/** Strip non-digits, take last 10 — handles +91XXXXXXXXXX and plain XXXXXXXXXX */
function normalisePhone(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-10);
}

function dedupKey(r: FlatRow): string | null {
  const schoolPart  = String(r.school_id  ?? r.school_name ?? '').toLowerCase().trim();
  const studentName = String(r.student_name  ?? '').toLowerCase().trim();
  const phone       = normalisePhone(r.contact_phone);
  const email       = String(r.contact_email ?? '').toLowerCase().trim();

  if (!schoolPart && !studentName && !phone && !email) return null;

  return `${schoolPart}||${studentName}||${phone}||${email}`;
}

const STATUS_RANK: Record<string, number> = {
  paid: 0, pending: 1, initiated: 1, failed: 2, cancelled: 2,
};

export function deduplicateRegistrations(rows: FlatRow[]): FlatRow[] {
  const groups: Record<string, FlatRow[]> = {};
  const ungrouped: FlatRow[] = [];

  for (const row of rows) {
    const key = dedupKey(row);
    if (key === null) { ungrouped.push(row); continue; }
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const result: FlatRow[] = [...ungrouped];

  for (const group of Object.values(groups)) {
    if (group.length === 1) { result.push(group[0]); continue; }

    const paidRows = group.filter(r => r.payment_status === 'paid');

    if (paidRows.length > 0) {
      // Rule A: keep all paid rows, drop non-paid duplicates
      result.push(...paidRows);
    } else {
      // Rule B: all non-paid — keep only the single latest/best attempt
      const latest = [...group].sort((a, b) => {
        const rankDiff = (STATUS_RANK[a.payment_status ?? ''] ?? 9)
                       - (STATUS_RANK[b.payment_status ?? ''] ?? 9);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      })[0];
      result.push(latest);
    }
  }

  // Return newest-first — spread copy so we never mutate result in place
  return [...result].sort((a, b) =>
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}
