// app/api/admin/settings/test/route.ts
// Test email configuration by sending a real test email — via SMTP, or via
// Microsoft Graph API for Office 365 mailboxes (see lib/msgraph-email.ts for why
// Graph exists as an option: Microsoft disabled SMTP Basic Auth on most tenants).

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { verifyGraphConfig, sendViaMicrosoftGraph } from '@/lib/msgraph-email';

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

  const {
    to, smtpHost, smtpPort, smtpUser, smtpPass, fromName, fromEmail,
    // authMethod: 'smtp' (default, works for Gmail/SendGrid/most providers) or
    // 'graph' (Microsoft Graph API — recommended for Office 365 / Microsoft 365)
    authMethod,
    tenantId, clientId, clientSecret,
  } = await req.json();

  if (!to) {
    return NextResponse.json({ error: 'Recipient email address is required' }, { status: 400 });
  }

  // ── Microsoft Graph API path (recommended for Office 365) ───────────────────
  if (authMethod === 'graph') {
    if (!tenantId || !clientId || !clientSecret || !fromEmail) {
      return NextResponse.json({
        error: 'Tenant ID, Client ID, Client Secret and From Email are all required for Microsoft Graph API.',
      }, { status: 400 });
    }

    try {
      const cfg = { tenantId, clientId, clientSecret, fromEmail };
      await verifyGraphConfig(cfg);
      await sendViaMicrosoftGraph(cfg, {
        to,
        subject: '✅ Thynk Registration — Microsoft Graph Test',
        fromName: fromName ?? 'Thynk Registration',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #4f46e5;">Microsoft Graph Test Successful ✅</h2>
            <p>Your Office 365 mailbox is sending correctly via Microsoft Graph API (OAuth) — this bypasses the SMTP Basic Auth restriction entirely.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
            <p style="font-size: 12px; color: #6b7280;">
              From: ${fromEmail}<br>
              Sent at: ${new Date().toISOString()}
            </p>
          </div>
        `,
      });
      return NextResponse.json({ success: true, message: `Test email sent to ${to} via Microsoft Graph ✅` });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message ?? String(err) }, { status: 400 });
    }
  }

  // ── SMTP path (Gmail, SendGrid, generic SMTP, and Office 365 with Basic Auth still enabled) ──
  if (!smtpHost || !smtpUser || !smtpPass) {
    return NextResponse.json({ error: 'SMTP Host, Username and Password are required' }, { status: 400 });
  }

  try {
    const nodemailer = await import('nodemailer').catch(() => null);

    if (!nodemailer) {
      return NextResponse.json({
        error: 'nodemailer not installed. Run: npm install nodemailer',
      }, { status: 500 });
    }

    const port = parseInt(smtpPort ?? '587');
    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port,
      secure: port === 465,
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
    const msg = err.message ?? String(err);
    const isOffice365 = /office365|outlook/i.test(smtpHost ?? '');
    let hint = msg;

    if (isOffice365 && (msg.includes('535 5.7.139') || /SmtpClientAuthentication is disabled/i.test(msg))) {
      hint = 'Office 365 has SMTP AUTH disabled for this mailbox. In the Microsoft 365 admin center, go to the user → Mail → Manage email apps, and enable "Authenticated SMTP" for this specific mailbox. If it\'s already enabled there, your tenant likely blocks Basic Authentication entirely (Security Defaults or a Conditional Access policy) — in that case SMTP will never work here, and you should switch to the "Microsoft Graph API" option below instead, which uses OAuth and is unaffected by this restriction.';
    } else if (isOffice365 && (msg.includes('535 5.7.3') || /Authentication unsuccessful/i.test(msg))) {
      hint = 'Authentication rejected by Office 365. This is almost always the Basic Auth deprecation — Microsoft has disabled SMTP username/password sign-in on most tenants, which is also why this works fine in the Outlook desktop app (it uses OAuth, not SMTP). Use the "Microsoft Graph API" option below instead — it sends the same way Outlook does and isn\'t affected by this restriction.';
    } else if (isOffice365 && /basic authentication is disabled/i.test(msg)) {
      hint = 'Confirmed: Microsoft has disabled Basic Authentication for this mailbox/tenant. SMTP username+password can\'t work here regardless of the password being correct. Switch to the "Microsoft Graph API" auth method below — it uses OAuth (the same method Outlook desktop uses) and will work immediately once the Azure app registration is set up.';
    } else if (msg.includes('Invalid login') || msg.includes('Username and Password')) {
      hint = isOffice365
        ? 'Login rejected — for Office 365 this is usually the Basic Auth deprecation rather than a wrong password (the same account works in Outlook desktop because that uses OAuth, not SMTP). Try the "Microsoft Graph API" option below.'
        : 'Invalid credentials — for Gmail use an App Password, not your account password';
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
