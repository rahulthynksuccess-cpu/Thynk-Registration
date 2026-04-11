import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin — Thynk SaaS' };

// Auth check is handled by middleware — no redirect here to avoid
// infinite loop on /admin/login
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
