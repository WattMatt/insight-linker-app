import { supabase } from '@/integrations/supabase/client';
import { storagePathFromUrl, splitNameExt, buildRenamePath, buildMovePath, type DocSource } from './paths';

const BUCKET = 'documents';

export interface DocRef {
  id: string;
  source: DocSource;
  file_name: string;
  file_url: string;
  site_id?: string | null;        // site docs
  subsection_id?: string | null;  // subsection docs
  category_id: string | null;
  coc_number?: string | null;
}

export interface TargetCategory { id: string; name: string }
export interface MutationResult { id: string; ok: boolean; error?: string }

function tableFor(source: DocSource): 'site_documents' | 'subsection_documents' {
  return source === 'subsection' ? 'subsection_documents' : 'site_documents';
}

async function currentUser(): Promise<{ id: string | null; email: string | null }> {
  const { data } = await supabase.auth.getUser();
  return { id: data?.user?.id ?? null, email: data?.user?.email ?? null };
}

export async function logDocumentActivity(action: string, details: Record<string, unknown>): Promise<void> {
  const user = await currentUser();
  await supabase.from('activity_logs').insert({
    action,
    user_email: user.email ?? 'unknown',
    user_id: user.id,
    details: JSON.stringify(details),
  });
}

// Relocate one storage object (download -> upload). Returns the new STORAGE
// PATH (the bucket is private — file_url stores paths, and readers mint
// signed URLs via documentUrl.ts). Mirrors src/lib/imageNaming.ts (repo has
// no storage.copy/move).
async function relocateObject(oldPath: string, newPath: string): Promise<string> {
  const dl = await supabase.storage.from(BUCKET).download(oldPath);
  if (dl.error || !dl.data) throw new Error('Could not read the stored file.');
  const up = await supabase.storage.from(BUCKET).upload(newPath, dl.data, { cacheControl: '3600', upsert: false });
  if (up.error) throw new Error('Could not write the file to its new location.');
  return newPath;
}

export async function renameDocument(doc: DocRef, newName: string, now: number = Date.now()): Promise<MutationResult> {
  const trimmed = newName.trim();
  if (!trimmed) return { id: doc.id, ok: false, error: 'Name cannot be empty.' };

  const oldPath = storagePathFromUrl(doc.file_url);
  if (!oldPath) return { id: doc.id, ok: false, error: 'File is not in managed storage.' };

  const { ext } = splitNameExt(doc.file_name);
  const newBase = splitNameExt(trimmed).base || trimmed; // strip a typed-in extension if any
  const newPath = buildRenamePath(oldPath, newBase, ext, now);
  const newFileName = `${newBase}${ext}`;

  let newUrl: string;
  try { newUrl = await relocateObject(oldPath, newPath); }
  catch (e) { return { id: doc.id, ok: false, error: (e as Error).message }; }

  const user = await currentUser();
  const payload: Record<string, unknown> = { file_name: newFileName, file_url: newUrl };
  if (doc.source === 'site') payload.updated_by = user.id; // site_documents only

  const { error } = await supabase.from(tableFor(doc.source)).update(payload).eq('id', doc.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([newPath]).catch(() => {}); // roll back the copy
    return { id: doc.id, ok: false, error: error.message };
  }

  await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {}); // best-effort
  await logDocumentActivity('document_renamed', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, old_name: doc.file_name, new_name: newFileName,
  });
  return { id: doc.id, ok: true };
}

async function moveOne(doc: DocRef, target: TargetCategory, now: number): Promise<MutationResult> {
  const oldPath = storagePathFromUrl(doc.file_url);
  if (!oldPath) return { id: doc.id, ok: false, error: 'File is not in managed storage.' };

  const newPath = buildMovePath({
    source: doc.source, siteId: doc.site_id ?? null, subsectionId: doc.subsection_id ?? null,
    targetCategoryId: target.id, targetCategoryName: target.name, fileName: doc.file_name, timestamp: now,
  });

  let newUrl: string;
  try { newUrl = await relocateObject(oldPath, newPath); }
  catch (e) { return { id: doc.id, ok: false, error: (e as Error).message }; }

  const user = await currentUser();
  const payload: Record<string, unknown> = { category_id: target.id, file_url: newUrl };
  if (doc.source === 'site') { payload.category = target.name; payload.updated_by = user.id; }

  const { error } = await supabase.from(tableFor(doc.source)).update(payload).eq('id', doc.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([newPath]).catch(() => {});
    return { id: doc.id, ok: false, error: error.message };
  }

  await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  await logDocumentActivity('document_moved', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, from_category_id: doc.category_id,
    to_category_id: target.id, to_category_name: target.name,
  });
  return { id: doc.id, ok: true };
}

export async function moveDocuments(docs: DocRef[], target: TargetCategory, now: number = Date.now()): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const doc of docs) {
    try { results.push(await moveOne(doc, target, now)); }
    catch (e) { results.push({ id: doc.id, ok: false, error: (e as Error).message }); }
  }
  return results;
}

async function deleteOne(doc: DocRef): Promise<MutationResult> {
  // storagePathFromUrl handles both legacy full URLs and bare-path rows.
  const path = storagePathFromUrl(doc.file_url);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {}); // best-effort
  }
  const { error } = await supabase.from(tableFor(doc.source)).delete().eq('id', doc.id);
  if (error) return { id: doc.id, ok: false, error: error.message };
  await logDocumentActivity('document_deleted', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, file_name: doc.file_name,
  });
  return { id: doc.id, ok: true };
}

export async function deleteDocuments(docs: DocRef[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const doc of docs) {
    try { results.push(await deleteOne(doc)); }
    catch (e) { results.push({ id: doc.id, ok: false, error: (e as Error).message }); }
  }
  return results;
}
