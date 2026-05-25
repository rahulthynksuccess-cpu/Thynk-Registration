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
  /** Redact rect (original token position — used to erase old text) */
  redactX0: number; redactY0: number; redactX1: number; redactY1: number;
  /** Draw position — where we start writing the new text */
  drawX0:   number;
  baseline:  number;
  /** Maximum width allowed for the new text before we scale down */
  maxWidth:  number;
  newText:   string;
  /** Original font size from the PDF — used as the preferred size */
  fontSize:  number;
  isBold:    boolean;
  colorRgb:  [number, number, number];
  /** If set, a clickable URI annotation is added covering the draw area */
  linkUri?:  string;
}

// ─── Core replacement function ────────────────────────────────────────────────
//
// School name (Fix 1):
//   The template PDF has a line like "Invitation to Participate - Cyboard School".
//   Only the token ("Cyboard School") is replaced. mupdf gives us the EXACT
//   bounding rect of just the token text. We erase only that rect, then draw
//   the new name starting at the same x0, with maxWidth = (page width - x0 - margin)
//   so longer names never get squeezed to illegibly small sizes.
//   Font size stays at the original PDF size; we only scale down as a last resort
//   if the text is truly wider than the available page space.
//
// URL / school code (Fix 2):
//   The registration URL is split across two adjacent PDF spans:
//     Span A: "https://thynksuccess.com/registration/mentalmat"
//     Span B: "h2026/?school=cyboard2026"
//   We redact BOTH spans, re-draw the full stitched URL at span A's x0,
//   and add a clickable URI annotation over the union rect so the whole
//   URL is one functional hyperlink. Font size is taken directly from the
//   original PDF spans (≈9.96 pt) — no scaling applied.
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

    // Page dimensions for computing available width
    const pageBounds: number[] = writePage.getBounds();  // [x0,y0,x1,y1]
    const pageWidth  = pageBounds[2] - pageBounds[0];
    const pageMargin = 38; // conservative right margin in pt

    const stext = JSON.parse(readPage.toStructuredText('preserve-whitespace').asJSON()) as {
      blocks: Array<{ lines?: Array<{ text?: string; font?: { weight?: string; size?: number }; y?: number }> }>;
    };
    const allLines = stext.blocks?.flatMap(b => b.lines ?? []) ?? [];

    // ── School name: erase token rect, draw new name with page-width budget ──
    const nameHits: number[][][] = readPage.search(nameToken);
    for (const hitQuads of nameHits) {
      for (const quad of hitQuads) {
        const [x0, y0, x1, y1] = quadToRect(quad);
        const matchLine = allLines.find(l => l.text?.includes(nameToken));
        const fontSize  = matchLine?.font?.size ?? 13.56;   // default from sample PDF
        const isBold    = matchLine?.font?.weight === 'bold';
        const baseline  = matchLine?.y ?? y1;

        // Erase only the token's original rect
        const annot = writePage.createAnnotation('Redact');
        annot.setRect([x0, y0, x1, y1]);

        // Available draw width = from token x0 to page right margin
        // This is always much wider than the token itself, accommodating any school name
        const maxWidth = pageWidth - x0 - pageMargin;

        inserts.push({
          pageIdx: i,
          redactX0: x0, redactY0: y0, redactX1: x1, redactY1: y1,
          drawX0: x0,
          baseline, maxWidth,
          newText: newName,
          fontSize,
          isBold,
          colorRgb: nameColor,
        });
      }
    }

    // ── URL / code token: stitch both spans, redact both, re-draw + link annot ─
    const codeSpan = allLines.find(l => l.text?.includes(codeToken));

    if (codeSpan?.text) {
      const spanBText    = codeSpan.text;
      const newSpanBText = spanBText.replace(
        new RegExp(codeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        newCode,
      );

      // Find the URL prefix span (span A) — same approximate y-region, contains 'http'
      const spanBLineY = (codeSpan as any).y ?? 0;
      const urlPrefixSpan = allLines.find(l =>
        l !== codeSpan &&
        l.text?.includes('http') &&
        !l.text.includes(codeToken) &&
        Math.abs(((l as any).y ?? 0) - spanBLineY) < 25
      );

      if (urlPrefixSpan?.text) {
        // Both halves found — stitch into one full URL
        const spanAText  = urlPrefixSpan.text;
        const fullNewUrl = spanAText + newSpanBText;

        // Font size from the original PDF spans (≈9.96 pt) — use as-is
        const fontSize = (urlPrefixSpan as any).font?.size ?? 9.96;
        const isBold   = (urlPrefixSpan as any).font?.weight === 'bold';
        const baseline = (urlPrefixSpan as any).y ?? 0;

        // Redact span A
        let spanARect: [number,number,number,number] | null = null;
        const spanAHits: number[][][] = readPage.search(spanAText.trim());
        for (const hitQuads of spanAHits) {
          for (const quad of hitQuads) {
            const r = quadToRect(quad);
            spanARect = r;
            const a = writePage.createAnnotation('Redact');
            a.setRect(r);
          }
        }

        // Redact span B
        let spanBRect: [number,number,number,number] | null = null;
        const spanBHits: number[][][] = readPage.search(spanBText.trim());
        for (const hitQuads of spanBHits) {
          for (const quad of hitQuads) {
            const r = quadToRect(quad);
            spanBRect = r;
            const a = writePage.createAnnotation('Redact');
            a.setRect(r);
          }
        }

        if (spanARect && spanBRect) {
          const unionX0 = Math.min(spanARect[0], spanBRect[0]);
          const unionY0 = Math.min(spanARect[1], spanBRect[1]);
          const unionX1 = Math.max(spanARect[2], spanBRect[2]);
          const unionY1 = Math.max(spanARect[3], spanBRect[3]);

          // maxWidth = full union width (URL should fit — it's the same length)
          const maxWidth = unionX1 - unionX0;

          inserts.push({
            pageIdx: i,
            redactX0: unionX0, redactY0: unionY0, redactX1: unionX1, redactY1: unionY1,
            drawX0: spanARect[0],
            baseline,
            maxWidth,
            newText: fullNewUrl,
            fontSize,
            isBold,
            colorRgb: codeColor,
            linkUri: fullNewUrl,
          });
        }

      } else {
        // Fallback: no URL prefix span found, replace span B only
        const spanBHits: number[][][] = readPage.search(spanBText.trim());
        for (const hitQuads of spanBHits) {
          for (const quad of hitQuads) {
            const [x0, y0, x1, y1] = quadToRect(quad);
            const fontSize = (codeSpan as any).font?.size ?? 9.96;
            const isBold   = (codeSpan as any).font?.weight === 'bold';
            const baseline = (codeSpan as any).y ?? y1;
            const annot = writePage.createAnnotation('Redact');
            annot.setRect([x0, y0, x1, y1]);
            inserts.push({
              pageIdx: i,
              redactX0: x0, redactY0: y0, redactX1: x1, redactY1: y1,
              drawX0: x0,
              baseline,
              maxWidth: x1 - x0,
              newText: newSpanBText,
              fontSize,
              isBold,
              colorRgb: codeColor,
            });
          }
        }
      }
    }

    writePage.applyRedactions(false, 1);
  }

  const redactedBuf = Buffer.from(
    writeDoc.saveToBuffer('garbage=4,deflate').asUint8Array()
  );

  // ── pdf-lib: draw replacement text + optional link annotations ────────────
  const pdfDoc   = await PDFDocument.load(redactedBuf);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const ins of inserts) {
    const page       = pdfDoc.getPage(ins.pageIdx);
    const pageHeight = page.getHeight();
    const font       = ins.isBold ? fontBold : fontReg;
    const [r, g, b]  = ins.colorRgb;

    // pdf-lib y-coords (origin = bottom-left)
    const pdfBaseline = pageHeight - ins.baseline;
    const pdfBot      = pageHeight - ins.redactY1;
    const pdfTop      = pageHeight - ins.redactY0;

    // White cover over the original token rect
    page.drawRectangle({
      x: ins.redactX0, y: pdfBot,
      width:  ins.redactX1 - ins.redactX0,
      height: pdfTop - pdfBot,
      color:  rgb(1, 1, 1),
      borderWidth: 0,
    });

    // Font size: use the original PDF size.
    // Only scale down if the text genuinely overflows the available page space.
    let drawSize = ins.fontSize;
    const textWidth = font.widthOfTextAtSize(ins.newText, drawSize);
    if (textWidth > ins.maxWidth && ins.maxWidth > 0) {
      // Scale down proportionally, minimum 8pt to remain readable
      drawSize = Math.max(8, drawSize * (ins.maxWidth / textWidth));
    }

    page.drawText(ins.newText, {
      x:    ins.drawX0,
      y:    pdfBaseline,
      font,
      size: drawSize,
      color: rgb(r, g, b),
    });

    // Add a clickable URI annotation for link fields
    if (ins.linkUri) {
      const annotRect = [ins.drawX0, pdfBot, ins.redactX1, pdfTop];
      const ctx = pdfDoc.context;
      const linkAnnot = ctx.obj({
        Type:    ctx.obj('Annot'),
        Subtype: ctx.obj('Link'),
        Rect:    ctx.obj(annotRect),
        Border:  ctx.obj([0, 0, 0]),
        A: ctx.obj({
          Type: ctx.obj('Action'),
          S:    ctx.obj('URI'),
          URI:  ctx.obj(ins.linkUri),
        }),
      });
      const annotRef = ctx.register(linkAnnot);
      const pageNode = page.node;
      const existingAnnots = pageNode.get(ctx.obj('Annots'));
      if (existingAnnots && existingAnnots.constructor.name === 'PDFArray') {
        (existingAnnots as any).push(annotRef);
      } else {
        pageNode.set(ctx.obj('Annots'), ctx.obj([annotRef]));
      }
    }
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
