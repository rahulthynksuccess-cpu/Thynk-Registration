# Thynk Registration — Changes Summary

Everything below is inside `thynk-registration/`. Mobile app (`thynk-mobile/`) was not touched.

## 🆕 Assign Consultant to a School + show it on the Follow-ups page

**Files:** `components/admin/SchoolsPageWithApproval.tsx`, `components/admin/FollowupsDashboardPage.tsx`, `app/admin/page.tsx`

- The Schools table (in every tab — Approval Queue view isn't included, but School List and 🔗 All Schools are) now has a **Consultant** column with an inline dropdown — pick a consultant and it's assigned immediately, no need to open the full Edit form. (Super_admin only, matching the existing permission on school edits; sub-admins see the assigned name as read-only text.)
- The **Follow-ups** dashboard now has an **Assigned Consultant** column for every school row, plus a **🤝 Filter by Consultant** dropdown — pick a consultant to see just their assigned schools (and their own follow-up row) in one place.

> Note on interpretation: your request said "assign consultant to any user" — I've implemented this as assigning a consultant to a **School** (schools already had a `consultant_id` field used elsewhere in the app, e.g. analytics/reporting are already grouped by consultant → school). If you actually meant something else by "user" (e.g. individual school-admin login accounts, or platform Users under the Admin Users page), tell me and I'll adjust — that's a different, smaller change.

## 🐛 Critical bugfix — Rejected consultants were impossible to find/filter

**Root cause found in** `components/admin/ConsultantHub.tsx`

The Approved Consultants tab merges two data sources per consultant: the consultant's own record (from `consultant_profiles`, which has our new `status: 'approved'|'rejected'` field) and their original registration record (from `consultant_registrations`, which has its *own*, unrelated `status` column — pending/approved/rejected for the *registration itself*). The merge code was doing:

```js
{ ...c, ...registrationRecord }   // registration spread AFTER c — wrong order
```

Since only *approved* registrations are loaded into this tab, `registrationRecord.status` is always `'approved'` — so it silently overwrote the consultant's real approve/reject status back to `'approved'` on every render, no matter what you'd just set via Reject. That's exactly why the Rejected filter and badge never found anyone — the rejection was saved correctly in the database, but the UI immediately clobbered it back to "approved" when displaying it. **This is now fixed** — the merge no longer lets the registration's status field override the consultant's actual status.

## 🔎 Better visibility for Rejected consultants and Follow-ups

- The **Approved Consultants** tab title now shows a red "N ❌" badge when there are rejected consultants, so you don't have to remember to click the filter pill to notice them.
- Added a **📅 View All Follow-ups** button directly in the top bar of both the **Consultants** page and the **Schools** page — one click jumps straight to the central Follow-ups dashboard, for both consultants and schools.

## ⚠️ Before deploying — run the new SQL migration
`supabase/migrations/015_consultant_status_and_followups.sql`
Adds:
- `consultant_profiles.status` (approved/rejected) + rejection metadata
- `next_followup_date` / `last_followup_*` cache columns on both `schools` and `consultant_profiles`
- a new `followups` table (full history: comment, next date, user, timestamp)

Run it the same way you ran migrations 001–014 (Supabase SQL editor or CLI).

---

## 1. Open link for schools — both Pending & Approved together
**File:** `components/admin/SchoolsPageWithApproval.tsx`

Added a persistent **🔗 All Schools** tab next to Analytics / Approval Queue / School List. Unlike the other tabs, it always shows every school regardless of status (pending + approved together, with a Status column) — it's a permanent link you can click any time, not something that only appears while typing in the search box. (The search box also still searches across both when it has text, as before.)

> Note: this is a persistent in-app tab, not a raw shareable URL — the admin dashboard doesn't use per-tab URL routing today (it's all client-side state), so there's no `/admin/schools/all`-style link to copy/paste. If you specifically need a copyable URL (e.g. to send someone straight to this view), that's a bigger routing change — let me know and I'll add query-param based deep-linking.

## 2. Follow-ups — a central list, not just per-record
**New file:** `components/admin/FollowupsDashboardPage.tsx`, new sidebar item **📅 Follow-ups**

Previously you could only set a follow-up from inside each consultant/school — there was nowhere to see everything at a glance. Now there's a dedicated **Follow-ups** page in the sidebar (under Management, next to Consultants) that:
- Lists every consultant **and** school with a next follow-up date, sorted soonest-first
- Highlights 🔴 overdue and 🟡 due-within-3-days items
- Filter pills: Overdue / Upcoming / Not Set / All, and Everyone / Schools / Consultants
- Search by name or code
- A **📅 Set/Update Follow-up** button on every row opens the same follow-up panel (history + new comment + new date) — so you can set a **new** follow-up date right from this list, no need to dig into the consultant/school record first.

## 2. School Details shows Consultant Name (not ID)
**File:** `components/admin/SchoolFormDetailsModal.tsx`

Was displaying the raw `consultant_id` UUID. The schools API already resolves a `consultant_name` — this was just wired up. Now shows "Consultant: Rahul Sharma" instead of a UUID.

## 3. Reject option for already-Approved consultants + status/selection filters everywhere
**Files:** `app/api/admin/consultants/route.ts`, `components/admin/ConsultantHub.tsx`, migration 015

- Consultants previously could only be rejected while still in the "Pending" queue. Now the **Approved Consultants** tab has a ✕ Reject button on every consultant (with an optional reason), and a ↩️ Restore button to undo it. Rejected consultants get a ❌ Rejected badge.
- Added an **Approved / Rejected** filter pill row on the Approved tab (alongside the existing Associated/Not Associated filter).
- The **Communicate** tab's recipient filter now has 5 options: All / Associated / Not Associated / Approved / Rejected — so you can select any of "approved, associated, rejected" as requested. Rejected consultants are excluded from "All" sends by default (safety) — you have to explicitly pick "Rejected" to message them.

## 4. Follow-up date & history for Consultants and Schools
**Files:** `app/api/admin/followups/route.ts` (new), `components/admin/FollowupModal.tsx` (new), `components/admin/ConsultantHub.tsx`, `components/admin/SchoolsPageWithApproval.tsx`, `components/admin/SchoolFormDetailsModal.tsx`, `app/admin/page.tsx`

- New shared **Follow-up** panel (opens as a modal — the app is a single-page dashboard, so this is the "create page for follow-up"): lets you log a comment + set the **next follow-up date**, and shows the full history — every past comment with **date & time and the user name** who logged it, most recent first.
- **Consultants:** a 📅 Follow-up button on every consultant card (Approved tab) opens this panel. A snapshot line ("📅 Next follow-up: 12 Sep 2026 · 'called, waiting on docs'") shows directly on the card.
- **Schools:** a 📅 date button in the School List table (shows the next follow-up date, or "Set" if none) opens the same panel. The "School Details" modal also has a Follow-up section with the same button.
- **Edit forms:** both the consultant Edit form and the school Edit form now have a **Next Follow-up Date** picker, so you can set/change the date directly while editing — per your request ("dates we can send in edit option"). Comments/history still go through the Follow-up panel.

---

## Files touched
```
supabase/migrations/015_consultant_status_and_followups.sql   (new)
app/api/admin/followups/route.ts                               (new)
app/api/admin/consultants/route.ts                              (status + next_followup_date support)
app/api/admin/schools/route.ts                                  (expose follow-up columns)
components/admin/FollowupModal.tsx                              (new, shared)
components/admin/SchoolFormDetailsModal.tsx                     (consultant name fix + follow-up section)
components/admin/SchoolsPageWithApproval.tsx                    (unified search, follow-up column/button)
components/admin/AdminApprovalQueue.tsx                         (wire showToast into details modal)
components/admin/ConsultantHub.tsx                              (reject/restore, status filters, follow-up)
app/admin/page.tsx                                              (next_followup_date fields in edit forms)
```

## Known limitations / things to double check
- I couldn't run `npm install` / `next build` in this sandbox (no network access), so changes are reviewed carefully by hand but not compiled. Please run a local `npm run build` before deploying to catch any TypeScript nits.
- Rejecting a consultant does **not** delete their login or their schools — it only flags `status = 'rejected'` and hides them from default communication sends. If you want rejection to also disable login, that's a follow-up change (let me know).
- The "Follow-up" feature is a modal, not a separate routed page — given the app's existing single-page-per-section architecture, this matches the existing UX pattern (e.g. School Details is also a modal).
