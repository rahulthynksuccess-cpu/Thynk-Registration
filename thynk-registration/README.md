# Thynk Success — Multi-Tenant School Admission Platform

A reusable, multi-tenant school admission and payment platform built with Next.js, Supabase, and Vercel.
Live registration always at **www.thynksuccess.com**.

## Stack

- **Frontend + API**: Next.js 14 (App Router) on Vercel
- **Database + Auth**: Supabase (Postgres + Row Level Security)
- **Payments**: Razorpay, Cashfree, Easebuzz (all three, school-configurable)
- **Styling**: Tailwind CSS

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/your-org/thynk-saas
cd thynk-saas
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration: **Supabase Dashboard → SQL Editor → paste `supabase/migrations/001_init.sql`**
3. Run the seed: paste `supabase/seed.sql` (creates Thynk Success school at `/thynk`)

### 3. Configure environment

```bash
cp .env.example .env.local
# Set NEXT_PUBLIC_APP_URL=https://www.thynksuccess.com for production
# Fill in all Supabase and payment gateway keys
```

### 4. Run locally

```bash
npm run dev
# Registration: http://localhost:3000/thynk
# Admin:        http://localhost:3000/admin
```

### 5. Deploy to Vercel

```bash
npx vercel --prod
# Set NEXT_PUBLIC_APP_URL=https://www.thynksuccess.com in Vercel environment variables
```

## Live URLs (Production)

| Page | URL |
|------|-----|
| Registration | https://www.thynksuccess.com/thynk |
| Admin Dashboard | https://www.thynksuccess.com/admin |

## Project Structure

```
thynk-saas/
├── app/
│   ├── [schoolCode]/          # Dynamic registration — e.g. /thynk
│   │   ├── page.tsx
│   │   └── success/page.tsx
│   ├── admin/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── page.tsx
│   └── api/
│       ├── school/[code]/route.ts
│       ├── register/route.ts
│       ├── discount/route.ts
│       └── payment/
│           ├── verify/route.ts
│           └── webhook/route.ts
├── components/
│   └── registration/RegistrationCard.tsx
├── lib/
│   ├── supabase/
│   └── payment/
├── middleware.ts
└── supabase/
    ├── migrations/001_init.sql
    └── seed.sql
```

## Adding a New Program

1. Log in to `/admin` as super admin
2. Click "Add School"
3. Fill in school code, program name, base amount, gateways, branding
4. Share: `www.thynksuccess.com/{schoolCode}`

## Environment Variables

See `.env.example` for all required variables. Payment keys are stored server-side only — never exposed to the browser.
