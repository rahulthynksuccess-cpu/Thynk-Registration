// lib/msgraph-email.ts
//
// Sends email from a Microsoft 365 / Office 365 mailbox via the Microsoft
// Graph API, using an Azure AD "app-only" (client credentials) token.
//
// WHY THIS EXISTS
// ─────────────────────────────────────────────────────────────────────────
// Microsoft has disabled Basic Authentication for SMTP AUTH on essentially
// all Microsoft 365 tenants (final enforcement completed through 2022–2023).
// That's why:
//   - Testing the same Office 365 mailbox via SMTP username + password fails
//     with an auth error, no matter how correct the password is.
//   - The exact same account works fine in the Outlook *desktop* app —
//     because Outlook desktop always authenticates with OAuth2 ("Modern
//     Auth"), never with a raw username/password over SMTP.
//
// The permanent fix is to stop using SMTP for this mailbox and instead call
// the Microsoft Graph API's sendMail endpoint, authenticating with an Azure
// AD App Registration (client ID + client secret + tenant ID) that has been
// granted the `Mail.Send` **Application** permission with admin consent.
// This has nothing to do with the mailbox's own password or MFA status.
//
// ONE-TIME AZURE SETUP (done once, in the Azure Portal — no code/CLI needed):
//   1. https://portal.azure.com → Azure Active Directory → App registrations
//      → "New registration". Any name, e.g. "Thynk Registration Mailer".
//   2. Copy the "Application (client) ID" and "Directory (tenant) ID" shown
//      on the app's Overview page.
//   3. Certificates & secrets → "New client secret" → copy the secret VALUE
//      immediately (it's hidden after you leave the page).
//   4. API permissions → Add a permission → Microsoft Graph → Application
//      permissions → search "Mail.Send" → add it.
//   5. Still on API permissions → click "Grant admin consent for <tenant>"
//      (requires a Global/Exchange admin — this is the step that actually
//      allows the app to send mail without a signed-in user).
//   6. Paste Tenant ID / Client ID / Client Secret into the integrations
//      page here, choose "Microsoft Graph API" as the auth method, and set
//      "From email" to the exact Office 365 mailbox to send as (that
//      mailbox must exist and be licensed for Exchange Online).
//
// If step 5 (admin consent) is skipped, every send will fail with a 403
// "Application is not authorized" error — that's the most common setup
// mistake and is worth checking first if sends fail after configuring this.

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  fromEmail: string; // the O365 mailbox to send as, e.g. notifications@yourschool.com
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}

async function getGraphToken(cfg: GraphConfig): Promise<string> {
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }),
    }
  );

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok) {
    const errDesc: string = tokenData?.error_description || tokenData?.error || 'Unknown error';
    // Give a targeted hint for the most common Azure setup mistakes.
    if (errDesc.includes('AADSTS7000215') || errDesc.includes('invalid client secret')) {
      throw new Error('Invalid client secret — it may have expired or been copied incorrectly. Generate a new one under Certificates & secrets in the Azure app registration.');
    }
    if (errDesc.includes('AADSTS700016') || errDesc.includes('was not found in the directory')) {
      throw new Error('Client ID not found in this tenant — double-check the Application (client) ID and Directory (tenant) ID.');
    }
    if (errDesc.includes('AADSTS90002')) {
      throw new Error('Tenant ID not found — double-check the Directory (tenant) ID from the Azure app registration Overview page.');
    }
    throw new Error(`Microsoft login failed: ${errDesc}`);
  }

  return tokenData.access_token as string;
}

export async function verifyGraphConfig(cfg: GraphConfig): Promise<void> {
  // A token fetch alone proves the App Registration + secret + tenant are all
  // correct; this is the Graph equivalent of transporter.verify() for SMTP.
  await getGraphToken(cfg);
}

export async function sendViaMicrosoftGraph(cfg: GraphConfig, args: SendArgs): Promise<void> {
  const token = await getGraphToken(cfg);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.fromEmail)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: args.subject,
          body: { contentType: 'HTML', content: args.html },
          toRecipients: [{ emailAddress: { address: args.to } }],
          from: { emailAddress: { address: cfg.fromEmail, name: args.fromName || undefined } },
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const code = errBody?.error?.code || '';
    const message = errBody?.error?.message || res.statusText;

    if (res.status === 403 || code === 'ErrorAccessDenied' || code === 'Authorization_RequestDenied') {
      throw new Error(
        `Permission denied (${code || res.status}) — the Azure app registration needs the "Mail.Send" Application permission ` +
        `with admin consent granted, and "${cfg.fromEmail}" must be a real, licensed mailbox in this tenant.`
      );
    }
    if (res.status === 404) {
      throw new Error(`Mailbox "${cfg.fromEmail}" was not found in this Microsoft 365 tenant — check the From email address.`);
    }
    throw new Error(`Microsoft Graph sendMail failed (${res.status} ${code}): ${message}`);
  }
}
