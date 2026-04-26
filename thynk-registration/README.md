# Feature Implementation: Document Upload + Notification System

## Overview

This adds two fully-integrated features to the Thynk Registration platform:

1. **Admin Document Upload System** — upload PDFs, Word, Excel, Audio, Video files and make them available on the Client (School) Portal.
2. **Dashboard Notification System** — real-time in-app notifications on both the Admin and School dashboards, with an Admin control panel to compose and broadcast.

---

## Files Delivered

```
006_documents_and_notifications.sql          ← Run in Supabase SQL Editor (migration)

app/api/admin/documents/route.ts             ← GET / POST / DELETE / PATCH
app/api/admin/notifications/route.ts         ← GET / POST / PATCH
app/api/school/documents/route.ts            ← GET (school portal)
app/api/school/notifications/route.ts        ← GET / PATCH

lib/notifications.ts                         ← Shared helper + convenience wrappers

components/admin/DocumentUploadPanel.tsx     ← Admin upload UI + document library
components/admin/NotificationControlPanel.tsx ← Bell icon, dropdown, full panel
components/school/ClientDocumentsTab.tsx     ← School portal document grid
components/school/SchoolNotificationsPanel.tsx ← School notification feed + bell

PATCH_EXISTING_ROUTES.ts                     ← Snippets to add to payment/register routes
INTEGRATION_GUIDE.ts                         ← Exactly how to wire into existing pages
```

---

## Step-by-Step Setup

### 1. Supabase Storage Bucket

In Supabase Dashboard → Storage → New Bucket:
- Name: `client-documents`
- Public: **OFF** (private, signed URLs only)

Add these Storage Policies (Dashboard → Storage → Policies):

**For uploads (INSERT):**
```sql
-- Authenticated service role only (API routes use service role key)
-- No RLS policy needed — API routes call with service client (bypasses RLS)
```

**For signed URL reads:**
```sql
-- Also handled via service client in API route — no additional policy needed
```

### 2. Run the Migration

Copy `006_documents_and_notifications.sql` into Supabase Dashboard → SQL Editor → Run.

### 3. Copy Source Files

Copy all files from this output directory into the matching paths under `thynk-registration/`.

### 4. Wire Into Existing Pages

Follow `INTEGRATION_GUIDE.ts` to:
- Add 2 NAV items + bell icon to `app/admin/page.tsx`
- Add 2 tabs + bell icon to `app/school/dashboard/page.tsx`

### 5. Hook Into Existing Events

Follow `PATCH_EXISTING_ROUTES.ts` to trigger notifications when:
- A payment is confirmed (`payment.paid`)
- A student registers (`registration.created`)
- A school is approved (`school.approved`)
- Pricing / data patterns are updated

---

## Features in Detail

### Document Upload Panel (Admin)

| Feature | Detail |
|---|---|
| Supported formats | PDF, DOC/DOCX, XLS/XLSX, MP3/WAV/OGG, MP4/WebM/MOV, JPG/PNG/GIF/WebP |
| Max file size | 100 MB per file |
| Multi-file upload | Yes — drag-and-drop or browse |
| Categories | General, Contract, Invoice, Report, Media, Other |
| Per-school scoping | Admin selects which school the document belongs to |
| Visibility toggle | Admin can hide/show documents from the client portal |
| Download | Signed 1-hour URLs (secure, not public) |
| Auto-notification | Uploading a document auto-fires a dashboard notification to the school |

### Notification System

| Feature | Detail |
|---|---|
| Audiences | Admin only / School only / Both |
| Types | Info, Success, Warning, Alert, Document |
| Bell badge | Live unread count, polls every 30s |
| Mark as read | Per-user read tracking (`notification_reads` table) |
| Mark all read | One click |
| Broadcast | Admin can send to a specific school or all schools |
| Auto events | Payment received, new registration, school approved, document uploaded, data pattern updated |
| Admin compose panel | Title, message, audience, type, target school |

### School Portal

- New **Documents** tab shows a categorised card grid with download/preview
- New **Notifications** tab shows the full feed with unread indicators
- Bell icon in the header with live badge
- Clicking the bell navigates to the Notifications tab

---

## Environment Variables

No new env vars required. Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BACKEND_URL`
