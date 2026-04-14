export type GatewayKey = 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal';
export type PaymentStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';
export type RegistrationStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';

export interface SchoolBranding {
  primaryColor: string;
  accentColor: string;
  redirectURL: string;
  programDescription?: string;
}

export interface SchoolGatewayConfig {
  rzp_key_id?: string;
  cf_mode?: 'production' | 'sandbox';
  eb_env?: 'production' | 'test';
}

export interface School {
  id: string;
  school_code: string;
  name: string;
  org_name: string;
  logo_url: string | null;
  branding: SchoolBranding;
  gateway_config: SchoolGatewayConfig;
  is_active: boolean;
  project_id?: string | null;
  created_at: string;
  country?: string;
  city?: string;
  state?: string;
  status?: string;
}

export interface Pricing {
  id: string;
  school_id: string;
  program_name: string;
  base_amount: number;      // in paise
  currency: string;
  gateway_sequence: GatewayKey[];
  is_active: boolean;
}

export interface SchoolWithPricing extends School {
  pricing: Pricing[];
}

export interface DiscountCode {
  id: string;
  school_id: string;
  code: string;
  discount_amount: number;  // in paise
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  expires_at: string | null;
}

export interface Registration {
  id: string;
  school_id: string;
  pricing_id: string | null;
  student_name: string;
  class_grade: string;
  gender: string;
  parent_school: string;
  city: string;
  parent_name: string;
  contact_phone: string;
  contact_email: string;
  status: RegistrationStatus;
  created_at: string;
}

export interface Payment {
  id: string;
  registration_id: string;
  school_id: string;
  gateway: GatewayKey;
  gateway_txn_id: string | null;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  discount_code: string | null;
  status: PaymentStatus;
  gateway_response: Record<string, unknown> | null;
  paid_at: string | null;
  created_at: string;
}

// Flat row shape used in admin dashboard (join of registration + payment)
export interface AdminRow {
  id: string;
  created_at: string;
  student_name: string;
  class_grade: string;
  gender: string;
  parent_school: string;
  city: string;
  parent_name: string;
  contact_phone: string;
  contact_email: string;
  reg_status: RegistrationStatus;
  gateway: GatewayKey | null;
  gateway_txn_id: string | null;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  discount_code: string | null;
  payment_status: PaymentStatus | null;
  paid_at: string | null;
  school_code: string;
  school_name: string;
  program_name: string;
}

// Registration form data (collected client-side)
export interface RegistrationFormData {
  studentName: string;
  classGrade: string;
  gender: string;
  parentSchool: string;
  city: string;
  parentName: string;
  contactPhone: string;
  contactEmail: string;
}

// ── Trigger / Email types ─────────────────────────────────────────
export type TriggerEvent =
  | 'registration.created'
  | 'payment.paid'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'discount.applied'
  | 'school.registered'
  | 'school.approved';

/**
 * Template variable keys MUST be snake_case to match:
 *   1. The keys returned by buildTemplateVars() in lib/triggers/fire.ts
 *   2. The {{variable}} placeholders used in notification_templates.body / .subject
 *
 * Do NOT use camelCase here — it caused triggers to fire but emails/WhatsApp
 * to send to empty recipients and templates to render unreplaced {{placeholders}}.
 */
export interface TemplateVars {
  // Registration fields
  student_name?: string;
  parent_name?: string;
  contact_email?: string;
  contact_phone?: string;
  class_grade?: string;
  gender?: string;
  parent_school?: string;
  city?: string;

  // School / program
  school_name?: string;
  org_name?: string;
  program_name?: string;

  // Payment
  amount?: string;          // formatted e.g. "₹5,000"
  txn_id?: string;
  gateway?: string;
  paid_at?: string;

  // Utility
  retry_link?: string;      // populated for payment.failed event

  [key: string]: any;
}
