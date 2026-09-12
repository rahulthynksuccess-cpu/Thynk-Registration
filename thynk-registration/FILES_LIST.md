# Changed Files Only

Copy these into your project at the same relative paths (they replace the existing files
of the same name, except the two marked NEW which are new files).

New files:
- supabase/migrations/015_consultant_status_and_followups.sql   (NEW — run this migration first)
- app/api/admin/followups/route.ts                               (NEW)
- components/admin/FollowupModal.tsx                             (NEW)
- components/admin/FollowupsDashboardPage.tsx                    (NEW)

Modified files (replace the existing ones):
- app/api/admin/consultants/route.ts
- app/api/admin/schools/route.ts
- components/admin/SchoolFormDetailsModal.tsx
- components/admin/SchoolsPageWithApproval.tsx
- components/admin/AdminApprovalQueue.tsx
- components/admin/ConsultantHub.tsx
- app/admin/page.tsx

See CHANGES.md (sent earlier) for what each file change does.
