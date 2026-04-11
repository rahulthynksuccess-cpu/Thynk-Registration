export type GatewayKey = 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal';
export type PaymentStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';
export type RegistrationStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';
export type NotificationChannel = 'email' | 'whatsapp';
export type TriggerEvent = 'registration_created' | 'payment_success' | 'payment_failed';
export type IntegrationProvider =
  | 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal'
  | 'smtp' | 'sendgrid' | 'aws_ses'
  | 'whatsapp_cloud' | 'twilio';

export interface Project {
  id: string; name: string; slug: string; domain: string | null;
  status: 'active' | 'inactive'; created_at: string;
}

export interface SchoolBranding {
  primaryColor: string; accentColor: string; redirectURL: string; programDescription?: string;
}

export interface School {
  id: string; school_code: string; name: string; org_name: string;
  logo_url: string | null; branding: SchoolBranding; is_active: boolean;
  project_id: string | null; created_at: string;
}

export interface SchoolWithPricing extends School { pricing: Pricing[]; }

export interface Pricing {
  id: string; school_id: string; program_name: string; base_amount: number;
  currency: string; gateway_sequence: GatewayKey[]; is_active: boolean;
  valid_from: string; valid_until: string | null;
}

export interface DiscountCode {
  id: string; school_id: string; code: string;
  discount_type: 'fixed' | 'percent';
  discount_amount: number; discount_value: number | null;
  max_uses: number | null; used_count: number;
  is_active: boolean; expires_at: string | null;
}

export interface Registration {
  id: string; school_id: string; pricing_id: string | null;
  student_name: string; class_grade: string; gender: string;
  parent_school: string; city: string; parent_name: string;
  contact_phone: string; contact_email: string;
  status: RegistrationStatus; created_at: string;
}

export interface Payment {
  id: string; registration_id: string; school_id: string;
  gateway: GatewayKey; gateway_txn_id: string | null;
  base_amount: number; discount_amount: number; final_amount: number;
  discount_code: string | null; status: PaymentStatus;
  gateway_response: Record<string, unknown> | null; paid_at: string | null; created_at: string;
}

export interface IntegrationConfig {
  id: string; school_id: string | null; provider: IntegrationProvider;
  config: Record<string, unknown>; priority: number; is_active: boolean; created_at: string;
}

export interface RazorpayConfig { rzp_key_id: string; mode?: 'live' | 'test'; }
export interface CashfreeConfig { cf_app_id: string; cf_mode?: 'production' | 'sandbox'; }
export interface EasebuzzConfig { eb_key: string; eb_env?: 'production' | 'test'; }
export interface PaypalConfig   { pp_client_id: string; pp_mode?: 'live' | 'sandbox'; }
export interface SmtpConfig     { host: string; port: number; user: string; from_email: string; from_name?: string; }
export interface SendgridConfig { from_email: string; from_name?: string; }
export interface AwsSesConfig   { region: string; access_key_id: string; from_email: string; from_name?: string; }
export interface WhatsappCloudConfig { phone_number_id: string; waba_id: string; }
export interface TwilioConfig   { account_sid: string; whatsapp_from: string; }

export interface NotificationTemplate {
  id: string; school_id: string | null; channel: NotificationChannel;
  name: string; subject: string | null; body: string;
  variables: string[]; is_active: boolean;
}

export interface NotificationTrigger {
  id: string; school_id: string | null; event_type: TriggerEvent;
  channel: NotificationChannel; template_id: string | null; is_active: boolean;
  notification_templates?: NotificationTemplate;
}

export interface AdminRole {
  id: string; user_id: string; school_id: string | null; project_id: string | null;
  role: 'super_admin' | 'project_admin' | 'school_admin'; created_at: string;
}

export interface AdminRow {
  id: string; created_at: string; student_name: string; class_grade: string;
  gender: string; parent_school: string; city: string; parent_name: string;
  contact_phone: string; contact_email: string; reg_status: RegistrationStatus;
  gateway: GatewayKey | null; gateway_txn_id: string | null;
  base_amount: number; discount_amount: number; final_amount: number;
  discount_code: string | null; payment_status: PaymentStatus | null;
  paid_at: string | null; school_code: string; school_name: string; program_name: string;
}

export interface RegistrationFormData {
  studentName: string; classGrade: string; gender: string;
  parentSchool: string; city: string; parentName: string;
  contactPhone: string; contactEmail: string;
}

export interface TemplateVars {
  student_name: string; parent_name: string; contact_phone: string;
  contact_email: string; class_grade: string; parent_school: string;
  city: string; school_name: string; org_name: string; program_name: string;
  amount?: string; txn_id?: string; gateway?: string; paid_at?: string; retry_link?: string;
}
