// app/api/admin/settings/test/route.ts
// Test SMTP email configuration by sending a real test email

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service.from('admin_roles').select('role,school_id').eq('user_id', user.id).single();
  return data ? { user, role: data } : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { to, smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail } = await req.json();

  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'SMTP Host, Username and Password are required' }, { status: 400 });
  }
  if (!to) {
    return NextResponse.json({ error: 'Recipient email address is required' }, { status: 400 });
  }

  try {
    // Use nodemailer if available, otherwise use direct SMTP via fetch to a test service
    // Since we can't install nodemailer at runtime, we use the Gmail API approach
    // For Gmail SMTP: verify credentials by attempting SMTP AUTH via direct TCP isn't feasible
    // Instead, use the nodemailer-like approach via dynamic import

    const nodemailer = await import('nodemailer').catch(() => null);

    if (!nodemailer) {
      return NextResponse.json({
        error: 'nodemailer not installed. Run: npm install nodemailer',
      }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   parseInt(smtpPort ?? '587'),
      secure: parseInt(smtpPort ?? '587') === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: { rejectUnauthorized: false },
    });

    // Verify connection first
    await transporter.verify();

    // Send test email
    await transporter.sendMail({
      from:    `"${fromName ?? 'Thynk Registration'}" <${fromEmail || smtpUser}>`,
      to,
      subject: '✅ Thynk Registration — SMTP Test',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #4f46e5;">SMTP Test Successful ✅</h2>
          <p>Your email configuration is working correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
          <p style="font-size: 12px; color: #6b7280;">
            Host: ${smtpHost}:${smtpPort ?? 587}<br>
            User: ${smtpUser}<br>
            Sent at: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: `Test email sent to ${to} ✅` });

  } catch (err: any) {
    // Parse common SMTP errors into helpful messages
    const msg = err.message ?? String(err);
    let hint = msg;

    if (msg.includes('Invalid login') || msg.includes('Username and Password')) {
      hint = 'Invalid credentials — for Gmail use an App Password, not your account password';
    } else if (msg.includes('ECONNREFUSED')) {
      hint = `Cannot connect to ${smtpHost}:${smtpPort} — check host and port`;
    } else if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
      hint = 'Connection timed out — check host, port, and firewall settings';
    } else if (msg.includes('self signed') || msg.includes('certificate')) {
      hint = 'SSL certificate error — try port 587 with STARTTLS instead of 465';
    } else if (msg.includes('Less secure')) {
      hint = 'Gmail requires an App Password — go to Google Account → Security → App Passwords';
    }

    return NextResponse.json({ success: false, error: hint }, { status: 400 });
  }
}
