// app/api/admin/generate-letter/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// 100% free, Vercel-compatible PDF letter generation.
// No CloudConvert. No LibreOffice. No paid APIs. Zero ongoing cost.
//
// npm install mupdf pdf-lib
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse }    from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface InsertJob {
  pageIdx:   number;
  x0: number; y0: number; x1: number; y1: number;
  baseline:  number;
  newText:   string;
  fontSize:  number;
  isBold:    boolean;
  colorRgb:  [number, number, number];
}

// ─── Core replacement function ────────────────────────────────────────────────
//
// Two fixes vs naive approach:
//
// Fix 1 — School name: Use EXACT search rect (no padding). The token span has a
//   trailing space; the next word starts immediately after. Expanding the cover
//   box was eating into the adjacent text.
//
// Fix 2 — URL code token: The code token lives INSIDE a larger line span like
//   'th2026/?school=cyboard2026'. Searching for 'cyboard2026' alone gives a
//   partial rect covering only the last portion, leaving a fragment of the old
//   span visible and making the link unclickable. Fix: find the full span text
//   via structured text, search for that, redact the whole span, re-insert with
//   the code replaced. The preceding URL line ('https://...mentalma') is
//   unchanged — no token in it, so no need to touch it.
//
async function replacePdfTokens(
  pdfBuf:      Buffer,
  nameToken:   string,
  codeToken:   string,
  newName:     string,
  newCode:     string,
  nameColorHex: string,
  codeColorHex: string,
): Promise<Buffer> {

  // Lazy-load mupdf to prevent WASM init at build/static-analysis time
  const mupdf = await import('mupdf');

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
  }

  function quadToRect(quad: number[]): [number,number,number,number] {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  const nameColor = hexToRgb(nameColorHex);
  const codeColor = hexToRgb(codeColorHex);

  const readDoc  = mupdf.Document.openDocument(pdfBuf, 'application/pdf');
  const writeDoc = new mupdf.PDFDocument(pdfBuf);
  const pageCount: number = writeDoc.countPages();
  const inserts: InsertJob[] = [];

  for (let i = 0; i < pageCount; i++) {
    const readPage  = readDoc.loadPage(i);
    const writePage = writeDoc.loadPage(i);

    const stext = JSON.parse(readPage.toStructuredText('preserve-whitespace').asJSON()) as {
      blocks: Array<{ lines?: Array<{ text?: string; font?: { weight?: string; size?: number }; y?: number; bbox?: { x: number; y: number } }> }>;
    };
    const allLines = stext.blocks?.flatMap(b => b.lines ?? []) ?? [];

    // ── Fix 1: School name — exact rect, no expansion ────────────────────────
    const nameHits: number[][][] = readPage.search(nameToken);
    for (const hitQuads of nameHits) {
      for (const quad of hitQuads) {
        const [x0, y0, x1, y1] = quadToRect(quad);
        const matchLine = allLines.find(l => l.text?.includes(nameToken));
        const fontSize  = matchLine?.font?.size ?? 11;
        const isBold    = matchLine?.font?.weight === 'bold';
        const baseline  = matchLine?.y ?? y1;

        const annot = writePage.createAnnotation('Redact');
        annot.setRect([x0, y0, x1, y1]);          // ← exact, no padding
        inserts.push({ pageIdx: i, x0, y0, x1, y1, baseline, newText: newName, fontSize, isBold, colorRgb: nameColor });
      }
    }

    // ── Fix 2: Code token — find full containing span, replace whole span ────
    // Structured text gives lines. The code token sits inside a line whose full
    // text is e.g. 'th2026/?school=cyboard2026'. We search for that full line
    // text to get the complete span rect, then replace only the token within it.
    const codeLine = allLines.find(l => l.text?.includes(codeToken));
    if (codeLine?.text) {
      const fullSpanText = codeLine.text;                          // full span
      const newSpanText  = fullSpanText.replace(                   // replace token
        new RegExp(codeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        newCode,
      );

      const spanHits: number[][][] = readPage.search(fullSpanText.trim());
      for (const hitQuads of spanHits) {
        for (const quad of hitQuads) {
          const [x0, y0, x1, y1] = quadToRect(quad);
          const fontSize = codeLine.font?.size ?? 10;
          const isBold   = codeLine.font?.weight === 'bold';
          const baseline = codeLine.y ?? y1;

          const annot = writePage.createAnnotation('Redact');
          annot.setRect([x0, y0, x1, y1]);         // covers full span
          inserts.push({ pageIdx: i, x0, y0, x1, y1, baseline, newText: newSpanText, fontSize, isBold, colorRgb: codeColor });
        }
      }
    }

    writePage.applyRedactions(false, 1);
  }

  // Copy to Node Buffer before further WASM ops (prevents ArrayBuffer detach)
  const redactedBuf = Buffer.from(
    writeDoc.saveToBuffer('garbage=4,deflate').asUint8Array()
  );

  // ── pdf-lib: overlay replacement text ─────────────────────────────────────
  const pdfDoc   = await PDFDocument.load(redactedBuf);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const ins of inserts) {
    const page        = pdfDoc.getPage(ins.pageIdx);
    const pageHeight  = page.getHeight();
    const pdfBaseline = pageHeight - ins.baseline;
    const pdfBot      = pageHeight - ins.y1;
    const pdfTop      = pageHeight - ins.y0;
    const [r, g, b]   = ins.colorRgb;

    // White cover — exact original width only
    page.drawRectangle({
      x: ins.x0, y: pdfBot,
      width:  ins.x1 - ins.x0,
      height: pdfTop - pdfBot,
      color:  rgb(1, 1, 1),
      borderWidth: 0,
    });

    // Replacement text at original baseline
    page.drawText(ins.newText, {
      x:     ins.x0,
      y:     pdfBaseline,
      font:  ins.isBold ? fontBold : fontReg,
      size:  ins.fontSize,
      color: rgb(r, g, b),
    });
  }

  return Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
}

// ─── Upload PDF to Supabase + insert client_documents row ─────────────────────
async function uploadToSchoolDocuments(
  service:     ReturnType<typeof createServiceClient>,
  pdfBuffer:   Buffer,
  schoolId:    string,
  schoolName:  string,
  projectName: string,
  uploadedBy:  string,
): Promise<string> {
  const safeName    = schoolName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
  const dateStamp   = new Date().toISOString().slice(0, 10);
  const fileName    = `${schoolName}.pdf`;
  const filePath    = `${schoolId}/${dateStamp}_${safeName.replace(/ /g, '_')}.pdf`;
  const description = `Auto-generated letter: ${projectName}`;

  const { data: existing } = await service
    .from('client_documents').select('id, file_path')
    .eq('school_id', schoolId).eq('description', description).maybeSingle();

  if (existing?.file_path) {
    await service.storage.from('client-documents').remove([existing.file_path]);
    await service.from('client_documents').delete().eq('id', existing.id);
  }

  const { error: storageErr } = await service.storage
    .from('client-documents')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

  const { data: doc, error: dbErr } = await service
    .from('client_documents')
    .insert({
      school_id: schoolId, file_name: fileName, file_path: filePath,
      file_type: 'application/pdf', file_size: pdfBuffer.length,
      category: 'general', description, is_visible: true, uploaded_by: uploadedBy,
    })
    .select('id').single();

  if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);
  return doc.id;
}

// ─── Auth ──────────────────────────────────────────────────────────────────────
async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

// ══ POST /api/admin/generate-letter ══════════════════════════════════════════
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service     = createServiceClient();
  const body        = await req.json();
  const projectId   = body.projectId as string;
  const schoolIds: string[] = body.schoolIds ?? (body.schoolId ? [body.schoolId] : []);
  const triggeredBy = (body.triggeredBy as string) ?? 'manual';

  if (!projectId || !schoolIds.length)
    return NextResponse.json({ error: 'projectId and schoolId(s) required' }, { status: 400 });

  const { data: template } = await service
    .from('letter_templates')
    .select('id, file_path, school_name_token, school_code_token, name_token_color, code_token_color, projects(name)')
    .eq('project_id', projectId).eq('is_active', true).single();

  if (!template)
    return NextResponse.json({ error: 'No active letter template found. Upload a PDF template first.' }, { status: 404 });

  const { data: tmplBlob, error: dlErr } = await service.storage
    .from('letter-templates').download(template.file_path);

  if (dlErr || !tmplBlob)
    return NextResponse.json({ error: `Template download failed: ${dlErr?.message}` }, { status: 500 });

  const templateBuf = Buffer.from(await tmplBlob.arrayBuffer());
  const projectName = (template as any).projects?.name ?? 'Program';

  const { data: schools } = await service
    .from('schools').select('id, name, school_code').in('id', schoolIds);

  if (!schools?.length)
    return NextResponse.json({ error: 'No schools found' }, { status: 404 });

  const { data: trackRows } = await service
    .from('school_letters')
    .insert(schools.map(s => ({
      school_id: s.id, project_id: projectId,
      template_id: template.id, status: 'processing', triggered_by: triggeredBy,
    })))
    .select('id, school_id');

  const trackMap = Object.fromEntries((trackRows ?? []).map(r => [r.school_id, r.id]));
  const results: any[] = [];

  for (const school of schools) {
    const trackId = trackMap[school.id];
    try {
      const pdfBuf = await replacePdfTokens(
        templateBuf,
        template.school_name_token,
        template.school_code_token,
        school.name,
        school.school_code,
        template.name_token_color ?? '#000000',
        template.code_token_color ?? '#000000',
      );

      const documentId = await uploadToSchoolDocuments(
        service, pdfBuf, school.id, school.name, projectName, user.id,
      );

      await service.from('school_letters')
        .update({ status: 'done', document_id: documentId, generated_at: new Date().toISOString() })
        .eq('id', trackId);

      results.push({ schoolId: school.id, schoolName: school.name, status: 'done', documentId });
    } catch (err: any) {
      await service.from('school_letters')
        .update({ status: 'error', error_message: String(err.message) })
        .eq('id', trackId);
      results.push({ schoolId: school.id, schoolName: school.name, status: 'error', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'done').length;
  return NextResponse.json({
    ok: true,
    message: `${ok}/${schools.length} PDF letters generated and uploaded to school dashboards.`,
    results,
  });
}
