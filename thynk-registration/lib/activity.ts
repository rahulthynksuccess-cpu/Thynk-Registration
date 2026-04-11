import { createServiceClient } from '@/lib/supabase/server';

export async function logActivity(opts: {
  userId?: string;
  schoolId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  const supabase = createServiceClient();
  await supabase.from('activity_logs').insert({
    user_id:     opts.userId    ?? null,
    school_id:   opts.schoolId  ?? null,
    action:      opts.action,
    entity_type: opts.entityType ?? null,
    entity_id:   opts.entityId   ?? null,
    metadata:    opts.metadata   ?? {},
    ip_address:  opts.ipAddress  ?? null,
  });
}
