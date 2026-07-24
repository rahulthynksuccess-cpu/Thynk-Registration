import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code     = searchParams.get('code')?.toUpperCase().trim();
  const schoolId = searchParams.get('schoolId');

  if (!code || !schoolId) {
    return NextResponse.json({ valid: false, message: 'Missing code or schoolId' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const { data: school } = await supabase.from('schools').select('project_id').eq('id', schoolId).single();

  const { data: matches } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .or(`school_id.eq.${schoolId}${school?.project_id ? `,project_id.eq.${school.project_id}` : ''}`);

  const data = matches?.find(m => m.school_id === schoolId) ?? matches?.find(m => m.project_id === school?.project_id);

  if (!data) {
    return NextResponse.json({ valid: false, message: 'Invalid or expired discount code.' });
  }

  // Check expiry
  if (data.expires_at && data.expires_at < now) {
    return NextResponse.json({ valid: false, message: 'This discount code has expired.' });
  }

  // Check usage limit
  if (data.max_uses !== null && data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, message: 'This discount code has reached its usage limit.' });
  }

  return NextResponse.json({
    valid: true,
    discount_amount: data.discount_amount,          // in paise
    discount_rupees: data.discount_amount / 100,    // for display
    message: `Discount of ₹${data.discount_amount / 100} applied!`,
  });
}
