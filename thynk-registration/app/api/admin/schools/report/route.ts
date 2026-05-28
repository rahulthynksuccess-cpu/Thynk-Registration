// app/api/admin/schools/report/route.ts
// GET ?type=approved|pending|all
// Returns a formatted .xlsx with:
//   📋 Summary
//   ✅ Approved Schools
//   ⏳ Pending Approval Queue
//   📌 Notes & Legend

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

function colLetter(n: number): string {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

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

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  indigo:     'FF4F46E5', indigoLite: 'FFEEF2FF',
  green:      'FF059669', greenLite:  'FFD1FAE5',
  amber:      'FFD97706', amberLite:  'FFFEF3C7',
  red:        'FFDC2626', redLite:    'FFFEE2E2',
  teal:       'FF0D9488', tealLite:   'FFCCFBF1',
  purple:     'FF7C3AED',
  white:      'FFFFFFFF', greyHd:     'FF1F2937',
  greyMid:    'FF6B7280', greyLite:   'FFF9FAFB',
  border:     'FFE5E7EB',
};

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}
function tb(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: C.border } };
  return { top: s, bottom: s, left: s, right: s };
}
function hf(argb = C.white, sz = 9): Partial<ExcelJS.Font> {
  return { name: 'Arial', size: sz, bold: true, color: { argb } };
}
function bf(argb = C.greyHd, bold = false, sz = 9): Partial<ExcelJS.Font> {
  return { name: 'Arial', size: sz, bold, color: { argb } };
}
const CA: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
const LA: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle', wrapText: true };

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return v; }
}
function fmtAmt(paise: number | null | undefined): string {
  if (!paise) return '—';
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}
function daysSince(v: string | null | undefined): number {
  if (!v) return 0;
  try { return Math.floor((Date.now() - new Date(v).getTime()) / 86400000); } catch { return 0; }
}

// ═════════════════════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'all';   // approved | pending | all

  // ── Fetch schools ─────────────────────────────────────────────────────────
  const { data: allSchools } = await service
    .from('schools')
    .select(`
      id, name, school_code, status, city, state, country,
      contact_email, contact_phone, principal_name,
      address, board, school_type, student_count,
      project_slug, program_name,
      pan_number, gst_number,
      consultant_id, consultant_code,
      final_amount, payment_status, payment_date,
      created_at, updated_at, approved_at,
      registration_number, website
    `)
    .order('created_at', { ascending: false });

  const schools = allSchools ?? [];

  // Fetch programs for name lookup
  const { data: programs } = await service
    .from('programs')
    .select('id, name, slug');
  const progMap: Record<string, string> = {};
  (programs ?? []).forEach((p: any) => { progMap[p.slug] = p.name; progMap[p.id] = p.name; });

  // Fetch consultant names
  const { data: consultantProfiles } = await service
    .from('consultant_profiles')
    .select('user_id, consultant_code, full_name');
  const consMap: Record<string, string> = {};
  (consultantProfiles ?? []).forEach((c: any) => {
    if (c.consultant_code) consMap[c.consultant_code] = c.full_name ?? c.consultant_code;
    if (c.user_id) consMap[c.user_id] = c.full_name ?? c.consultant_code ?? c.user_id;
  });

  const approvedList = schools.filter(s => s.status === 'approved' || !s.status);
  const pendingList  = schools.filter(s => s.status && s.status !== 'approved');

  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── Build workbook ────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Thynk Success Admin';
  wb.created  = new Date();
  wb.modified = new Date();

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 – SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  const wsCov = wb.addWorksheet('📋 Summary');
  wsCov.views = [{ showGridLines: false }];
  wsCov.properties.tabColor = { argb: C.indigo };

  // Title
  wsCov.mergeCells('A1:J1');
  wsCov.getRow(1).height = 42;
  const ct = wsCov.getCell('A1');
  ct.value = 'THYNK SUCCESS — SCHOOL REPORT';
  ct.font  = { name: 'Arial', size: 18, bold: true, color: { argb: C.white } };
  ct.fill  = solidFill(C.indigo);
  ct.alignment = CA;

  wsCov.mergeCells('A2:J2');
  wsCov.getRow(2).height = 20;
  const cs = wsCov.getCell('A2');
  cs.value = `Generated on ${reportDate}  |  Confidential — Internal Use Only`;
  cs.font  = { name: 'Arial', size: 10, italic: true, color: { argb: C.indigoLite } };
  cs.fill  = solidFill(C.indigo);
  cs.alignment = CA;

  // KPI row
  wsCov.getRow(4).height = 14;
  wsCov.getRow(5).height = 42;
  wsCov.getRow(6).height = 22;

  const paidSchools = approvedList.filter(s => s.payment_status === 'paid');
  const totalRev    = paidSchools.reduce((sum, s) => sum + (s.final_amount ?? 0), 0);

  const kpis = [
    { cols: 'B:C', bg: C.indigo, fg: C.white,   label: 'TOTAL SCHOOLS',  val: schools.length },
    { cols: 'D:E', bg: C.green,  fg: C.white,   label: 'APPROVED',        val: approvedList.length },
    { cols: 'F:G', bg: C.amber,  fg: C.greyHd,  label: 'PENDING REVIEW',  val: pendingList.length },
    { cols: 'H:I', bg: C.teal,   fg: C.white,   label: 'PAID SCHOOLS',    val: paidSchools.length },
    { cols: 'J:J', bg: C.purple, fg: C.white,   label: 'TOTAL REVENUE',   val: fmtAmt(totalRev) },
  ];

  [3,4,5,6,7,8,9,10].forEach((w, i) => { wsCov.getColumn(i+1).width = w < 5 ? 3 : w === 5 ? 16 : 18; });
  wsCov.getColumn(1).width = 3;
  ['B','C','D','E','F','G','H','I','J'].forEach(c => { wsCov.getColumn(c).width = 18; });

  kpis.forEach(k => {
    const [c1, c2] = k.cols.split(':');
    const mergeRef = c1 === c2 ? `${c1}5:${c2}5` : `${c1}5:${c2}5`;
    wsCov.mergeCells(`${c1}5:${c2 ?? c1}5`);
    wsCov.mergeCells(`${c1}6:${c2 ?? c1}6`);
    const lc = wsCov.getCell(`${c1}5`);
    const vc = wsCov.getCell(`${c1}6`);
    lc.value = k.label; lc.font = hf(k.fg, 8); lc.fill = solidFill(k.bg); lc.alignment = CA; lc.border = tb();
    vc.value = k.val;   vc.font = { name:'Arial', size:20, bold:true, color:{ argb:k.fg } };
    vc.fill  = solidFill(k.bg); vc.alignment = CA; vc.border = tb();
  });

  // State breakdown table
  wsCov.getRow(9).height  = 22;
  wsCov.getRow(10).height = 22;
  wsCov.mergeCells('B9:J9');
  const bh = wsCov.getCell('B9');
  bh.value = 'SCHOOL BREAKDOWN BY STATE (Approved)';
  bh.font  = hf(C.white, 11); bh.fill = solidFill(C.indigo); bh.alignment = CA;

  ['B','D','F','H'].forEach((col, i) => {
    const c = wsCov.getCell(`${col}10`);
    c.value = ['State', '# Schools', 'Paid', 'Revenue'][i];
    c.font  = hf(C.indigo, 9); c.fill = solidFill(C.indigoLite); c.alignment = CA; c.border = tb();
  });

  const stateMap: Record<string, { total: number; paid: number; rev: number }> = {};
  approvedList.forEach(s => {
    const st = s.state ?? 'Unknown';
    if (!stateMap[st]) stateMap[st] = { total: 0, paid: 0, rev: 0 };
    stateMap[st].total++;
    if (s.payment_status === 'paid') { stateMap[st].paid++; stateMap[st].rev += s.final_amount ?? 0; }
  });
  Object.entries(stateMap).sort((a, b) => b[1].total - a[1].total).slice(0, 10).forEach(([state, d], i) => {
    const r  = 11 + i;
    const rf = i % 2 === 0 ? C.white : C.greyLite;
    wsCov.getRow(r).height = 20;
    [['B', state], ['D', d.total], ['F', d.paid], ['H', fmtAmt(d.rev)]].forEach(([col, val]) => {
      const c = wsCov.getCell(`${col}${r}`);
      c.value = val as any; c.font = col === 'B' ? bf() : bf(C.indigo, true);
      c.fill  = solidFill(rf); c.alignment = col === 'B' ? LA : CA; c.border = tb();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 – APPROVED SCHOOLS
  // ══════════════════════════════════════════════════════════════════════════
  if (type !== 'pending') {
    const wsApp = wb.addWorksheet('✅ Approved Schools');
    wsApp.views   = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    wsApp.properties.tabColor = { argb: C.green };

    const APP_COLS: [string, number][] = [
      ['S.No',             5],  ['School Code',     14], ['School Name',      28],
      ['Program',         20],  ['Principal Name',  22], ['Contact Email',    28],
      ['Contact Phone',   16],  ['City',            14], ['State',            14],
      ['Country',         12],  ['Board',           14], ['School Type',      16],
      ['Student Count',   13],  ['Address',         36], ['Website',          24],
      ['PAN Number',      14],  ['GST Number',      16], ['Reg. Number',      16],
      ['Consultant Code', 14],  ['Consultant Name', 22], ['Payment Status',   14],
      ['Amount',          14],  ['Payment Date',    14], ['Approved On',      14],
      ['Registered On',   14],  ['Status',          10],
    ];

    APP_COLS.forEach(([, w], i) => { wsApp.getColumn(i + 1).width = w; });

    // Title
    wsApp.mergeCells(`A1:${colLetter(APP_COLS.length)}1`);
    wsApp.getRow(1).height = 32;
    const at = wsApp.getCell('A1');
    at.value = `✅  APPROVED SCHOOLS  |  Total: ${approvedList.length}  |  ${reportDate}`;
    at.font  = { name: 'Arial', size: 13, bold: true, color: { argb: C.white } };
    at.fill  = solidFill(C.green); at.alignment = CA;

    // Sub header
    wsApp.mergeCells(`A2:${colLetter(APP_COLS.length)}2`);
    wsApp.getRow(2).height = 18;
    const as2 = wsApp.getCell('A2');
    as2.value = `Paid: ${paidSchools.length}  |  Total Revenue: ${fmtAmt(totalRev)}  |  Report Date: ${reportDate}`;
    as2.font  = { name: 'Arial', size: 9, italic: true, color: { argb: C.green } };
    as2.fill  = solidFill(C.greenLite); as2.alignment = CA;

    // Headers
    wsApp.getRow(3).height = 30;
    APP_COLS.forEach(([hdr], i) => {
      const c = wsApp.getRow(3).getCell(i + 1);
      c.value = hdr; c.font = hf(); c.fill = solidFill(C.indigo); c.alignment = CA; c.border = tb();
    });

    // Data
    approvedList.forEach((s, ri) => {
      const r   = ri + 4;
      const row = wsApp.getRow(r);
      row.height = 36;
      const rf   = ri % 2 === 0 ? C.white : C.greyLite;
      const prog = progMap[s.project_slug] ?? progMap[(s as any).project_id] ?? s.program_name ?? '—';
      const cons = consMap[s.consultant_code] ?? consMap[s.consultant_id] ?? '—';
      const pStat = s.payment_status ?? '—';
      const pStatColor = pStat === 'paid' ? C.green : pStat === 'pending' ? C.amber : C.greyMid;

      const vals: any[] = [
        ri + 1, s.school_code ?? '—', s.name ?? '—', prog,
        s.principal_name ?? '—', s.contact_email ?? '—', s.contact_phone ?? '—',
        s.city ?? '—', s.state ?? '—', s.country ?? '—',
        s.board ?? '—', s.school_type ?? '—', s.student_count ?? '—',
        s.address ?? '—', s.website ?? '—',
        s.pan_number ?? '—', s.gst_number ?? '—', s.registration_number ?? '—',
        s.consultant_code ?? '—', cons,
        pStat.toUpperCase(), fmtAmt(s.final_amount),
        fmtDate(s.payment_date), fmtDate(s.approved_at), fmtDate(s.created_at),
        '✅ Approved',
      ];

      vals.forEach((val, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = val; cell.font = bf(); cell.fill = solidFill(rf);
        cell.border = tb(); cell.alignment = LA;
      });

      // Overrides
      row.getCell(1).alignment  = CA;                                       // S.No
      row.getCell(2).font       = bf(C.indigo, true);                       // Code
      row.getCell(3).font       = bf(C.greyHd, true);                       // Name
      row.getCell(21).font      = bf(pStatColor, true);                     // Payment status
      row.getCell(21).fill      = solidFill(pStat === 'paid' ? C.greenLite : pStat === 'pending' ? C.amberLite : C.greyLite);
      row.getCell(21).alignment = CA;
      row.getCell(22).font      = bf(C.teal, true);                          // Amount
      row.getCell(26).font      = bf(C.green, true);                         // Status
      row.getCell(26).fill      = solidFill(C.greenLite);
      row.getCell(26).alignment = CA;
      [1, 13, 21, 22, 23, 24, 25, 26].forEach(ci => { row.getCell(ci).alignment = CA; });
    });

    // Totals
    const tr = approvedList.length + 4;
    wsApp.mergeCells(`A${tr}:X${tr}`);
    wsApp.getRow(tr).height = 22;
    const totCell = wsApp.getCell(`A${tr}`);
    totCell.value = `TOTAL APPROVED: ${approvedList.length}  |  PAID: ${paidSchools.length}  |  TOTAL REVENUE: ${fmtAmt(totalRev)}`;
    totCell.font  = hf(C.white, 10); totCell.fill = solidFill(C.green);
    totCell.alignment = CA; totCell.border = tb();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3 – PENDING APPROVAL QUEUE
  // ══════════════════════════════════════════════════════════════════════════
  if (type !== 'approved') {
    const wsPen = wb.addWorksheet('⏳ Pending Approval');
    wsPen.views   = [{ showGridLines: false, state: 'frozen', ySplit: 3 }];
    wsPen.properties.tabColor = { argb: C.amber };

    const PEN_COLS: [string, number][] = [
      ['S.No',             5],  ['School Name',     28], ['Program',          20],
      ['Principal Name',  22],  ['Contact Email',   28], ['Contact Phone',    16],
      ['City',            14],  ['State',           14], ['Country',          12],
      ['Board',           14],  ['School Type',     16], ['Student Count',    13],
      ['Address',         36],  ['Website',         24], ['Consultant Code',  14],
      ['Consultant Name', 22],  ['Submitted On',    14], ['Days Pending',     12],
      ['Priority',        11],  ['Current Status',  16], ['Action Required',  16],
    ];

    PEN_COLS.forEach(([, w], i) => { wsPen.getColumn(i + 1).width = w; });

    // Title
    wsPen.mergeCells(`A1:${colLetter(PEN_COLS.length)}1`);
    wsPen.getRow(1).height = 32;
    const pt = wsPen.getCell('A1');
    pt.value = `⏳  PENDING APPROVAL QUEUE  |  Total: ${pendingList.length}  |  Action Required  |  ${reportDate}`;
    pt.font  = { name: 'Arial', size: 13, bold: true, color: { argb: C.greyHd } };
    pt.fill  = solidFill(C.amber); pt.alignment = CA;

    // Sub header
    wsPen.mergeCells(`A2:${colLetter(PEN_COLS.length)}2`);
    wsPen.getRow(2).height = 18;
    const ps2 = wsPen.getCell('A2');
    ps2.value = `Please review and approve/reject within 2 business days  |  ${reportDate}`;
    ps2.font  = { name: 'Arial', size: 9, italic: true, color: { argb: C.amber } };
    ps2.fill  = solidFill(C.amberLite); ps2.alignment = CA;

    // Headers
    wsPen.getRow(3).height = 30;
    PEN_COLS.forEach(([hdr], i) => {
      const c = wsPen.getRow(3).getCell(i + 1);
      c.value = hdr; c.font = hf(); c.fill = solidFill(C.amber); c.alignment = CA; c.border = tb();
    });

    // Data
    pendingList.forEach((s, ri) => {
      const r    = ri + 4;
      const row  = wsPen.getRow(r);
      row.height = 36;
      const rf   = ri % 2 === 0 ? C.white : C.greyLite;
      const days = daysSince(s.created_at);
      const prio = days >= 5 ? '🔴 Urgent' : days >= 2 ? '🟡 Medium' : '🟢 New';
      const prog = progMap[s.project_slug] ?? progMap[(s as any).project_id] ?? s.program_name ?? '—';
      const cons = consMap[s.consultant_code] ?? consMap[s.consultant_id] ?? '—';

      const vals: any[] = [
        ri + 1, s.name ?? '—', prog,
        s.principal_name ?? '—', s.contact_email ?? '—', s.contact_phone ?? '—',
        s.city ?? '—', s.state ?? '—', s.country ?? '—',
        s.board ?? '—', s.school_type ?? '—', s.student_count ?? '—',
        s.address ?? '—', s.website ?? '—',
        s.consultant_code ?? '—', cons,
        fmtDate(s.created_at), days, prio,
        (s.status ?? 'pending').toUpperCase(), '⚡ Approve / Reject',
      ];

      vals.forEach((val, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = val; cell.font = bf(); cell.fill = solidFill(rf);
        cell.border = tb(); cell.alignment = LA;
      });

      // Overrides
      row.getCell(1).alignment  = CA;
      row.getCell(2).font       = bf(C.greyHd, true);
      const dc = row.getCell(18);
      dc.font      = bf(days >= 5 ? C.red : C.amber, true);
      dc.alignment = CA;
      const pc = row.getCell(19);
      pc.font      = bf(days >= 5 ? C.red : days >= 2 ? C.amber : C.green, true);
      pc.alignment = CA;
      const sc = row.getCell(20);
      sc.font  = bf(C.amber, true); sc.fill = solidFill(C.amberLite); sc.alignment = CA;
      const ac = row.getCell(21);
      ac.font  = bf(C.indigo, true); ac.fill = solidFill(C.indigoLite); ac.alignment = CA;
      [1, 6, 12, 17, 18, 19, 20, 21].forEach(ci => { row.getCell(ci).alignment = CA; });
    });

    // Totals
    const tr = pendingList.length + 4;
    wsPen.mergeCells(`A${tr}:S${tr}`);
    wsPen.getRow(tr).height = 22;
    const totCell = wsPen.getCell(`A${tr}`);
    totCell.value = `TOTAL PENDING: ${pendingList.length}  |  Please action within 2 business days`;
    totCell.font  = hf(C.white, 10); totCell.fill = solidFill(C.amber);
    totCell.alignment = CA; totCell.border = tb();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 4 – NOTES
  // ══════════════════════════════════════════════════════════════════════════
  const wsNt = wb.addWorksheet('📌 Notes & Legend');
  wsNt.views = [{ showGridLines: false }];
  wsNt.properties.tabColor = { argb: C.teal };
  wsNt.getColumn(1).width = 3;
  wsNt.getColumn(2).width = 24;
  wsNt.getColumn(3).width = 65;

  wsNt.mergeCells('B1:C1');
  wsNt.getRow(1).height = 32;
  const nt = wsNt.getCell('B1');
  nt.value = '📌  NOTES, LEGEND & DATA DICTIONARY';
  nt.font  = { name: 'Arial', size: 13, bold: true, color: { argb: C.white } };
  nt.fill  = solidFill(C.indigo); nt.alignment = CA;

  const notes: [string, string, boolean][] = [
    ['FIELD',            'DESCRIPTION', true],
    ['School Code',      'Unique identifier assigned to each school on registration', false],
    ['Program',          'The Thynk program the school is enrolled in (e.g. BriShark, etc.)', false],
    ['Payment Status',   'paid = payment confirmed | pending = awaiting payment | failed = payment failed', false],
    ['Consultant Code',  'Code of the consultant who referred/manages this school', false],
    ['Days Pending',     'Number of days since the school submitted their registration (Pending sheet)', false],
    ['Priority',         '🔴 Urgent = 5+ days  |  🟡 Medium = 2–4 days  |  🟢 New = 0–1 days', false],
    ['Amount',           'Final agreed amount in INR. Stored in paise internally (divide by 100 for INR)', false],
    ['Board',            'School board: CBSE / ICSE / IB / State Board / etc.', false],
    ['Approved On',      'Date the school was approved by admin in the portal', false],
    ['Registered On',    'Date the school first submitted their registration form', false],
  ];

  notes.forEach(([field, desc, isHdr], i) => {
    const r = i + 3;
    wsNt.getRow(r).height = isHdr ? 22 : 20;
    const bf_cell = wsNt.getCell(`B${r}`);
    const bc_cell = wsNt.getCell(`C${r}`);
    bf_cell.value = field; bc_cell.value = desc;
    if (isHdr) {
      [bf_cell, bc_cell].forEach(c => {
        c.font = hf(); c.fill = solidFill(C.indigo); c.alignment = CA; c.border = tb();
      });
    } else {
      const rf = i % 2 === 0 ? C.white : C.greyLite;
      bf_cell.font = bf(C.indigo, true); bc_cell.font = bf();
      [bf_cell, bc_cell].forEach(c => { c.fill = solidFill(rf); c.alignment = LA; c.border = tb(); });
    }
  });

  // ── Stream ────────────────────────────────────────────────────────────────
  const buf      = await wb.xlsx.writeBuffer();
  const typeLabel = type === 'pending' ? 'Pending' : type === 'approved' ? 'Approved' : 'Full';
  const filename  = `Thynk_School_Report_${typeLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String((buf as unknown as Buffer).byteLength),
    },
  });
}
