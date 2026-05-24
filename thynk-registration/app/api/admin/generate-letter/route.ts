// app/api/admin/generate-letter/route.ts
// Generates personalised school letters from PPTX templates,
// converts to PDF, and auto-uploads to the school's document section.
//
// POST body: { schoolIds: string[], projectId: string }
//   or for a single school: { schoolId: string, projectId: string }
//
// The heavy lifting (pptx → pdf) runs in a child_process so it doesn't
// block the Next.js event loop. Requires python3 + python-pptx + LibreOffice
// to be installed on the server (same machine that runs Next.js).

import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, createServiceClient } from '@/lib/supabase/server';
import { exec }   from 'child_process';
import { promisify } from 'util';
import * as fs    from 'fs';
import * as path  from 'path';
import * as os    from 'os';

const execAsync = promisify(exec);

async function requireSuperAdmin(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  const service = createServiceClient();
  const { data } = await service
    .from('admin_roles').select('role')
    .eq('user_id', user.id).eq('role', 'super_admin').is('school_id', null).single();
  return data ? user : null;
}

// ── helper: generate one PDF from template bytes ──────────────────────────────
async function generateLetterPDF(
  templateBytes: ArrayBuffer,
  schoolName:    string,
  schoolCode:    string,
  nameToken:     string,
  codeToken:     string,
): Promise<Buffer> {
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'thynk-letter-'));
  const pptxIn  = path.join(tmpDir, 'template.pptx');
  const pptxOut = path.join(tmpDir, 'letter.pptx');
  const pdfOut  = path.join(tmpDir, 'letter.pdf');

  try {
    fs.writeFileSync(pptxIn, Buffer.from(templateBytes));

    // Python inline script — replaces tokens in every run across all slides
    const pyScript = `
import sys
from pptx import Presentation

prs = Presentation(sys.argv[1])
name_token = sys.argv[3]
code_token = sys.argv[4]
new_name   = sys.argv[5]
new_code   = sys.argv[6]

for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    if name_token in run.text:
                        run.text = run.text.replace(name_token, new_name)
                    if code_token in run.text:
                        run.text = run.text.replace(code_token, new_code)

prs.save(sys.argv[2])
print("ok")
`.trim();

    const pyFile = path.join(tmpDir, 'replace.py');
    fs.writeFileSync(pyFile, pyScript);

    await execAsync(
      `python3 "${pyFile}" "${pptxIn}" "${pptxOut}" "" "${nameToken}" "${codeToken}" "${schoolName}" "${schoolCode}"`
    );

    // Convert pptx → pdf via LibreOffice
    await execAsync(
      `soffice --headless --convert-to pdf --outdir "${tmpDir}" "${pptxOut}"`
    );

    // soffice names output: letter.pdf (replaces .pptx extension)
    return fs.readFileSync(pdfOut);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── helper: upload PDF bytes to Supabase + insert client_document row ─────────
async function uploadLetterToSchool(
  service:    ReturnType<typeof createServiceClient>,
  pdfBuffer:  Buffer,
  schoolId:   string,
  schoolName: string,
  projectName: string,
  uploadedBy: string,
): Promise<{ documentId: string }> {
  const safeName  = schoolName.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
  const timestamp = new Date().toISOString().slice(0, 10);
  const filePath  = `${schoolId}/${timestamp}_${safeName.replace(/ /g, '_')}.pdf`;
  const fileName  = `${schoolName}.pdf`;

  // Upload to Supabase storage bucket 'client-documents'
  const { error: storageErr } = await service.storage
    .from('client-documents')
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,            // overwrite if re-generated
    });

  if (storageErr) throw new Error(`Storage upload failed: ${storageErr.message}`);

  // Delete any previous auto-generated letter for same school+program
  const { data: existing } = await service
    .from('client_documents')
    .select('id, file_path')
    .eq('school_id', schoolId)
    .eq('description', `Auto-generated letter: ${projectName}`)
    .maybeSingle();

  if (existing?.file_path && existing.file_path !== filePath) {
    await service.storage.from('client-documents').remove([existing.file_path]);
    await service.from('client_documents').delete().eq('id', existing.id);
  }

  // Insert (or update) document record
  const { data: doc, error: dbErr } = await service
    .from('client_documents')
    .upsert({
      school_id:   schoolId,
      file_name:   fileName,
      file_path:   filePath,
      file_type:   'application/pdf',
      file_size:   pdfBuffer.length,
      category:    'general',
      description: `Auto-generated letter: ${projectName}`,
      is_visible:  true,
      uploaded_by: uploadedBy,
    }, { onConflict: 'school_id,description' })
    .select('id')
    .single();

  if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);
  return { documentId: doc.id };
}

// ── POST /api/admin/generate-letter ───────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin(req);
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const body    = await req.json();

  const projectId = body.projectId as string;
  const schoolIds: string[] = body.schoolIds
    ? body.schoolIds
    : body.schoolId
    ? [body.schoolId]
    : [];

  if (!projectId || !schoolIds.length)
    return NextResponse.json({ error: 'projectId and schoolId(s) required' }, { status: 400 });

  // 1. Fetch template for program
  const { data: template } = await service
    .from('letter_templates')
    .select('id, file_path, school_name_token, school_code_token, projects(name)')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .single();

  if (!template)
    return NextResponse.json({ error: `No active letter template found for this program` }, { status: 404 });

  // 2. Download template bytes from storage
  const { data: tmplBytes, error: dlErr } = await service.storage
    .from('letter-templates')
    .download(template.file_path);

  if (dlErr || !tmplBytes)
    return NextResponse.json({ error: `Failed to download template: ${dlErr?.message}` }, { status: 500 });

  const templateBuffer = await tmplBytes.arrayBuffer();
  const projectName    = (template as any).projects?.name ?? 'Program';

  // 3. Fetch school details
  const { data: schools } = await service
    .from('schools')
    .select('id, name, school_code')
    .in('id', schoolIds);

  if (!schools?.length)
    return NextResponse.json({ error: 'No schools found' }, { status: 404 });

  // 4. Insert tracking rows
  const trackingInserts = schools.map(s => ({
    school_id:    s.id,
    project_id:   projectId,
    template_id:  template.id,
    status:       'processing',
    triggered_by: body.triggeredBy ?? 'manual',
  }));

  const { data: trackRows } = await service
    .from('school_letters')
    .insert(trackingInserts)
    .select('id, school_id');

  const trackMap = Object.fromEntries(
    (trackRows ?? []).map(r => [r.school_id, r.id])
  );

  // 5. Process each school (sequential to avoid overwhelming LibreOffice)
  const results: { schoolId: string; schoolName: string; status: string; documentId?: string; error?: string }[] = [];

  for (const school of schools) {
    const trackId = trackMap[school.id];
    try {
      const pdfBuffer = await generateLetterPDF(
        templateBuffer,
        school.name,
        school.school_code,
        template.school_name_token,
        template.school_code_token,
      );

      const { documentId } = await uploadLetterToSchool(
        service, pdfBuffer, school.id, school.name, projectName, user.id
      );

      // Update tracking row
      await service.from('school_letters').update({
        status: 'done', document_id: documentId,
        generated_at: new Date().toISOString(),
      }).eq('id', trackId);

      results.push({ schoolId: school.id, schoolName: school.name, status: 'done', documentId });
    } catch (err: any) {
      await service.from('school_letters').update({
        status: 'error', error_message: err.message,
      }).eq('id', trackId);

      results.push({ schoolId: school.id, schoolName: school.name, status: 'error', error: err.message });
    }
  }

  const successCount = results.filter(r => r.status === 'done').length;
  return NextResponse.json({
    ok: true,
    message: `${successCount}/${schools.length} letters generated and uploaded to school dashboards.`,
    results,
  });
}
