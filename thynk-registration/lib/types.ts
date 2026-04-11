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
  created_at: string;
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
  | 'discount.applied';

export interface TemplateVars {
  studentName?: string;
  parentName?: string;
  contactEmail?: string;
  contactPhone?: string;
  schoolName?: string;
  programName?: string;
  city?: string;
  classGrade?: string;
  gender?: string;
  baseAmount?: number;
  discountAmount?: number;
  finalAmount?: number;
  discountCode?: string;
  gateway?: string;
  gatewayTxnId?: string;
  schoolCode?: string;
  registrationId?: string;
  paymentId?: string;
  redirectUrl?: string;
  [key: string]: any;
}
