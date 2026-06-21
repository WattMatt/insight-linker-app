export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
] as const;

export type UploadValidation = { ok: true } | { ok: false; reason: string };

export function validateUploadFile(file: File): UploadValidation {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: `"${file.name}" has an unsupported file type (.${ext || 'none'}).` };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
    return { ok: false, reason: `"${file.name}" is too large (max ${mb} MB).` };
  }
  return { ok: true };
}
