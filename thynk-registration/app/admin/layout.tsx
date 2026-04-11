import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin — Thynk SaaS' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // /admin/login is public — only guard everything else
  // (middleware already redirects, this is a safety net)
  if (!user) redirect('/admin/login');

  return <>{children}</>;
}
