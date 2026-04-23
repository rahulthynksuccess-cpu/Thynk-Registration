import * as SecureStore from 'expo-secure-store';

const BACKEND_KEY = 'thynk_backend_url';
const TOKEN_KEY = 'thynk_admin_token';

export async function getBackendUrl(): Promise<string> {
  const url = await SecureStore.getItemAsync(BACKEND_KEY);
  return url ?? '';
}

export async function setBackendUrl(url: string) {
  await SecureStore.setItemAsync(BACKEND_KEY, url.replace(/\/$/, ''));
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const base = await getBackendUrl();
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${base}${path}`, { ...options, headers });
}

// ─── Types (mirrors lib/types.ts from the web app) ───────────────────────────

export type PaymentStatus = 'pending' | 'initiated' | 'paid' | 'failed' | 'cancelled';
export type GatewayKey = 'razorpay' | 'cashfree' | 'easebuzz' | 'paypal';

export interface School {
  id: string;
  school_code: string;
  name: string;
  org_name: string;
  logo_url: string | null;
  is_active: boolean;
  status?: string;
  country?: string;
  city?: string;
  state?: string;
  created_at: string;
  project_id?: string | null;
}

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
  reg_status: string;
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

export interface Payment {
  id: string;
  registration_id: string;
  school_id: string;
  gateway: GatewayKey;
  gateway_txn_id: string | null;
  base_amount: number;
  discount_amount: number;
  final_amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export const fmtAmount = (paise: number, country?: string) => {
  const sym = (!country || country === 'India') ? '₹' : '$';
  return `${sym}${(paise / 100).toLocaleString('en-IN')}`;
};

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

export const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
