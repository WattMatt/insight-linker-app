import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    updatePayload: undefined as any,
    updateTable: '' as string,
    updateError: null as null | { message: string },
    deleteError: null as null | { message: string },
    removed: [] as string[][],
    uploaded: [] as string[],
    uploadError: null as null | { message: string },
    activity: undefined as any,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'a@b.com' } } }) },
    from: (table: string) => ({
      update: (payload: any) => { state.updateTable = table; state.updatePayload = payload; return { eq: () => Promise.resolve({ error: state.updateError }) }; },
      insert: (payload: any) => { if (table === 'activity_logs') state.activity = payload; return Promise.resolve({ error: null }); },
      delete: () => ({ eq: () => Promise.resolve({ error: state.deleteError }) }),
    }),
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: new Blob(['x']), error: null }),
        upload: (path: string) => { state.uploaded.push(path); return Promise.resolve({ data: { path }, error: state.uploadError }); },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/storage/v1/object/public/documents/${path}` } }),
        remove: (paths: string[]) => { state.removed.push(paths); return Promise.resolve({ error: null }); },
      }),
    },
  },
}));

import { renameDocument, moveDocuments, deleteDocuments, type DocRef } from './documentMutations';

const siteDoc: DocRef = {
  id: 'd1', source: 'site', file_name: 'Old.pdf',
  file_url: 'https://x/storage/v1/object/public/documents/s1/02 Manuals/111-old.pdf',
  site_id: 's1', subsection_id: null, category_id: 'c1', coc_number: null,
};

beforeEach(() => {
  state.updatePayload = undefined; state.updateTable = ''; state.updateError = null; state.deleteError = null;
  state.removed = []; state.uploaded = []; state.uploadError = null; state.activity = undefined;
});

describe('renameDocument', () => {
  it('uploads a new object, updates file_name + file_url, removes the old object, logs activity', async () => {
    const res = await renameDocument(siteDoc, 'Brand New', 1000);
    expect(res.ok).toBe(true);
    expect(state.updateTable).toBe('site_documents');
    expect(state.updatePayload.file_name).toBe('Brand New.pdf');
    expect(state.updatePayload.file_url).toContain('s1/02 Manuals/1000-Brand_New.pdf');
    expect(state.updatePayload.updated_by).toBe('user-1');
    expect(state.removed[0][0]).toBe('s1/02 Manuals/111-old.pdf');
    expect(state.activity.action).toBe('document_renamed');
  });

  it('rejects an empty name', async () => {
    const res = await renameDocument(siteDoc, '   ', 1000);
    expect(res.ok).toBe(false);
    expect(state.uploaded.length).toBe(0);
  });

  it('rolls back the copy when the DB update fails', async () => {
    state.updateError = { message: 'boom' };
    const res = await renameDocument(siteDoc, 'Brand New', 1000);
    expect(res.ok).toBe(false);
    expect(state.removed.some(r => r[0].includes('1000-Brand_New.pdf'))).toBe(true);
    expect(state.removed.some(r => r[0] === 's1/02 Manuals/111-old.pdf')).toBe(false);
  });
});

describe('moveDocuments (site)', () => {
  it('updates category_id + category text + file_url for a site doc', async () => {
    const results = await moveDocuments([siteDoc], { id: 'c2', name: '04 Metering' }, 2000);
    expect(results[0].ok).toBe(true);
    expect(state.updatePayload.category_id).toBe('c2');
    expect(state.updatePayload.category).toBe('04 Metering');
    expect(state.updatePayload.file_url).toContain('s1/04_Metering/2000-Old.pdf');
    expect(state.activity.action).toBe('document_moved');
  });
});

describe('deleteDocuments', () => {
  it('removes the storage object, deletes the row, and logs per doc', async () => {
    const results = await deleteDocuments([{ ...siteDoc, file_url: 'https://x.supabase.co/storage/v1/object/public/documents/s1/02 Manuals/111-old.pdf' }]);
    expect(results[0].ok).toBe(true);
    expect(state.removed[0][0]).toBe('s1/02 Manuals/111-old.pdf');
    expect(state.activity.action).toBe('document_deleted');
  });
});
