# Thynk SaaS v2 — Multi-Project School Admission Platform

A fully dynamic, multi-tenant SaaS platform for school admission funnels.
Zero hardcoding. Everything controlled via Admin Panel.

## Stack
- **Frontend + API**: Next.js 14 (App Router) on Vercel
- **Database + Auth**: Supabase (Postgres + RLS)
- **Payments**: Razorpay, Cashfree, Easebuzz, PayPal (priority-routed from DB)
- **Notifications**: Email (SMTP/SendGrid/SES) + WhatsApp (Cloud API/Twilio)
- **Styling**: Tailwind CSS

## What's New in v2
- **Projects layer** — group multiple schools under a project
- **Integration configs** — all gateway/email/WA keys managed in DB (no hardcoding)
- **Trigger engine** — auto-send email/WA on registration + payment events
- **Template system** — create reusable message templates with `{{variables}}`
- **Activity log** — full admin audit trail
- **% discounts** — discount codes now support fixed or percentage types
- **PayPal** — international payment support

## Quick Start

### 1. Clone & install
```bash
git clone https://github.com/your-org/thynk-saas
cd thynk-saas
npm install
```

### 2. Set up Supabase
1. Create project at [supabase.com](https://supabase.com)
2. Run migrations in order:
   - `supabase/migrations/001_init.sql`
   - `supabase/migrations/002_saas_upgrade.sql`
3. Run seed: `supabase/seed.sql`

### 3. Configure environment
```bash
cp .env.example .env.local
# Fill in Supabase keys, payment gateway keys, email/WA credentials
```

### 4. Run locally
```bash
npm run dev
# Registration: http://localhost:3000/thynk
# Admin:        http://localhost:3000/admin
```

## Admin Panel Modules

| Module | Role | Purpose |
|--------|------|---------|
| Overview | All | Revenue, stats, charts |
| Students | All | Full registration table with filters |
| Trends | All | 30-day trend charts |
| Analytics | All | Demographics, cities, schools |
| Follow-Up | All | Pending payments tracker |
| City Heatmap | All | Geographic distribution |
| Projects | Super Admin | Create/manage top-level projects |
| Schools | Super Admin | Create/manage schools under projects |
| Pricing | Admin+ | Set program fees per school |
| Discounts | Admin+ | Fixed + % discount codes |
| Admin Users | Super Admin | Invite school admins |
| **Integrations** | Admin+ | Manage gateway/email/WA configs + test |
| **Triggers** | Admin+ | Auto-fire notifications on events |
| **Templates** | Admin+ | Email + WhatsApp message templates |
| **Activity Log** | Super Admin | Full audit trail |

## Project Structure

```
thynk-saas/
├── app/
│   ├── [schoolCode]/              # Public registration page
│   ├── admin/
│   │   ├── page.tsx               # Full admin dashboard (all modules)
│   │   └── login/
│   └── api/
│       ├── admin/
│       │   ├── projects/          # NEW: project CRUD
│       │   ├── schools/           # Updated: project_id support
│       │   ├── integrations/      # NEW: gateway/email/WA config
│       │   │   └── test/          # NEW: test integration endpoint
│       │   ├── triggers/          # NEW: notification triggers
│       │   ├── templates/         # NEW: message templates
│       │   ├── activity-logs/     # NEW: audit log
│       │   ├── pricing/
│       │   ├── discounts/         # Updated: % discounts
│       │   ├── registrations/
│       │   └── users/
│       ├── register/              # Updated: trigger engine + gateway router
│       └── payment/
│           ├── verify/            # Updated: fires triggers on payment
│           └── webhook/
├── lib/
│   ├── payment/
│   │   ├── router.ts              # NEW: priority-based gateway resolver
│   │   ├── razorpay.ts
│   │   ├── cashfree.ts
│   │   └── easebuzz.ts
│   ├── triggers/
│   │   └── fire.ts                # NEW: trigger + notification engine
│   ├── activity.ts                # NEW: activity log helper
│   └── types.ts                   # Updated: all new types
└── supabase/
    ├── migrations/
    │   ├── 001_init.sql
    │   └── 002_saas_upgrade.sql   # NEW: projects, integrations, triggers
    └── seed.sql
```

## Environment Variables
See `.env.example` for all required variables.
Gateway/email/WA secrets can be set either in `.env` (global fallback) OR
in the Admin → Integrations panel per school (overrides .env).
