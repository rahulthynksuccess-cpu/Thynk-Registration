# Thynk Success — Multi-Tenant School Registration & Payment Platform

A production-grade, multi-tenant school admission and payment platform built with **Next.js 14**, **Supabase**, and **Vercel**. Supports multiple programs, schools, payment gateways, automated notifications, and a full-featured super admin dashboard.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Database Schema](#database-schema)
6. [Environment Variables](#environment-variables)
7. [Local Setup](#local-setup)
8. [Supabase Setup](#supabase-setup)
9. [Payment Gateways](#payment-gateways)
10. [Email & WhatsApp Notifications](#email--whatsapp-notifications)
11. [Admin Dashboard](#admin-dashboard)
12. [School Management](#school-management)
13. [Location Master](#location-master)
14. [Registration Flow](#registration-flow)
15. [API Reference](#api-reference)
16. [Deployment](#deployment)
17. [Recent Updates](#recent-updates)
18. [Troubleshooting](#troubleshooting)

---

## Overview

Thynk Success allows a single platform to serve **many schools and programs** simultaneously. Each school gets its own branded registration URL, custom pricing, discount codes, and contact management. A super admin controls everything from a single dashboard; school admins can view their own data.

**Live registration URL pattern:**
```
https://www.thynksuccess.com/registration/{programSlug}/{schoolCode}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Vercel |
| Styling | Tailwind CSS + custom CSS variables |
| Payments (INR) | Razorpay, Cashfree, Easebuzz |
| Payments (USD) | PayPal, Razorpay |
| Email | SMTP, SendGrid, AWS SES |
| WhatsApp | WhatsApp Cloud API, Twilio |
| Language | TypeScript |

---

## Architecture

```
Browser (Student)
    │
    ▼
Next.js App (Vercel)
    ├── /registration/[programSlug]/[schoolCode]  ← Public registration form
    ├── /admin                                    ← Super/School admin dashboard
    └── /api/
        ├── school/[code]        ← Fetch school + pricing config
        ├── register             ← Create registration + initiate payment
        ├── discount             ← Validate discount codes
        └── payment/
            ├── verify           ← Verify payment after redirect
            └── webhook          ← Receive async gateway webhooks
                │
                ▼
        Supabase (PostgreSQL)
            ├── schools          ← School config, branding, contacts
            ├── projects         ← Programs (e.g. "Thynk Success 2025")
            ├── pricing          ← Per-school pricing rows
            ├── registrations    ← Student registration records
            ├── payments         ← Payment transaction records
            ├── discount_codes   ← Discount codes per school
            ├── integration_configs  ← Payment/email/WA credentials
            ├── notification_templates  ← Email/WA message drafts
            ├── notification_triggers   ← Auto-fire on events
            ├── notification_logs       ← Sent message log
            ├── location_master         ← Countries/states/cities
            ├── admin_roles      ← Super admin / school admin roles
            └── activity_logs    ← Audit trail
```

---

## Project Structure

```
thynk-registration/
├── app/
│   ├── admin/
│   │   ├── layout.tsx                  # Admin shell layout
│   │   ├── login/page.tsx              # Admin login page
│   │   └── page.tsx                    # Full admin dashboard (single file SPA)
│   ├── api/
│   │   ├── admin/
│   │   │   ├── activity-logs/route.ts  # Audit log API
│   │   │   ├── discounts/route.ts      # CRUD discount codes
│   │   │   ├── integrations/route.ts   # CRUD payment/email/WA integrations
│   │   │   ├── integrations/test/      # Test integration connection
│   │   │   ├── location/route.ts       # CRUD location master
│   │   │   ├── pricing/route.ts        # CRUD pricing rows
│   │   │   ├── projects/route.ts       # CRUD programs
│   │   │   ├── registrations/route.ts  # Fetch registrations (admin)
│   │   │   ├── schools/route.ts        # CRUD schools
│   │   │   ├── templates/route.ts      # CRUD notification templates
│   │   │   ├── triggers/route.ts       # CRUD notification triggers
│   │   │   └── users/route.ts          # CRUD admin users
│   │   ├── discount/route.ts           # Public: validate discount code
│   │   ├── payment/
│   │   │   ├── verify/route.ts         # Verify payment post-redirect
│   │   │   └── webhook/route.ts        # Gateway webhook handler
│   │   ├── register/route.ts           # Public: submit registration form
│   │   └── school/
│   │       ├── route.ts                # List schools
│   │       └── [code]/route.ts         # Fetch school by code
│   ├── registration/
│   │   └── [projectSlug]/
│   │       └── [schoolCode]/page.tsx   # Public registration page
│   ├── globals.css                     # Admin dashboard styles
│   ├── layout.tsx                      # Root layout
│   └── not-found.tsx                   # 404 page
├── components/
│   └── registration/
│       └── RegistrationCard.tsx        # Student-facing registration form component
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client
│   │   └── server.ts                   # Server Supabase client + service role
│   ├── payment/
│   │   ├── router.ts                   # Gateway resolver (priority-based)
│   │   ├── razorpay.ts                 # Razorpay integration
│   │   ├── cashfree.ts                 # Cashfree integration
│   │   └── easebuzz.ts                 # Easebuzz integration
│   ├── activity.ts                     # Activity log writer
│   ├── email.ts                        # Email sender (SMTP/SendGrid/SES)
│   ├── triggers.ts                     # Trigger evaluator
│   ├── triggers/fire.ts                # Trigger executor
│   ├── types.ts                        # Shared TypeScript types
│   └── utils.ts                        # Shared utility functions
├── middleware.ts                       # Next.js middleware (minimal passthrough)
├── supabase/
│   ├── migrations/
│   │   ├── 001_init.sql                # Core schema
│   │   └── 002_saas_upgrade.sql        # Multi-project, integrations, triggers
│   └── seed.sql                        # Default data seed
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── vercel.json
└── package.json
```

---

## Database Schema

### Core Tables

#### `schools`
Stores each school's configuration, branding, and contact information.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `school_code` | text | Unique slug (e.g. `delhi-dps`) |
| `name` | text | School display name |
| `org_name` | text | Organisation name |
| `address` | text | Complete street address |
| `pin_code` | text | Postal / ZIP code |
| `city` | text | City |
| `state` | text | State / Region |
| `country` | text | Country |
| `contact_persons` | jsonb | Array of up to 4 contact objects `[{name, designation, email, mobile}]` |
| `branding` | jsonb | `{primaryColor, accentColor, redirectURL}` |
| `gateway_config` | jsonb | Legacy gateway key store |
| `project_id` | uuid → projects | Linked program |
| `project_slug` | text | Program slug (denormalised for fast lookup) |
| `discount_code` | text | Default discount code for this school |
| `is_active` | boolean | Whether school is live |

#### `projects`
Programs offered on the platform (e.g. "Thynk Success 2025").

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `name` | text | Program display name |
| `slug` | text | URL slug (e.g. `thynk-success-2025`) |
| `base_amount_inr` | integer | Base price in paise for India |
| `base_amount_usd` | integer | Base price in cents for international |
| `status` | text | `active` / `inactive` |

#### `pricing`
Per-school pricing row. A school can have one active pricing row per currency.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `school_id` | uuid → schools | |
| `program_name` | text | Copy of program name |
| `base_amount` | integer | Amount in paise/cents |
| `currency` | text | `INR` or `USD` |
| `gateway_sequence` | text[] | Ordered list of gateways to try |
| `is_active` | boolean | |

#### `registrations`
One row per student registration form submission.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `school_id` | uuid → schools | |
| `student_name` | text | |
| `class_grade` | text | |
| `gender` | text | |
| `parent_school` | text | Student's current school |
| `city` | text | Student's city |
| `parent_name` | text | |
| `contact_phone` | text | |
| `contact_email` | text | |
| `status` | text | `pending / initiated / paid / failed / cancelled` |

#### `payments`
One row per payment attempt (multiple attempts per registration possible).

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `registration_id` | uuid → registrations | |
| `gateway` | text | `razorpay / cashfree / easebuzz / paypal` |
| `gateway_txn_id` | text | Gateway's transaction reference |
| `base_amount` | integer | Pre-discount amount in paise |
| `discount_amount` | integer | Discount applied in paise |
| `final_amount` | integer | Amount actually charged in paise |
| `discount_code` | text | Code applied (if any) |
| `status` | text | `pending / initiated / paid / failed / cancelled` |
| `gateway_response` | jsonb | Raw response from gateway |
| `paid_at` | timestamptz | Timestamp of successful payment |

#### `discount_codes`
Discount codes scoped to a school. The school code itself is auto-created as the default code with 0 discount.

| Column | Type | Description |
|---|---|---|
| `code` | text | The code string (uppercased) |
| `discount_amount` | integer | Fixed discount in paise |
| `discount_type` | text | `fixed` or `percent` |
| `max_uses` | integer | Null = unlimited |
| `used_count` | integer | Auto-incremented on payment |
| `expires_at` | timestamptz | Optional expiry |

#### `admin_roles`
Controls which users can access the admin dashboard and which schools they can see.

| Column | Type | Description |
|---|---|---|
| `user_id` | uuid → auth.users | |
| `school_id` | uuid → schools | Null = super admin (all schools) |
| `role` | text | `super_admin` / `school_admin` |

### Notification Tables

| Table | Purpose |
|---|---|
| `integration_configs` | Credentials for payment/email/WhatsApp providers, per school or global |
| `notification_templates` | Email/WhatsApp message drafts with `{{variable}}` placeholders |
| `notification_triggers` | Rules to auto-fire a template when an event occurs |
| `notification_logs` | Audit log of every message sent |

### Supporting Tables

| Table | Purpose |
|---|---|
| `location_master` | Country / State / City dropdown data |
| `activity_logs` | Admin action audit trail |

---

## Environment Variables

Create `.env.local` in the project root:

```env
# ── Supabase ─────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── App ──────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://www.thynksuccess.com
NEXT_PUBLIC_BACKEND_URL=https://www.thynksuccess.com
# For local dev: NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# ── Payment Gateways (env fallback — DB config takes priority) ───
RAZORPAY_KEY_ID=rzp_live_xxxx
RAZORPAY_KEY_SECRET=your-secret

CASHFREE_APP_ID=your-app-id
CASHFREE_SECRET_KEY=your-secret

EASEBUZZ_KEY=your-key
EASEBUZZ_SALT=your-salt
EASEBUZZ_ENV=production

PAYPAL_CLIENT_ID=your-client-id
PAYPAL_CLIENT_SECRET=your-secret

# ── Email (env fallback — DB config takes priority) ──────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM_EMAIL=noreply@thynksuccess.com
SMTP_FROM_NAME=Thynk Success

SENDGRID_API_KEY=SG.xxxx
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret
```

> **Security note:** Payment gateway secrets should ideally be stored in Supabase Vault and referenced via `integration_configs`. The env vars above serve as fallbacks when no DB config exists.

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-org/thynk-registration
cd thynk-registration/thynk-registration

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in all values — at minimum Supabase URL + keys

# 4. Run the dev server
npm run dev

# App:   http://localhost:3000
# Admin: http://localhost:3000/admin
```

---

## Supabase Setup

### Step 1 — Create Project
Go to [supabase.com](https://supabase.com), create a new project, and copy the URL and keys into `.env.local`.

### Step 2 — Run Migrations (in order)

In **Supabase Dashboard → SQL Editor**, run each script in sequence:

```
supabase/migrations/001_init.sql       ← Core schema + RLS
supabase/migrations/002_saas_upgrade.sql  ← Programs, integrations, triggers
```

Then run the additional column scripts for recent features:

```sql
-- Schools: address, pin code, contact persons
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS pin_code        TEXT,
  ADD COLUMN IF NOT EXISTS contact_persons JSONB DEFAULT '[]'::jsonb;

-- Projects: dual-currency pricing
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS base_amount_inr INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_amount_usd INTEGER DEFAULT 0;

-- Backfill existing projects
UPDATE projects SET base_amount_inr = base_amount WHERE currency = 'INR' AND base_amount_inr = 0;
UPDATE projects SET base_amount_usd = base_amount WHERE currency = 'USD' AND base_amount_usd = 0;

-- Location master table (if not already created)
CREATE TABLE IF NOT EXISTS location_master (
  id          uuid primary key default gen_random_uuid(),
  country     text not null,
  state       text not null,
  city        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
```

### Step 3 — Seed Default Data

```
supabase/seed.sql
```

This creates:
- The default **Thynk Success** project/program
- A sample school entry
- An initial super admin role entry (update `user_id` to your auth user ID)

### Step 4 — Create Super Admin User

1. Go to Supabase Auth → Users → Invite user (or use `signUp`)
2. Note the user's UUID
3. Run in SQL Editor:

```sql
INSERT INTO admin_roles (user_id, school_id, role)
VALUES ('your-user-uuid-here', NULL, 'super_admin');
```

---

## Payment Gateways

The platform uses a **priority-based gateway resolver** (`lib/payment/router.ts`). For each registration:

1. The resolver checks `integration_configs` for school-specific credentials first, then falls back to global configs, then falls back to environment variables.
2. Currency determines which gateways are eligible:
   - **INR** → Cashfree, Razorpay, Easebuzz (in configured priority order)
   - **USD/Other** → PayPal, Razorpay
3. Gateways are tried in priority order; if one fails to initialise, the next is tried.

### Configuring via Admin Dashboard

1. Go to **Admin → Payment & Email**
2. Click **Setup** next to a gateway
3. Enter credentials → Save
4. Toggle **Enable** to activate

### Webhook URLs

Configure these in each gateway's dashboard:

| Gateway | Webhook URL |
|---|---|
| Razorpay | `https://www.thynksuccess.com/api/payment/webhook` |
| Cashfree | `https://www.thynksuccess.com/api/payment/webhook` |
| Easebuzz | `https://www.thynksuccess.com/api/payment/webhook` |
| PayPal | `https://www.thynksuccess.com/api/payment/webhook` |

---

## Email & WhatsApp Notifications

### How It Works

1. An event fires (e.g. `payment.paid`)
2. The trigger system checks `notification_triggers` for matching rules
3. A matching trigger points to a `notification_templates` row
4. The template is rendered with student/payment variables
5. The message is dispatched via the configured provider
6. A row is written to `notification_logs`

### Template Variables

Use `{{variable_name}}` syntax in message bodies:

| Variable | Description |
|---|---|
| `{{student_name}}` | Student's full name |
| `{{parent_name}}` | Parent's name |
| `{{school_name}}` | School name |
| `{{program_name}}` | Program name |
| `{{amount}}` | Final amount paid (formatted) |
| `{{txn_id}}` | Gateway transaction ID |
| `{{discount_code}}` | Discount code applied |
| `{{city}}` | Student's city |
| `{{class_grade}}` | Student's class/grade |

### Supported Events

| Event | Fires When |
|---|---|
| `registration.created` | Form submitted (before payment) |
| `payment.paid` | Payment confirmed |
| `payment.failed` | Payment failed |
| `payment.cancelled` | Payment cancelled |
| `discount.applied` | Discount code used |

---

## Admin Dashboard

Access at `/admin`. Login with a Supabase Auth account that has a row in `admin_roles`.

### Sections

| Section | Description |
|---|---|
| **Overview** | Revenue, conversion rate, daily chart, status breakdown |
| **Students** | Full registration table with search + filters |
| **Trends** | 30-day bar + revenue line chart |
| **Follow-Up** | List of pending/failed registrations with quick WhatsApp/Call links |
| **City Heatmap** | Visual breakdown by city — total, paid, revenue |
| **Recent Activity** | Timeline of latest registrations |
| **Programs** | Create/edit programs with INR + USD base pricing |
| **Schools** | Create/edit schools with filters by program, country, state, city |
| **Discount Codes** | Create/edit codes with expiry and usage limits |
| **Admin Users** | Add super admins or school-scoped admins |
| **Payment & Email** | Configure gateway + email + WhatsApp credentials |
| **Triggers** | Auto-fire notifications on events |
| **Message Templates** | Create email/WhatsApp drafts |
| **Location Master** | Manage the country/state/city dropdown data |

### Role Permissions

| Action | Super Admin | School Admin |
|---|---|---|
| View all schools | ✅ | ❌ (own school only) |
| Create/edit schools | ✅ | ❌ |
| Create programs | ✅ | ❌ |
| View registrations | ✅ | ✅ (own school) |
| Manage discount codes | ✅ | ✅ |
| Configure integrations | ✅ | ❌ |
| Add admin users | ✅ | ❌ |

---

## School Management

### Creating a School

1. Go to **Admin → Schools → Add School**
2. Fill in all required fields:
   - **School Code** — unique slug, used in the registration URL (e.g. `delhi-dps`)
   - **School Name** and **Organisation Name**
   - **Complete Address**, **Pin Code**, **Country**, **State**, **City**
   - **Contact Persons** — up to 4, each with Name, Designation, Email, Mobile
   - **Program** — select from active programs
   - **Registration Link** — auto-filled as `https://www.thynksuccess.com/registration/{slug}/{schoolCode}`
   - **School Pricing** — auto-filled from program base price, editable
   - **Discount Code** — defaults to school code in uppercase
   - **Branding colours** and **Active** toggle

### School Filters (Management Page)

The Schools table supports cascading filters:
- **Program** dropdown
- **Country** dropdown
- **State** dropdown (filtered by country)
- **City** dropdown (filtered by country + state)

### Registration URL

Every school's registration link is:
```
https://www.thynksuccess.com/registration/{programSlug}/{schoolCode}
```

This URL is displayed as a read-only, click-to-copy field in the school form.

---

## Location Master

Used to power the Country → State → City dropdowns across the platform.

### Managing Locations

1. Go to **Admin → Location Master**
2. Browse by country (left panel) → state tabs → cities
3. Click **+ Add Location** to add a new country, state, or city

### Adding New Countries/States

When adding a new location, both **Country** and **State** fields are dropdowns populated from existing data. A **`+` button** next to each dropdown lets you type in a new value — it is added to the form immediately and will appear in all future dropdowns once saved to the database.

---

## Registration Flow

```
Student visits:
  /registration/{programSlug}/{schoolCode}
        │
        ▼
  RegistrationCard.tsx loads school config
  via GET /api/school/{schoolCode}
        │
        ▼
  Student fills form + optionally enters discount code
  → POST /api/discount validates code
        │
        ▼
  Student submits → POST /api/register
  → Creates registration row (status: pending)
  → Initiates payment with top-priority gateway
  → Returns payment session/order
        │
        ▼
  Student completes payment on gateway page
        │
    ┌───┴───────────────────┐
    │ Redirect (verify)     │ Webhook (async)
    ▼                       ▼
  GET /api/payment/verify   POST /api/payment/webhook
  → Confirms payment        → Confirms payment
  → Updates status: paid    → Updates status: paid
  → Fires triggers          → Fires triggers
  → Redirects to success    └──────────────────
```

---

## API Reference

### Public Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/school/{code}` | Fetch school config + pricing by school code |
| `POST` | `/api/register` | Submit registration form + initiate payment |
| `POST` | `/api/discount` | Validate a discount code |
| `GET` | `/api/payment/verify` | Verify payment after gateway redirect |
| `POST` | `/api/payment/webhook` | Receive async payment confirmation from gateway |

### Admin Endpoints (requires Supabase session)

| Method | Path | Description |
|---|---|---|
| `GET/POST/PATCH/DELETE` | `/api/admin/schools` | Manage schools |
| `GET/POST/PATCH/DELETE` | `/api/admin/projects` | Manage programs |
| `GET/POST/PATCH/DELETE` | `/api/admin/discounts` | Manage discount codes |
| `GET/POST/PATCH/DELETE` | `/api/admin/integrations` | Manage payment/email/WA configs |
| `GET/POST/PATCH/DELETE` | `/api/admin/triggers` | Manage notification triggers |
| `GET/POST/PATCH/DELETE` | `/api/admin/templates` | Manage message templates |
| `GET/POST/PATCH/DELETE` | `/api/admin/location` | Manage location master |
| `GET/POST/DELETE` | `/api/admin/users` | Manage admin users |
| `GET` | `/api/admin/registrations` | Fetch all registrations |
| `GET` | `/api/admin/activity-logs` | Fetch activity log |

---

## Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
npx vercel --prod
```

Set the following in **Vercel Dashboard → Project → Settings → Environment Variables** — all the same variables from `.env.local` above, plus:

```env
NEXT_PUBLIC_APP_URL=https://www.thynksuccess.com
NEXT_PUBLIC_BACKEND_URL=https://www.thynksuccess.com
```

### vercel.json

The project includes a `vercel.json` with recommended settings. No changes needed for standard deployment.

### Custom Domain

In Vercel → Domains, add `www.thynksuccess.com` and update your DNS accordingly.

---

## Recent Updates

### v1.1 — School & Location Enhancements

**School Creation — Extended Fields**
- Added **Complete Address** (textarea) and **Pin Code** fields
- Added **Contact Persons** section: up to 4 contacts per school, each with Name, Designation, Email ID, and Mobile Number
- Contact fields are grouped and individually removable

**Base Price Display Fixed**
- School management table now correctly shows the program's base price using `base_amount_inr` (for India) or `base_amount_usd` (for international) — fixing the previous `₹0` bug
- School Price column now correctly shows `₹` or `$` based on the pricing row's currency

**Registration Link Field**
- Registration URL is now displayed as a **read-only input field** (click to select-all) inside the school form
- Auto-composed as `https://www.thynksuccess.com/registration/{programSlug}/{schoolCode}`
- Visible as soon as a program is selected and a school code is entered

**School Management Filters**
- Added cascading filter dropdowns to the Schools table: **Program**, **Country**, **State**, **City**
- Filters are cascading — State filters by selected Country; City filters by selected Country + State

**Location Master — Dropdown + Add New**
- Country and State fields in the Add Location form are now dropdowns instead of free-text inputs
- Each dropdown has a **`+` button** to add a new country or state inline — the new value is available immediately in future dropdowns after saving

**Database Columns Required**
```sql
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS pin_code        TEXT,
  ADD COLUMN IF NOT EXISTS contact_persons JSONB DEFAULT '[]'::jsonb;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS base_amount_inr INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_amount_usd INTEGER DEFAULT 0;
```

---

## Troubleshooting

### Registration page shows "School not found"
- Check the school code in the URL matches exactly what's in the `schools` table
- Confirm `is_active = true` on the school record
- Confirm the program linked to the school has `status = 'active'`

### Payment not completing
- Check Vercel function logs for errors in `/api/payment/verify` or `/api/payment/webhook`
- Confirm webhook URLs are correctly set in the payment gateway dashboard
- Check `integration_configs` has valid credentials and `is_active = true`

### Admin dashboard shows blank / redirects to login
- Confirm the logged-in user has a row in `admin_roles`
- For super admin: `school_id` must be `NULL` and `role = 'super_admin'`
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly

### Base price showing as ₹0 in school table
- Run the migration to add `base_amount_inr` / `base_amount_usd` columns to `projects`
- Run the backfill UPDATE statements to populate from `base_amount`
- Re-save the program in Admin → Programs to write both currency fields

### Discount code not applying
- Check the code exists in `discount_codes` with `is_active = true`
- Confirm the school_id on the discount code matches the school being registered for
- Check `expires_at` is null or in the future
- Check `used_count < max_uses` (or `max_uses` is null)

### Notifications not sending
- Confirm an `integration_config` exists for the provider with `is_active = true`
- Confirm a `notification_trigger` exists for the event type with a linked template
- Check `notification_logs` for `status = 'failed'` and `provider_response` for error details

---

## Contributing

1. Branch from `main`
2. Make changes
3. Test locally with `npm run dev`
4. Open a pull request with a clear description of the change

---

*Built for Thynk Success · Powered by Next.js + Supabase + Vercel*
