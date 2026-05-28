// app/api/admin/consultant-registrations/report/route.ts
// GET → streams a fully-formatted .xlsx with two sheets:
//   ✅ Approved Consultants  (from consultant_profiles + admin_roles)
//   ⏳ Pending Registrations (from consultant_registrations where status=pending)

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

async function requireAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['super_admin', 'admin'])
    .is('school_id', null)
    .maybeSingle();
  return data ? user : null;
}

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  indigo:      'FF4F46E5',
  indigoLite:  'FFEEF2FF',
  green:       'FF059669',
  greenLite:   'FFD1FAE5',
  amber:       'FFD97706',
  amberLite:   'FFFEF3C7',
  red:         'FFDC2626',
  teal:        'FF0D9488',
  white:       'FFFFFFFF',
  greyHd:      'FF1F2937',
  greyLite:    'FFF9FAFB',
  border:      'FFE5E7EB',
  purple:      'FF7C3AED',
};

function hdrFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function thinBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: C.border } };
  return { top: s, bottom: s, left: s, right: s };
}
function hdrFont(color = C.white, sz = 9): Partial<ExcelJS.Font> {
  return { name: 'Arial', size: sz, bold: true, color: { argb: color } };
}
function bodyFont(color = C.greyHd, bold = false): Partial<ExcelJS.Font> {
  return { name: 'Arial', size: 9, bold, color: { argb: color } };
}
function center(): Partial<ExcelJS.Alignment> {
  return { horizontal: 'center', vertical: 'middle', wrapText: true };
}
function leftAlign(): Partial<ExcelJS.Alignment> {
  return { horizontal: 'left', vertical: 'middle', wrapText: true };
}

function yesNo(val: boolean | null | undefined): string {
  if (val == null) return '—';
  return val ? '✅ Yes' : '❌ No';
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return val; }
}

function daysSince(val: string | null | undefined): number {
  if (!val) return 0;
  try { return Math.floor((Date.now() - new Date(val).getTime()) / 86400000); }
  catch { return 0; }
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();

  // ── 1. Fetch approved consultants ──────────────────────────────────────────
  const { data: profiles } = await service
    .from('consultant_profiles')
    .select(`
      user_id, consultant_code, mobile_number, pan_number, is_default_consultant,
      full_name, contact_email, contact_number, location, total_exp_years,
      domain_expertise, locations_worked, has_edu_connections, has_b2b_exp, has_b2c_exp,
      detailed_intro, experience_summary, registration_source, created_at,
      admin_roles!inner(role)
    `)
    .order('created_at', { ascending: false });

  // fetch auth user emails for name fallback
  const { data: authList } = await service.auth.admin.listUsers({ perPage: 1000 });
  const authMap: Record<string, string> = {};
  if (authList?.users) {
    authList.users.forEach((u: any) => { authMap[u.id] = u.email ?? ''; });
  }

  // approved reg dates
  const { data: approvedRegs } = await service
    .from('consultant_registrations')
    .select('consultant_user_id, created_at, reviewed_at')
    .eq('status', 'approved');
  const regMap: Record<string, { submitted: string; approved: string }> = {};
  approvedRegs?.forEach(r => {
    if (r.consultant_user_id) {
      regMap[r.consultant_user_id] = { submitted: r.created_at, approved: r.reviewed_at };
    }
  });

  // ── 2. Fetch pending registrations ────────────────────────────────────────
  const { data: pending } = await service
    .from('consultant_registrations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  // ── 3. Build workbook ─────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Thynk Success Admin';
  wb.created   = new Date();
  wb.modified  = new Date();

  const approved = profiles ?? [];
  const pendingList = pending ?? [];
  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 – SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const wsCov = wb.addWorksheet('📋 Summary');
  wsCov.views = [{ showGridLines: false }];

  // Title
  wsCov.mergeCells('A1:H1');
  wsCov.getRow(1).height = 40;
  const covTitle = wsCov.getCell('A1');
  covTitle.value     = 'THYNK SUCCESS — CONSULTANT REPORT';
  covTitle.font      = { name: 'Arial', size: 16, bold: true, color: { argb: C.white } };
  covTitle.fill      = hdrFill(C.indigo);
  covTitle.alignment = center();

  wsCov.mergeCells('A2:H2');
  wsCov.getRow(2).height = 20;
  const covSub = wsCov.getCell('A2');
  covSub.value     = `Generated on ${reportDate}  |  Confidential — Internal Use Only`;
  covSub.font      = { name: 'Arial', size: 10, italic: true, color: { argb: C.indigoLite } };
  covSub.fill      = hdrFill(C.indigo);
  covSub.alignment = center();

  // KPI row
  wsCov.getRow(4).height = 14;
  wsCov.getRow(5).height = 44;
  wsCov.getRow(6).height = 22;
  wsCov.getRow(7).height = 14;

  const approvalRate = approved.length + pendingList.length > 0
    ? Math.round(approved.length / (approved.length + pendingList.length) * 100)
    : 0;

  const kpis = [
    { col: 'B', bg: C.indigo,  fg: C.white,   label: 'TOTAL CONSULTANTS', val: approved.length + pendingList.length },
    { col: 'D', bg: C.green,   fg: C.white,   label: 'APPROVED',           val: approved.length },
    { col: 'F', bg: C.amber,   fg: C.greyHd,  label: 'PENDING REVIEW',     val: pendingList.length },
    { col: 'H', bg: C.teal,    fg: C.white,   label: 'APPROVAL RATE',      val: `${approvalRate}%` },
  ];

  for (const k of kpis) {
    const lc = wsCov.getCell(`${k.col}5`);
    const vc = wsCov.getCell(`${k.col}6`);
    lc.value     = k.label;
    lc.font      = { name: 'Arial', size: 8, bold: true, italic: true, color: { argb: k.fg } };
    lc.fill      = hdrFill(k.bg);
    lc.alignment = center();
    lc.border    = thinBorder();
    vc.value     = k.val;
    vc.font      = { name: 'Arial', size: 22, bold: true, color: { argb: k.fg } };
    vc.fill      = hdrFill(k.bg);
    vc.alignment = center();
    vc.border    = thinBorder();
  }

  // Domain breakdown
  wsCov.getRow(9).height = 22;
  wsCov.mergeCells('B9:H9');
  const domHd = wsCov.getCell('B9');
  domHd.value     = 'DOMAIN EXPERTISE BREAKDOWN (Approved Consultants)';
  domHd.font      = hdrFont(C.white, 11);
  domHd.fill      = hdrFill(C.indigo);
  domHd.alignment = center();

  wsCov.getRow(10).height = 22;
  ['B','C','D','E'].forEach((col, i) => {
    const c = wsCov.getCell(`${col}10`);
    c.value     = ['Domain','# Consultants','% of Total','Source'][i];
    c.font      = hdrFont(C.indigo);
    c.fill      = hdrFill(C.indigoLite);
    c.alignment = center();
    c.border    = thinBorder();
  });

  // Count domains
  const domCount: Record<string, number> = {};
  approved.forEach(p => {
    const doms: string[] = Array.isArray(p.domain_expertise) ? p.domain_expertise : [];
    doms.forEach(d => { domCount[d] = (domCount[d] ?? 0) + 1; });
  });
  const domEntries = Object.entries(domCount).sort((a, b) => b[1] - a[1]);

  domEntries.forEach(([dom, cnt], i) => {
    const r = 11 + i;
    wsCov.getRow(r).height = 20;
    const rowFill = i % 2 === 0 ? C.white : C.greyLite;
    const pct = approved.length > 0 ? Math.round(cnt / approved.length * 100) : 0;
    [['B', dom], ['C', cnt], ['D', `${pct}%`], ['E', cnt >= 3 ? '🔵 Active' : '🟡 Growing']].forEach(([col, val]) => {
      const c = wsCov.getCell(`${col as string}${r}`);
      c.value     = val as any;
      c.font      = col === 'B' ? bodyFont(C.greyHd) : bodyFont(C.indigo, true);
      c.fill      = hdrFill(rowFill);
      c.alignment = col === 'B' ? leftAlign() : center();
      c.border    = thinBorder();
    });
  });

  // col widths
  [['A',3],['B',34],['C',16],['D',14],['E',14],['F',14],['G',3],['H',14]].forEach(([c,w]) => {
    wsCov.getColumn(c as string).width = w as number;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 – APPROVED CONSULTANTS
  // ══════════════════════════════════════════════════════════════════════════
  const wsApp = wb.addWorksheet('✅ Approved Consultants');
  wsApp.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];

  const APP_COLS: [string, number][] = [
    ['S.No',                   5],
    ['Consultant Code',        15],
    ['Full Name',              22],
    ['Email (User ID)',        28],
    ['Contact Number',         17],
    ['Location',               20],
    ['Exp (Yrs)',               9],
    ['Domain Expertise',       36],
    ['Locations Worked',       26],
    ['Edu Connections',        13],
    ['B2B Exp',                10],
    ['B2C Exp',                10],
    ['Source',                 12],
    ['PAN Number',             14],
    ['Default Password',       16],
    ['Detailed Introduction',  40],
    ['Experience Summary',     40],
    ['Registered On',          14],
    ['Approved On',            14],
    ['Status',                 10],
  ];

  APP_COLS.forEach(([, w], i) => { wsApp.getColumn(i + 1).width = w; });

  // Title
  wsApp.mergeCells(`A1:${colLetter(APP_COLS.length)}1`);
  wsApp.getRow(1).height = 32;
  const appTitle = wsApp.getCell('A1');
  appTitle.value     = `✅  APPROVED CONSULTANTS  |  Total: ${approved.length}  |  ${reportDate}`;
  appTitle.font      = { name: 'Arial', size: 13, bold: true, color: { argb: C.white } };
  appTitle.fill      = hdrFill(C.green);
  appTitle.alignment = center();

  // Header row
  wsApp.getRow(2).height = 30;
  APP_COLS.forEach(([hdr], i) => {
    const c = wsApp.getRow(2).getCell(i + 1);
    c.value     = hdr;
    c.font      = hdrFont(C.white);
    c.fill      = hdrFill(C.indigo);
    c.alignment = center();
    c.border    = thinBorder();
  });

  // Data rows
  approved.forEach((p, ri) => {
    const r   = ri + 3;
    const row = wsApp.getRow(r);
    row.height = 46;
    const rowFill = ri % 2 === 0 ? C.white : C.greyLite;
    const email    = p.contact_email ?? authMap[p.user_id] ?? '';
    const name     = p.full_name ?? '—';
    const domains  = Array.isArray(p.domain_expertise) ? p.domain_expertise.join(', ') : '—';
    const regDates = regMap[p.user_id];

    const vals: any[] = [
      ri + 1,
      p.consultant_code ?? '—',
      name,
      email,
      p.contact_number ?? p.mobile_number ?? '—',
      p.location ?? '—',
      p.total_exp_years ?? '—',
      domains,
      p.locations_worked ?? '—',
      yesNo(p.has_edu_connections),
      yesNo(p.has_b2b_exp),
      yesNo(p.has_b2c_exp),
      p.registration_source === 'online' ? '🌐 Online' : '👤 Admin',
      p.pan_number ?? '—',
      'Thynk@1234',
      p.detailed_intro ?? '—',
      p.experience_summary ?? '—',
      regDates ? fmtDate(regDates.submitted) : fmtDate(p.created_at),
      regDates ? fmtDate(regDates.approved) : '—',
      '✅ Active',
    ];

    vals.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value     = val;
      cell.font      = bodyFont();
      cell.fill      = hdrFill(rowFill);
      cell.border    = thinBorder();
      cell.alignment = leftAlign();
    });

    // Overrides
    row.getCell(1).alignment  = center();  // S.No
    row.getCell(2).font       = bodyFont(C.indigo, true);  // Code
    row.getCell(7).alignment  = center();  // Exp
    row.getCell(15).font      = bodyFont(C.amber, true);   // Password
    row.getCell(15).fill      = hdrFill(C.amberLite);
    row.getCell(20).font      = bodyFont(C.green, true);   // Status
    row.getCell(20).fill      = hdrFill(C.greenLite);
    row.getCell(20).alignment = center();
    [10,11,12,13,20].forEach(ci => { row.getCell(ci).alignment = center(); });
  });

  // Totals
  const appTotRow = approved.length + 3;
  wsApp.mergeCells(`A${appTotRow}:R${appTotRow}`);
  wsApp.getRow(appTotRow).height = 22;
  const appTot = wsApp.getCell(`A${appTotRow}`);
  appTot.value     = `TOTAL APPROVED: ${approved.length}  |  Default Password for all: Thynk@1234`;
  appTot.font      = hdrFont(C.white, 10);
  appTot.fill      = hdrFill(C.green);
  appTot.alignment = center();
  appTot.border    = thinBorder();

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3 – PENDING REGISTRATIONS
  // ══════════════════════════════════════════════════════════════════════════
  const wsPen = wb.addWorksheet('⏳ Pending Registrations');
  wsPen.views = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];

  const PEN_COLS: [string, number][] = [
    ['S.No',                   5],
    ['Full Name',              22],
    ['Email',                  28],
    ['Contact Number',         17],
    ['Location',               20],
    ['Exp (Yrs)',               9],
    ['Domain Expertise',       36],
    ['Locations Worked',       26],
    ['Edu Connections',        13],
    ['B2B Exp',                10],
    ['B2C Exp',                10],
    ['Detailed Introduction',  40],
    ['Experience Summary',     40],
    ['Submitted On',           14],
    ['Days Pending',           12],
    ['Priority',               11],
    ['Action Required',        14],
  ];

  PEN_COLS.forEach(([, w], i) => { wsPen.getColumn(i + 1).width = w; });

  // Title
  wsPen.mergeCells(`A1:${colLetter(PEN_COLS.length)}1`);
  wsPen.getRow(1).height = 32;
  const penTitle = wsPen.getCell('A1');
  penTitle.value     = `⏳  PENDING REGISTRATIONS  |  Total: ${pendingList.length}  |  Action Required  |  ${reportDate}`;
  penTitle.font      = { name: 'Arial', size: 13, bold: true, color: { argb: C.greyHd } };
  penTitle.fill      = hdrFill(C.amber);
  penTitle.alignment = center();

  // Header row
  wsPen.getRow(2).height = 30;
  PEN_COLS.forEach(([hdr], i) => {
    const c = wsPen.getRow(2).getCell(i + 1);
    c.value     = hdr;
    c.font      = hdrFont(C.white);
    c.fill      = hdrFill(C.amber);
    c.alignment = center();
    c.border    = thinBorder();
  });

  // Data rows
  pendingList.forEach((p, ri) => {
    const r   = ri + 3;
    const row = wsPen.getRow(r);
    row.height = 46;
    const rowFill  = ri % 2 === 0 ? C.white : C.greyLite;
    const days     = daysSince(p.created_at);
    const priority = days >= 3 ? '🔴 High' : days >= 1 ? '🟡 Medium' : '🟢 New';
    const domains  = Array.isArray(p.domain_expertise) ? p.domain_expertise.join(', ') : '—';

    const vals: any[] = [
      ri + 1,
      p.full_name ?? '—',
      p.contact_email ?? '—',
      p.contact_number ?? '—',
      p.location ?? '—',
      p.total_exp_years ?? '—',
      domains,
      p.locations_worked ?? '—',
      yesNo(p.has_edu_connections),
      yesNo(p.has_b2b_exp),
      yesNo(p.has_b2c_exp),
      p.detailed_intro ?? '—',
      p.experience_summary ?? '—',
      fmtDate(p.created_at),
      days,
      priority,
      '⚡ Approve / Reject',
    ];

    vals.forEach((val, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value     = val;
      cell.font      = bodyFont();
      cell.fill      = hdrFill(rowFill);
      cell.border    = thinBorder();
      cell.alignment = leftAlign();
    });

    // Overrides
    row.getCell(1).alignment  = center();
    row.getCell(6).alignment  = center();
    [9,10,11,15,16,17].forEach(ci => { row.getCell(ci).alignment = center(); });

    // Days pending colour
    const dc = row.getCell(15);
    dc.font = bodyFont(days >= 3 ? C.red : C.amber, true);

    // Priority colour
    const pc = row.getCell(16);
    pc.font = bodyFont(days >= 3 ? C.red : days >= 1 ? C.amber : C.green, true);

    // Action
    const ac = row.getCell(17);
    ac.font = bodyFont(C.indigo, true);
    ac.fill = hdrFill(C.indigoLite);
  });

  // Totals
  const penTotRow = pendingList.length + 3;
  wsPen.mergeCells(`A${penTotRow}:O${penTotRow}`);
  wsPen.getRow(penTotRow).height = 22;
  const penTot = wsPen.getCell(`A${penTotRow}`);
  penTot.value     = `TOTAL PENDING: ${pendingList.length}  |  Please review and action within 2 business days`;
  penTot.font      = hdrFont(C.white, 10);
  penTot.fill      = hdrFill(C.amber);
  penTot.alignment = center();
  penTot.border    = thinBorder();

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 4 – NOTES
  // ══════════════════════════════════════════════════════════════════════════
  const wsNt = wb.addWorksheet('📌 Notes & Legend');
  wsNt.views = [{ showGridLines: false }];
  wsNt.getColumn(1).width = 3;
  wsNt.getColumn(2).width = 28;
  wsNt.getColumn(3).width = 60;

  wsNt.mergeCells('B1:C1');
  wsNt.getRow(1).height = 32;
  const ntTitle = wsNt.getCell('B1');
  ntTitle.value     = '📌  NOTES, LEGEND & DATA DICTIONARY';
  ntTitle.font      = { name: 'Arial', size: 13, bold: true, color: { argb: C.white } };
  ntTitle.fill      = hdrFill(C.indigo);
  ntTitle.alignment = center();

  const notes = [
    ['FIELD', 'DESCRIPTION', true],
    ['Consultant Code',    'Auto-generated on approval. Sequence from tscons102 → tscons103, tscons104…', false],
    ['Email (User ID)',    'The consultant\'s login username on the Thynk portal', false],
    ['Default Password',  'All approved consultants start with Thynk@1234 — they should change it on first login', false],
    ['Edu Connections',   'Does the consultant have existing connections with Educational Institutes?', false],
    ['B2B Experience',    'Does the consultant have Business-to-Business sales experience?', false],
    ['B2C Experience',    'Does the consultant have Business-to-Consumer sales experience?', false],
    ['Days Pending',      'Number of days since the registration was submitted (Pending sheet)', false],
    ['Priority',          '🔴 High = 3+ days pending  |  🟡 Medium = 1–2 days  |  🟢 New = submitted today', false],
    ['Domain Expertise',  'Multi-select: Academics / School Operations / Edtech Sales K12 / Edtech Sales Higher Education / Others', false],
    ['Source',            '🌐 Online = submitted via WordPress embedded form  |  👤 Admin = created manually', false],
  ] as [string, string, boolean][];

  notes.forEach(([field, desc, isHdr], i) => {
    const r = i + 3;
    wsNt.getRow(r).height = isHdr ? 22 : 20;
    const bf = wsNt.getCell(`B${r}`);
    const bc = wsNt.getCell(`C${r}`);
    bf.value = field;
    bc.value = desc;
    if (isHdr) {
      [bf, bc].forEach(c => {
        c.font = hdrFont(); c.fill = hdrFill(C.indigo); c.alignment = center(); c.border = thinBorder();
      });
    } else {
      const rf = i % 2 === 0 ? C.white : C.greyLite;
      bf.font = bodyFont(C.indigo, true); bc.font = bodyFont();
      [bf, bc].forEach(c => { c.fill = hdrFill(rf); c.alignment = leftAlign(); c.border = thinBorder(); });
    }
  });

  // Tab colours
  wsCov.addConditionalFormatting({ ref: 'A1', rules: [] });
  wsApp.addConditionalFormatting({ ref: 'A1', rules: [] });

  // ── Stream response ───────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const filename = `Thynk_Consultant_Report_${new Date().toISOString().slice(0,10)}.xlsx`;

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String((buf as unknown as Buffer).byteLength),
    },
  });
}
