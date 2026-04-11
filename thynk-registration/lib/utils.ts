// Format paise to ₹ string: 120000 → "1,200"
export function formatAmount(paise: number): string {
  return (paise / 100).toLocaleString('en-IN');
}

// Format paise to display string: 120000 → "₹1,200"
export function displayAmount(paise: number, currency = 'INR'): string {
  const symbol = currency === 'USD' ? '$' : '₹';
  return symbol + formatAmount(paise);
}

// INR to paise
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

// Paise to rupees
export function toRupees(paise: number): number {
  return paise / 100;
}

// Generate a transaction ID
export function generateTxnId(prefix = 'TXN'): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

// Phone validation — accept any non-empty number (supports international)
export function isValidPhone(phone: string): boolean {
  return phone.trim().length > 0;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Safe HTML escape
export function escHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
