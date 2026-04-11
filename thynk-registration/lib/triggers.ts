import { dispatchTrigger } from '@/lib/email';
import type { Registration, Payment, School, Pricing } from '@/lib/types';

/**
 * Fire after a new Registration row is inserted.
 */
export async function onRegistrationCreated(
  registration: Registration,
  school: Pick<School, 'id' | 'school_code' | 'name'>,
  pricing: Pick<Pricing, 'program_name'>,
): Promise<void> {
  await dispatchTrigger('registration.created', {
    schoolId:       school.id,
    schoolCode:     school.school_code,
    schoolName:     school.name,
    programName:    pricing.program_name,
    registrationId: registration.id,
    studentName:    registration.student_name,
    parentName:     registration.parent_name,
    contactEmail:   registration.contact_email,
    contactPhone:   registration.contact_phone,
    city:           registration.city,
    classGrade:     registration.class_grade,
    gender:         registration.gender,
  });
}

/**
 * Fire after a payment transitions to 'paid'.
 */
export async function onPaymentPaid(
  payment: Payment,
  registration: Registration,
  school: Pick<School, 'id' | 'school_code' | 'name' | 'branding'>,
  pricing: Pick<Pricing, 'program_name'>,
): Promise<void> {
  await dispatchTrigger('payment.paid', {
    schoolId:       school.id,
    schoolCode:     school.school_code,
    schoolName:     school.name,
    programName:    pricing.program_name,
    registrationId: registration.id,
    paymentId:      payment.id,
    studentName:    registration.student_name,
    parentName:     registration.parent_name,
    contactEmail:   registration.contact_email,
    contactPhone:   registration.contact_phone,
    city:           registration.city,
    classGrade:     registration.class_grade,
    gender:         registration.gender,
    gateway:        payment.gateway,
    gatewayTxnId:   payment.gateway_txn_id ?? undefined,
    baseAmount:     payment.base_amount,
    discountAmount: payment.discount_amount,
    finalAmount:    payment.final_amount,
    discountCode:   payment.discount_code ?? undefined,
    redirectUrl:    school.branding?.redirectURL,
  });
}

/**
 * Fire after a payment transitions to 'failed'.
 */
export async function onPaymentFailed(
  payment: Payment,
  registration: Registration,
  school: Pick<School, 'id' | 'school_code' | 'name'>,
  pricing: Pick<Pricing, 'program_name'>,
): Promise<void> {
  await dispatchTrigger('payment.failed', {
    schoolId:       school.id,
    schoolCode:     school.school_code,
    schoolName:     school.name,
    programName:    pricing.program_name,
    registrationId: registration.id,
    paymentId:      payment.id,
    studentName:    registration.student_name,
    parentName:     registration.parent_name,
    contactEmail:   registration.contact_email,
    contactPhone:   registration.contact_phone,
    gateway:        payment.gateway,
    finalAmount:    payment.final_amount,
  });
}
