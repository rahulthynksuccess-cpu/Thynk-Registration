// app/api/grades/route.ts
// PUBLIC endpoint — no auth required
// Returns allowed grades for a given project slug, falling back to all active grades

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectSlug = searchParams.get('project') || '';

  const supabase = createServiceClient();

  if (projectSlug) {
    const { data: project } = await supabase
      .from('projects')
      .select('allowed_grades')
      .eq('slug', projectSlug)
      .single();

    if (project?.allowed_grades?.length) {
      return NextResponse.json({ grades: project.allowed_grades });
    }
  }

  // Fall back to all active grades from the grades table
  const { data: grades } = await supabase
    .from('grades')
    .select('name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  return NextResponse.json({ grades: (grades ?? []).map((g: any) => g.name) });
}
