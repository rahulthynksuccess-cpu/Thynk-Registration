import { createServiceClient } from '@/lib/supabase/server';

export interface CreateNotificationOpts {
  schoolId?:   string | null;
  audience:    'admin' | 'school' | 'both';
  type:        'info' | 'success' | 'warning' | 'alert' | 'document';
  title:       string;
  message:     string;
  entityType?: string;
  entityId?:   string;
  createdBy?:  string;
}

/**
 * Creates a dashboard_notification record.
 * Call this from any API route or trigger that should surface an in-app alert.
 *
 * Examples:
 *   document.uploaded  → audience: 'both',   type: 'document'
 *   payment.paid       → audience: 'admin',   type: 'success'
 *   data pattern upd.  → audience: 'admin',   type: 'info'
 *   admin manual alert → audience: 'school',  type: 'alert'
 */
export async function createDashboardNotification(opts: CreateNotificationOpts) {
  const service = createServiceClient();

  const { data, error } = await service
    .from('dashboard_notifications')
    .insert({
      school_id:   opts.schoolId  ?? null,
      audience:    opts.audience,
      type:        opts.type,
      title:       opts.title,
      message:     opts.message,
      entity_type: opts.entityType ?? null,
      entity_id:   opts.entityId   ?? null,
      created_by:  opts.createdBy  ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[createDashboardNotification] error:', error.message);
    return null;
  }

  return data;
}

/**
 * Convenience wrappers for common system events.
 * Import and call these from the relevant API routes.
 */

export async function notifyDocumentUploaded(opts: {
  schoolId: string;
  fileName: string;
  category: string;
  documentId: string;
  createdBy: string;
}) {
  return createDashboardNotification({
    schoolId:   opts.schoolId,
    audience:   'both',
    type:       'document',
    title:      '📎 New Document Available',
    message:    `A new ${opts.category} document "${opts.fileName}" has been uploaded for your review.`,
    entityType: 'document',
    entityId:   opts.documentId,
    createdBy:  opts.createdBy,
  });
}

export async function notifyPaymentReceived(opts: {
  schoolId: string;
  studentName: string;
  amount: string;
  registrationId: string;
}) {
  return createDashboardNotification({
    schoolId:   opts.schoolId,
    audience:   'admin',
    type:       'success',
    title:      '💰 Payment Received',
    message:    `${opts.studentName} paid ${opts.amount} successfully.`,
    entityType: 'registration',
    entityId:   opts.registrationId,
  });
}

export async function notifyNewRegistration(opts: {
  schoolId: string;
  studentName: string;
  registrationId: string;
}) {
  return createDashboardNotification({
    schoolId:   opts.schoolId,
    audience:   'admin',
    type:       'info',
    title:      '📋 New Registration',
    message:    `${opts.studentName} has registered.`,
    entityType: 'registration',
    entityId:   opts.registrationId,
  });
}

export async function notifyDataPatternUpdate(opts: {
  schoolId?: string;
  fieldName: string;
  description: string;
  updatedBy: string;
}) {
  return createDashboardNotification({
    schoolId:   opts.schoolId ?? null,
    audience:   'admin',
    type:       'info',
    title:      '🔄 Data Pattern Updated',
    message:    `${opts.fieldName}: ${opts.description}`,
    entityType: 'settings',
    createdBy:  opts.updatedBy,
  });
}

export async function notifySchoolApproved(opts: {
  schoolId: string;
  schoolName: string;
}) {
  return createDashboardNotification({
    schoolId:   opts.schoolId,
    audience:   'school',
    type:       'success',
    title:      '✅ School Account Approved',
    message:    `Your school "${opts.schoolName}" has been approved and is now active.`,
    entityType: 'school',
    entityId:   opts.schoolId,
  });
}
