// ─────────────────────────────────────────────────────────────────────────────
// PATCH INSTRUCTIONS for app/api/payment/verify/route.ts
//
// After a successful payment confirmation, add these two calls.
// Find the section where payment status is set to 'paid' and insert below it.
// ─────────────────────────────────────────────────────────────────────────────

// Add this import at the top of the file:
import { notifyPaymentReceived, notifyNewRegistration } from '@/lib/notifications';

// ── Inside the POST handler, after you update payment status to 'paid' ────────
// Locate the block that does something like:
//   await service.from('payments').update({ status: 'paid', paid_at: new Date() })...
// and add BELOW it:

  // 🔔 Dashboard notification — payment received
  if (paymentStatus === 'paid' && registration) {
    const amountFormatted = `₹${((finalAmount ?? 0) / 100).toLocaleString('en-IN')}`;
    await notifyPaymentReceived({
      schoolId:       registration.school_id,
      studentName:    registration.student_name,
      amount:         amountFormatted,
      registrationId: registration.id,
    });
  }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH INSTRUCTIONS for app/api/register/route.ts
//
// After a new registration is created, fire a notification:
// ─────────────────────────────────────────────────────────────────────────────

// Add import at top:
import { notifyNewRegistration } from '@/lib/notifications';

// After:
//   const { data: newReg } = await service.from('registrations').insert(...).select().single();
// Add:

  if (newReg) {
    await notifyNewRegistration({
      schoolId:       newReg.school_id,
      studentName:    newReg.student_name,
      registrationId: newReg.id,
    }).catch(() => {}); // Non-blocking
  }

// ─────────────────────────────────────────────────────────────────────────────
// PATCH INSTRUCTIONS for app/api/admin/schools/approve/route.ts
//
// After a school is approved, notify the school dashboard:
// ─────────────────────────────────────────────────────────────────────────────

// Add import at top:
import { notifySchoolApproved } from '@/lib/notifications';

// After the approval update succeeds, add:

  await notifySchoolApproved({
    schoolId:   schoolId,
    schoolName: school.name,
  }).catch(() => {});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH INSTRUCTIONS for app/api/admin/settings/route.ts  (or wherever
// pricing / data patterns are updated)
//
// After any pricing or branding update, fire a data-pattern notification:
// ─────────────────────────────────────────────────────────────────────────────

// Add import at top:
import { notifyDataPatternUpdate } from '@/lib/notifications';

// After a successful PATCH/PUT to pricing or branding, add:

  await notifyDataPatternUpdate({
    schoolId:    updatedSchoolId,   // or undefined for global
    fieldName:   'Pricing',         // or 'Branding', 'Gateway Config', etc.
    description: `Updated by admin`,
    updatedBy:   user.id,
  }).catch(() => {});
