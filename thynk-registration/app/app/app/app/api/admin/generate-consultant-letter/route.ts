// app/api/admin/generate-consultant-letter/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generates PDF letters for consultants by replacing two tokens
// (consultant name + consultant code) in a per-program PDF template —
// the exact same mupdf + pdf-lib token-replacement pipeline used for the
// School letter generator (see app/api/admin/generate-letter/route.ts).
//
// Difference from the school version: the request body may include an
// `overrides` map so the admin can tweak the exact name/code text that gets
// printed for a specific consultant before generating (e.g. fix a spelling,
// use a preferred display name) without changing their stored profile data.
//
// npm install mupdf pdf-lib   (already installed for the school letter generator)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse }    from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface InsertJob {
  pageIdx:   number;
  redactX0: number; redactY0: number; redactX1: number; redactY1: number;
  drawX0:   number;
  baseline:  number;
  maxWidth:  number;
  newText:   string;
  fontSize:  number;
  isBold:    boolean;
  colorRgb:  [number, number, number];
  linkUri?:  string;
}

// ─── Core replacement function (identical mechanics to the school version) ───
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

    const pageBounds: number[] = writePage.getBounds();
    const pageWidth  = pageBounds[2] - pageBounds[0];
    const pageMargin = 38;

    const stext = JSON.parse(readPage.toStructuredText('preserve-whitespace').asJSON()) as {
      blocks: Array<{ lines?: Array<{ text?: string; font?: { weight?: string; size?: number }; y?: number }> }>;
    };
    const allLines = stext.blocks?.flatMap(b => b.lines ?? []) ?? [];

    // ── Consultant name: erase token rect, draw new name with page-width budget ──
    const nameHits: number[][][] = readPage.search(nameToken);
    for (const hitQuads of nameHits) {
      for (const quad of hitQuads) {
        const [x0, y0, x1, y1] = quadToRect(quad);
        const matchLine = allLines.find(l => l.text?.includes(nameToken));
        const fontSize  = matchLine?.font?.size ?? 13.56;
        const isBold    = matchLine?.font?.weight === 'bold';
        const baseline  = matchLine?.y ?? y1;

        const annot = writePage.createAnnotation('Redact');
        annot.setRect([x0, y0, x1, y1]);

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

    // ── Consultant code / URL token: stitch spans if present, else replace directly ──
    const codeSpan = allLines.find(l => l.text?.includes(codeToken));

    if (codeSpan?.text) {
      const spanBText    = codeSpan.text;
      const newSpanBText = spanBText.replace(
        new RegExp(codeToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        newCode,
      );

      const spanBLineY = (codeSpan as any).y ?? 0;
      const urlPrefixSpan = allLines.find(l =>
        l !== codeSpan &&
        l.text?.includes('http') &&
        !l.text.includes(codeToken) &&
        Math.abs(((l as any).y ?? 0) - spanBLineY) < 25
      );

      if (urlPrefixSpan?.text) {
        const spanAText  = urlPrefixSpan.text;
        const fullNewUrl = spanAText + newSpanBText;

        const fontSize = (urlPrefixSpan as any).font?.size ?? 9.96;
        const isBold   = (urlPrefixSpan as any).font?.weight === 'bold';
        const baseline = (urlPrefixSpan as any).y ?? 0;

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

  const pdfDoc   = await PDFDocument.load(redactedBuf);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const ins of inserts) {
    const page       = pdfDoc.getPage(ins.pageIdx);
    const pageHeight = page.getHeight();
    const font       = ins.isBold ? fontBold : fontReg;
    const [r, g, b]  = ins.colorRgb;

    const pdfBaseline = pageHeight - ins.baseline;
    const pdfBot      = pageHeight - ins.redactY1;
    const pdfTop      = pageHeight - ins.redactY0;

    page.drawRectangle({
      x: ins.redactX0, y: pdfBot,
      width:  ins.redactX1 - ins.redactX0,
      height: pdfTop - pdfBot,
      color:  rgb(1, 1, 1),
      borderWidth: 0,
    });

    let drawSize = ins.fontSize;
    const textWidth = font.widthOfTextAtSize(ins.newText, drawSize);
    if (textWidth > ins.maxWidth && ins.maxWidth > 0) {
      drawSize = Math.max(8, drawSize * (ins.maxWidth / textWidth));
    }

    page.drawText(ins.newText, {
      x:    ins.drawX0,
      y:    pdfBaseline,
      font,
      size: drawSize,
      color: rgb(r, g, b),
    });

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

// ─── Upload PDF to Supabase + insert consultant_documents row ─────────────────
async function uploadToConsultantDocuments(
  service:      ReturnType<typeof createServiceClient>,
  pdfBuffer:    Buffer,
  consultantId: string,
  consultantName: string,
  projectName:  string,
  uploadedBy:   string,
): Promise<string> {
  const safeName    = consultantName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
  const dateStamp   = new Date().toISOString().slice(0, 10);
  const fileName    = `${consultantName}.pdf`;
  const filePath    = `${consultantId}/${dateStamp}_${safeName.replace(/ /g, '_')}.pdf`;
  const description = `Auto-generated letter: ${projectName}`;

  const { data: existing } = await service
    .from('consultant_documents').select('id, file_path')
    .eq('consultant_id', consultantId).eq('description', description).maybeSingle();

  if (existing?.file_path) {
    await service.storage.from('consultant-documents').remove([existing.file_path]);
    await service.from('consultant_documents').delete().eq('id', existing.id);
  }

  const { error: storageErr } = await service.storage
    .from('consultant-documents')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

  const { data: doc, error: dbErr } = await service
    .from('consultant_documents')
    .insert({
      consultant_id: consultantId, file_name: fileName, file_path: filePath,
      file_type: 'application/pdf', file_size: pdfBuffer.length,
      category: 'letter', description, is_visible: true, uploaded_by: uploadedBy,
    })
    .select('id').single();

  if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);
  return doc.id;
}

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

// ══ POST /api/admin/generate-consultant-letter ══════════════════════════════
// body: {
//   projectId: string,
//   consultantIds: string[],
//   triggeredBy?: string,
//   overrides?: Record<string, { name?: string; code?: string }>  // optional per-consultant content edits
// }
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service       = createServiceClient();
  const body          = await req.json();
  const projectId     = body.projectId as string;
  const consultantIds: string[] = body.consultantIds ?? (body.consultantId ? [body.consultantId] : []);
  const triggeredBy   = (body.triggeredBy as string) ?? 'manual';
  const overrides: Record<string, { name?: string; code?: string }> = body.overrides ?? {};

  if (!projectId || !consultantIds.length)
    return NextResponse.json({ error: 'projectId and consultantId(s) required' }, { status: 400 });

  const { data: template } = await service
    .from('consultant_letter_templates')
    .select('id, file_path, consultant_name_token, consultant_code_token, name_token_color, code_token_color, projects(name)')
    .eq('project_id', projectId).eq('is_active', true).single();

  if (!template)
    return NextResponse.json({ error: 'No active letter template found for this program. Upload a PDF template first.' }, { status: 404 });

  const { data: tmplBlob, error: dlErr } = await service.storage
    .from('consultant-letter-templates').download(template.file_path);

  if (dlErr || !tmplBlob)
    return NextResponse.json({ error: `Template download failed: ${dlErr?.message}` }, { status: 500 });

  const templateBuf = Buffer.from(await tmplBlob.arrayBuffer());
  const projectName = (template as any).projects?.name ?? 'Program';

  // Fetch consultant name + code from consultant_profiles
  const { data: profiles } = await service
    .from('consultant_profiles')
    .select('user_id, full_name, consultant_code')
    .in('user_id', consultantIds);

  // Fallback to auth email if full_name is missing
  const profileMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.user_id, p]));
  const consultants = await Promise.all(consultantIds.map(async (id) => {
    const p = profileMap[id];
    let name = p?.full_name;
    if (!name) {
      const { data: u } = await service.auth.admin.getUserById(id);
      name = u?.user?.user_metadata?.name ?? u?.user?.email ?? 'Consultant';
    }
    return { id, name, code: p?.consultant_code ?? '—' };
  }));

  if (!consultants.length)
    return NextResponse.json({ error: 'No consultants found' }, { status: 404 });

  const { data: trackRows } = await service
    .from('consultant_letters')
    .insert(consultants.map(c => ({
      consultant_id: c.id, project_id: projectId,
      template_id: template.id, status: 'processing', triggered_by: triggeredBy,
    })))
    .select('id, consultant_id');

  const trackMap = Object.fromEntries((trackRows ?? []).map(r => [r.consultant_id, r.id]));
  const results: any[] = [];

  for (const consultant of consultants) {
    const trackId = trackMap[consultant.id];
    const finalName = overrides[consultant.id]?.name?.trim() || consultant.name;
    const finalCode = overrides[consultant.id]?.code?.trim() || consultant.code;

    try {
      const pdfBuf = await replacePdfTokens(
        templateBuf,
        template.consultant_name_token,
        template.consultant_code_token,
        finalName,
        finalCode,
        template.name_token_color ?? '#000000',
        template.code_token_color ?? '#000000',
      );

      const documentId = await uploadToConsultantDocuments(
        service, pdfBuf, consultant.id, finalName, projectName, user.id,
      );

      await service.from('consultant_letters')
        .update({ status: 'done', document_id: documentId, generated_at: new Date().toISOString() })
        .eq('id', trackId);

      results.push({ consultantId: consultant.id, consultantName: finalName, status: 'done', documentId });
    } catch (err: any) {
      await service.from('consultant_letters')
        .update({ status: 'error', error_message: String(err.message) })
        .eq('id', trackId);
      results.push({ consultantId: consultant.id, consultantName: finalName, status: 'error', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'done').length;
  return NextResponse.json({
    ok: true,
    message: `${ok}/${consultants.length} PDF letters generated and saved to consultant documents.`,
    results,
  });
}
