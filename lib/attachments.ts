import { supabase } from "./supabase";

export const MAX_FILE = 10 * 1024 * 1024; // 10 MB
export const ACCEPT =
  "application/pdf,image/*,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const fileSize = (b: number | null | undefined) =>
  !b ? "" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`;

// Uploads files and links them to a quotation or invoice. Returns a list of problems (empty = all ok).
export async function uploadFiles(
  companyId: string,
  target: { quotationId?: string; invoiceId?: string },
  files: File[]
): Promise<string[]> {
  const recordId = (target.quotationId || target.invoiceId) as string;
  const problems: string[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE) {
      problems.push(`${f.name}: larger than 10 MB`);
      continue;
    }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${companyId}/${recordId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, f, { contentType: f.type || undefined });
    if (upErr) {
      problems.push(`${f.name}: ${upErr.message}`);
      continue;
    }
    const { error: rowErr } = await supabase.from("attachments").insert({
      company_id: companyId,
      quotation_id: target.quotationId || null,
      invoice_id: target.invoiceId || null,
      file_path: path,
      file_name: f.name,
      mime_type: f.type || null,
      size_bytes: f.size,
    });
    if (rowErr) {
      await supabase.storage.from("attachments").remove([path]);
      problems.push(`${f.name}: ${rowErr.message}`);
    }
  }
  return problems;
}
