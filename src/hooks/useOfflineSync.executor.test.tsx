/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { setOnline } from '@/test/online';
import { OFFLINE_QUEUE_KEY } from '@/lib/offlineQueue';

// Executor coverage for the mutation types the sibling suites never drain
// (useOfflineSync.syncInspection/.queueRaces only seed SYNC_INSPECTION). Every case
// asserts BOTH halves of the contract: the Supabase call shape, and what the queue
// looks like afterwards — a mutation that carries user evidence (a document, a pin
// photo, an inspection image) must survive in the queue when its write fails.

interface TableCall {
  table: string;
  op: 'upsert' | 'update' | 'insert' | 'delete' | 'select';
  payload?: unknown;
  options?: unknown;
  filters: Array<[string, unknown]>;
}

interface StorageCall {
  bucket: string;
  op: 'upload' | 'getPublicUrl';
  path: string;
  options?: unknown;
}

const { calls, control } = vi.hoisted(() => ({
  calls: { table: [] as TableCall[], storage: [] as StorageCall[] },
  control: {
    tableError: null as { message: string } | null,
    readError: null as { message: string } | null,
    uploadError: null as { message: string } | null,
    serverJson: {} as Record<string, unknown>,
  },
}));

vi.mock('@/integrations/supabase/client', () => {
  interface Chain {
    eq: (column: string, value: unknown) => Chain;
    single: () => Promise<{ data: { json_data: unknown }; error: unknown }>;
    then: (
      onFulfilled?: (v: { data: null; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise<unknown>;
  }

  const record = (table: string, op: TableCall['op'], payload?: unknown, options?: unknown): Chain => {
    const entry: TableCall = { table, op, payload, options, filters: [] };
    calls.table.push(entry);
    const chain: Chain = {
      eq: (column, value) => {
        entry.filters.push([column, value]);
        return chain;
      },
      single: () => Promise.resolve({ data: { json_data: control.serverJson }, error: control.readError }),
      // The builder is awaited directly for writes (`await supabase.from(x).update(y).eq(...)`),
      // so it has to be thenable, not just chainable.
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: null, error: control.tableError }).then(onFulfilled, onRejected),
    };
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => ({
        upsert: (payload: unknown, options?: unknown) => record(table, 'upsert', payload, options),
        update: (payload: unknown) => record(table, 'update', payload),
        insert: (payload: unknown) => record(table, 'insert', payload),
        delete: () => record(table, 'delete'),
        select: (columns?: string) => record(table, 'select', columns),
      }),
      storage: {
        from: (bucket: string) => ({
          upload: (path: string, _blob: unknown, options?: unknown) => {
            calls.storage.push({ bucket, op: 'upload', path, options });
            return Promise.resolve({ data: { path }, error: control.uploadError });
          },
          getPublicUrl: (path: string) => {
            calls.storage.push({ bucket, op: 'getPublicUrl', path });
            return { data: { publicUrl: `https://cdn.test/${bucket}/${path}` } };
          },
        }),
      },
    },
  };
});

vi.mock('@/lib/offlineDB', () => ({
  offlineDB: {
    getQueuedBlob: vi.fn(),
    deleteQueuedBlob: vi.fn(),
    putQueuedBlob: vi.fn(),
    markInspectionSynced: vi.fn(),
    deleteInspection: vi.fn(),
    getUnsyncedImages: vi.fn(),
    markImageSynced: vi.fn(),
    cleanupOrphanedBlobs: vi.fn(),
  },
}));

vi.mock('@/lib/offlineDBExtensions', () => ({
  markSubsectionSynced: vi.fn(),
  markDocumentSynced: vi.fn(),
  markFloorPlanSynced: vi.fn(),
}));

vi.mock('@/lib/offlineFloorPlanDB', () => ({
  markPinSynced: vi.fn(),
  deleteOfflinePin: vi.fn(),
  markMarkupSynced: vi.fn(),
  deleteMarkup: vi.fn(),
  markMeasurementSynced: vi.fn(),
  deleteMeasurement: vi.fn(),
}));

vi.mock('@/lib/offlineInspectionDB', () => ({
  offlineInspectionDB: {
    markInspectionSynced: vi.fn(),
    getInspectionImages: vi.fn(),
    markImageSynced: vi.fn(),
  },
}));

import { offlineDB, type OfflineImage } from '@/lib/offlineDB';
import { markSubsectionSynced, markDocumentSynced, markFloorPlanSynced } from '@/lib/offlineDBExtensions';
import {
  markPinSynced,
  deleteOfflinePin,
  markMarkupSynced,
  deleteMarkup,
  markMeasurementSynced,
  deleteMeasurement,
} from '@/lib/offlineFloorPlanDB';
import { offlineInspectionDB, type OfflineInspectionImage } from '@/lib/offlineInspectionDB';
import { useOfflineSync } from './useOfflineSync';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

interface SeedMutation {
  id?: string;
  type: string;
  data: unknown;
  retries?: number;
}

interface DrainedMutation {
  id: string;
  type: string;
  data: Record<string, unknown>;
  retries: number;
}

// Mount first, then seed: the mount-effect drain then finds an empty queue, so the
// only drain under test is the explicit processQueue() below (sibling-suite pattern).
async function drain(...mutations: SeedMutation[]): Promise<DrainedMutation[]> {
  const { result } = renderHook(() => useOfflineSync(), { wrapper });
  localStorage.setItem(
    OFFLINE_QUEUE_KEY,
    JSON.stringify(
      mutations.map((m, i) => ({
        id: m.id ?? `mut-${i}`,
        type: m.type,
        data: m.data,
        timestamp: 1,
        retries: m.retries ?? 0,
      })),
    ),
  );

  await act(async () => {
    await result.current.processQueue();
  });

  return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!) as DrainedMutation[];
}

const tableCalls = (table: string, op?: TableCall['op']) =>
  calls.table.filter((c) => c.table === table && (op ? c.op === op : true));

const uploads = () => calls.storage.filter((c) => c.op === 'upload');

const offlineImage = (over: Partial<OfflineImage> = {}): OfflineImage => ({
  id: 'img-1',
  inspection_id: 'insp-1',
  blob: new Blob(['image']),
  file_name: 'shot.jpg',
  created_at: '2026-07-01T00:00:00Z',
  synced: false,
  ...over,
});

const inspectionImage = (over: Partial<OfflineInspectionImage> = {}): OfflineInspectionImage => ({
  id: 'img-9',
  inspection_id: 'insp-6',
  section_key: 'roof',
  item_key: 'item1',
  blob: new Blob(['image']),
  file_name: 'shot.png',
  created_at: '2026-07-01T00:00:00Z',
  synced: false,
  uploaded_url: null,
  ...over,
});

const pin = () => ({
  id: 'pin-1',
  floor_plan_id: 'fp-9',
  pin_number: 3,
  x_position: 10,
  y_position: 20,
  pin_type: 'snag',
  title: 'Cracked conduit',
  notes: 'Left riser',
  detailed_description: 'Conduit split at the coupler',
  priority: 'High',
  status: 'open',
  assigned_contractor: 'FireCo',
  stakeholders: 'landlord',
  package: 'Electrical',
  due_date: '2026-08-01',
  photo_url: null,
  created_by: 'user-1',
});

describe('useOfflineSync — executeMutation coverage (F-34)', () => {
  beforeEach(() => {
    setOnline(true);
    localStorage.clear();
    calls.table.length = 0;
    calls.storage.length = 0;
    control.tableError = null;
    control.readError = null;
    control.uploadError = null;
    control.serverJson = {};
    vi.clearAllMocks();
    vi.mocked(offlineDB.getQueuedBlob).mockResolvedValue(new Blob(['queued']));
    vi.mocked(offlineDB.deleteQueuedBlob).mockResolvedValue(undefined);
    vi.mocked(offlineDB.markInspectionSynced).mockResolvedValue(undefined);
    vi.mocked(offlineDB.deleteInspection).mockResolvedValue(undefined);
    vi.mocked(offlineDB.getUnsyncedImages).mockResolvedValue([]);
    vi.mocked(offlineDB.markImageSynced).mockResolvedValue(undefined);
    vi.mocked(offlineDB.cleanupOrphanedBlobs).mockResolvedValue(0);
    vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([]);
    vi.mocked(offlineInspectionDB.markInspectionSynced).mockResolvedValue(undefined);
    vi.mocked(offlineInspectionDB.markImageSynced).mockResolvedValue(undefined);
  });

  describe('inspection rows', () => {
    it('CREATE_INSPECTION upserts on the row id so a retry cannot duplicate', async () => {
      const row = { id: 'insp-1', title: 'Roof survey', status: 'Draft', site_id: 'site-1' };
      const queue = await drain({ type: 'CREATE_INSPECTION', data: row });

      expect(tableCalls('inspections', 'upsert')).toEqual([
        expect.objectContaining({ payload: [row], options: { onConflict: 'id' } }),
      ]);
      expect(offlineDB.markInspectionSynced).toHaveBeenCalledWith('insp-1');
      expect(queue).toHaveLength(0);
    });

    it('UPDATE_INSPECTION sends the changed columns only and filters on the id', async () => {
      const queue = await drain({
        type: 'UPDATE_INSPECTION',
        data: { id: 'insp-2', status: 'Completed', quality_rating: 4 },
      });

      expect(tableCalls('inspections', 'update')).toEqual([
        expect.objectContaining({
          payload: { status: 'Completed', quality_rating: 4 },
          filters: [['id', 'insp-2']],
        }),
      ]);
      expect(queue).toHaveLength(0);
    });

    it('UPDATE_INSPECTION keeps the mutation queued with a bumped retry when the write fails', async () => {
      control.tableError = { message: 'permission denied' };
      const queue = await drain({
        type: 'UPDATE_INSPECTION',
        data: { id: 'insp-2', status: 'Completed' },
      });

      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });

    it('DELETE_INSPECTION deletes the row and then the cached copy', async () => {
      const queue = await drain({ type: 'DELETE_INSPECTION', data: { id: 'insp-3' } });

      expect(tableCalls('inspections', 'delete')).toEqual([
        expect.objectContaining({ filters: [['id', 'insp-3']] }),
      ]);
      expect(offlineDB.deleteInspection).toHaveBeenCalledWith('insp-3');
      expect(queue).toHaveLength(0);
    });

    it('SAVE_INSPECTION_JSON (legacy queue entries) still drains to a json_data update', async () => {
      const jsonData = { roof: { item1: { notes: 'legacy' } } };
      const queue = await drain({
        type: 'SAVE_INSPECTION_JSON',
        data: { inspectionId: 'insp-5', jsonData },
      });

      expect(tableCalls('inspections', 'update')).toEqual([
        expect.objectContaining({
          payload: { json_data: jsonData, updated_at: expect.any(String) },
          filters: [['id', 'insp-5']],
        }),
      ]);
      expect(offlineInspectionDB.markInspectionSynced).toHaveBeenCalledWith('insp-5');
      expect(queue).toHaveLength(0);
    });
  });

  describe('subsections', () => {
    it('UPDATE_SUBSECTION updates the changed columns and clears the local dirty flag', async () => {
      const queue = await drain({
        type: 'UPDATE_SUBSECTION',
        data: { id: 'sub-1', coc_status: 'Valid', coc_number: 'COC-77' },
      });

      expect(tableCalls('subsections', 'update')).toEqual([
        expect.objectContaining({
          payload: { coc_status: 'Valid', coc_number: 'COC-77' },
          filters: [['id', 'sub-1']],
        }),
      ]);
      expect(markSubsectionSynced).toHaveBeenCalledWith('sub-1');
      expect(queue).toHaveLength(0);
    });
  });

  describe('generic image upload', () => {
    it('UPLOAD_IMAGE uploads the queued blob to the named bucket and releases it', async () => {
      vi.mocked(offlineDB.getUnsyncedImages).mockResolvedValue([
        offlineImage({ id: 'img-1', inspection_id: 'insp-4' }),
      ]);

      const queue = await drain({
        type: 'UPLOAD_IMAGE',
        data: { bucket: 'inspection-photos', path: 'insp-4/a.jpg', blobId: 'blob-1', inspectionId: 'insp-4' },
      });

      expect(uploads()).toEqual([
        { bucket: 'inspection-photos', op: 'upload', path: 'insp-4/a.jpg', options: { upsert: true } },
      ]);
      expect(offlineDB.markImageSynced).toHaveBeenCalledWith('img-1');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-1');
      expect(queue).toHaveLength(0);
    });

    it('UPLOAD_IMAGE retries — and keeps the blob — when the storage upload fails', async () => {
      control.uploadError = { message: 'bucket unavailable' };

      const queue = await drain({
        type: 'UPLOAD_IMAGE',
        data: { bucket: 'inspection-photos', path: 'insp-4/a.jpg', blobId: 'blob-1' },
      });

      expect(offlineDB.deleteQueuedBlob).not.toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });

    it('UPLOAD_IMAGE retries without touching storage when the queued blob is gone', async () => {
      vi.mocked(offlineDB.getQueuedBlob).mockResolvedValue(undefined);

      const queue = await drain({
        type: 'UPLOAD_IMAGE',
        data: { bucket: 'inspection-photos', path: 'insp-4/a.jpg', blobId: 'blob-missing' },
      });

      expect(uploads()).toHaveLength(0);
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });
  });

  describe('document upload', () => {
    it('UPLOAD_DOCUMENT uploads to documents, rows the public URL, then releases the blob', async () => {
      const queue = await drain({
        type: 'UPLOAD_DOCUMENT',
        data: {
          documentId: 'doc-1',
          subsectionId: 'sub-1',
          categoryId: 'cat-1',
          blobId: 'blob-2',
          filePath: 'sub-1/coc.pdf',
          fileName: 'coc.pdf',
          fileSize: 2048,
        },
      });

      expect(uploads()).toEqual([
        { bucket: 'documents', op: 'upload', path: 'sub-1/coc.pdf', options: { upsert: true } },
      ]);
      expect(tableCalls('subsection_documents', 'insert')).toEqual([
        expect.objectContaining({
          payload: {
            subsection_id: 'sub-1',
            category_id: 'cat-1',
            file_name: 'coc.pdf',
            file_url: 'https://cdn.test/documents/sub-1/coc.pdf',
            file_size: 2048,
          },
        }),
      ]);
      expect(markDocumentSynced).toHaveBeenCalledWith('doc-1');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-2');
      expect(queue).toHaveLength(0);
    });

    it('UPLOAD_DOCUMENT keeps the blob and the queue entry when the row insert fails', async () => {
      control.tableError = { message: 'violates row-level security' };

      const queue = await drain({
        type: 'UPLOAD_DOCUMENT',
        data: {
          documentId: 'doc-1',
          subsectionId: 'sub-1',
          categoryId: 'cat-1',
          blobId: 'blob-2',
          filePath: 'sub-1/coc.pdf',
          fileName: 'coc.pdf',
          fileSize: 2048,
        },
      });

      expect(markDocumentSynced).not.toHaveBeenCalled();
      expect(offlineDB.deleteQueuedBlob).not.toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });
  });

  describe('floor plan upload', () => {
    it('UPLOAD_FLOOR_PLAN uploads to documents and rows it against the subsection', async () => {
      const queue = await drain({
        type: 'UPLOAD_FLOOR_PLAN',
        data: {
          floorPlanId: 'fp-1',
          subsectionId: 'sub-2',
          blobId: 'blob-3',
          filePath: 'sub-2/plan.pdf',
          fileName: 'plan.pdf',
        },
      });

      expect(uploads()).toEqual([
        { bucket: 'documents', op: 'upload', path: 'sub-2/plan.pdf', options: { upsert: true } },
      ]);
      expect(tableCalls('subsection_floor_plans', 'insert')).toEqual([
        expect.objectContaining({
          payload: {
            subsection_id: 'sub-2',
            file_name: 'plan.pdf',
            file_url: 'https://cdn.test/documents/sub-2/plan.pdf',
          },
        }),
      ]);
      expect(markFloorPlanSynced).toHaveBeenCalledWith('fp-1');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-3');
      expect(queue).toHaveLength(0);
    });
  });

  describe('floor plan pins', () => {
    it('ADD_FLOOR_PLAN_PIN inserts every pin column with the pin photo uploaded first', async () => {
      const queue = await drain({
        type: 'ADD_FLOOR_PLAN_PIN',
        data: { pin: pin(), photoBlobId: 'blob-4' },
      });

      const upload = uploads()[0];
      expect(upload).toMatchObject({ bucket: 'inspection-photos', options: { upsert: true } });
      expect(upload.path).toMatch(/^floor-plan-pins\/fp-9\/\d+_photo\.jpg$/);

      expect(tableCalls('floor_plan_pins', 'insert')).toEqual([
        expect.objectContaining({
          payload: {
            floor_plan_id: 'fp-9',
            pin_number: 3,
            x_position: 10,
            y_position: 20,
            pin_type: 'snag',
            title: 'Cracked conduit',
            notes: 'Left riser',
            detailed_description: 'Conduit split at the coupler',
            priority: 'High',
            status: 'open',
            assigned_contractor: 'FireCo',
            stakeholders: 'landlord',
            package: 'Electrical',
            due_date: '2026-08-01',
            photo_url: `https://cdn.test/inspection-photos/${upload.path}`,
            created_by: 'user-1',
          },
        }),
      ]);
      expect(markPinSynced).toHaveBeenCalledWith('pin-1');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-4');
      expect(queue).toHaveLength(0);
    });

    it('ADD_FLOOR_PLAN_PIN skips storage entirely for a photo-less pin', async () => {
      const queue = await drain({ type: 'ADD_FLOOR_PLAN_PIN', data: { pin: pin() } });

      expect(calls.storage).toHaveLength(0);
      expect(offlineDB.getQueuedBlob).not.toHaveBeenCalled();
      expect(tableCalls('floor_plan_pins', 'insert')[0].payload).toMatchObject({ photo_url: null });
      expect(queue).toHaveLength(0);
    });

    it('ADD_FLOOR_PLAN_PIN keeps the pin queued when its photo blob is missing', async () => {
      vi.mocked(offlineDB.getQueuedBlob).mockResolvedValue(undefined);

      const queue = await drain({
        type: 'ADD_FLOOR_PLAN_PIN',
        data: { pin: pin(), photoBlobId: 'blob-missing' },
      });

      expect(tableCalls('floor_plan_pins')).toHaveLength(0);
      expect(markPinSynced).not.toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });

    it('UPDATE_FLOOR_PLAN_PIN uploads the replacement photo and folds its URL into the update', async () => {
      const queue = await drain({
        type: 'UPDATE_FLOOR_PLAN_PIN',
        data: {
          pinId: 'pin-2',
          updates: { status: 'closed', notes: 'repaired' },
          photoBlobId: 'blob-5',
          photoFileName: 'after.jpg',
        },
      });

      const upload = uploads()[0];
      expect(upload.bucket).toBe('inspection-photos');
      expect(upload.path).toMatch(/^floor-plan-pins\/pin-2\/\d+_after\.jpg$/);

      expect(tableCalls('floor_plan_pins', 'update')).toEqual([
        expect.objectContaining({
          payload: {
            status: 'closed',
            notes: 'repaired',
            photo_url: `https://cdn.test/inspection-photos/${upload.path}`,
          },
          filters: [['id', 'pin-2']],
        }),
      ]);
      expect(markPinSynced).toHaveBeenCalledWith('pin-2');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-5');
      expect(queue).toHaveLength(0);
    });

    it('UPDATE_FLOOR_PLAN_PIN without a new photo carries the existing photo_url through', async () => {
      const queue = await drain({
        type: 'UPDATE_FLOOR_PLAN_PIN',
        data: { pinId: 'pin-2', updates: { status: 'closed', photo_url: 'https://cdn.test/old.jpg' } },
      });

      expect(calls.storage).toHaveLength(0);
      expect(tableCalls('floor_plan_pins', 'update')[0].payload).toEqual({
        status: 'closed',
        photo_url: 'https://cdn.test/old.jpg',
      });
      expect(queue).toHaveLength(0);
    });

    it('DELETE_FLOOR_PLAN_PIN deletes the row then the local pin', async () => {
      const queue = await drain({ type: 'DELETE_FLOOR_PLAN_PIN', data: { pinId: 'pin-3' } });

      expect(tableCalls('floor_plan_pins', 'delete')).toEqual([
        expect.objectContaining({ filters: [['id', 'pin-3']] }),
      ]);
      expect(deleteOfflinePin).toHaveBeenCalledWith('pin-3');
      expect(queue).toHaveLength(0);
    });

    it('DELETE_FLOOR_PLAN_PIN drops the local pin even when the server delete errors today', async () => {
      // Characterisation: this branch never inspects the delete's `error`, so a rejected
      // server delete still removes the offline pin and clears the queue entry.
      control.tableError = { message: 'violates row-level security' };

      const queue = await drain({ type: 'DELETE_FLOOR_PLAN_PIN', data: { pinId: 'pin-3' } });

      expect(deleteOfflinePin).toHaveBeenCalledWith('pin-3');
      expect(queue).toHaveLength(0);
    });
  });

  describe('local-only floor plan annotations', () => {
    it('ADD_MARKUP marks the markup synced without any server write', async () => {
      const queue = await drain({ type: 'ADD_MARKUP', data: { markup: { id: 'mk-1' } } });

      expect(calls.table).toHaveLength(0);
      expect(markMarkupSynced).toHaveBeenCalledWith('mk-1');
      expect(queue).toHaveLength(0);
    });

    it('DELETE_MARKUP deletes locally without any server write', async () => {
      const queue = await drain({ type: 'DELETE_MARKUP', data: { markupId: 'mk-2' } });

      expect(calls.table).toHaveLength(0);
      expect(deleteMarkup).toHaveBeenCalledWith('mk-2');
      expect(queue).toHaveLength(0);
    });

    it('ADD_MEASUREMENT marks the measurement synced without any server write', async () => {
      const queue = await drain({ type: 'ADD_MEASUREMENT', data: { measurement: { id: 'ms-1' } } });

      expect(calls.table).toHaveLength(0);
      expect(markMeasurementSynced).toHaveBeenCalledWith('ms-1');
      expect(queue).toHaveLength(0);
    });

    it('DELETE_MEASUREMENT deletes locally without any server write', async () => {
      const queue = await drain({ type: 'DELETE_MEASUREMENT', data: { measurementId: 'ms-2' } });

      expect(calls.table).toHaveLength(0);
      expect(deleteMeasurement).toHaveBeenCalledWith('ms-2');
      expect(queue).toHaveLength(0);
    });
  });

  describe('inspection image upload', () => {
    it('UPLOAD_INSPECTION_IMAGE uploads under inspection/section/item and links the URL into json_data', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([inspectionImage()]);
      control.serverJson = { roof: { item1: { notes: 'existing' } } };

      const queue = await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      const path = 'insp-6/roof/item1/img-9.png';
      const url = `https://cdn.test/inspection-photos/${path}`;
      expect(uploads()).toEqual([
        { bucket: 'inspection-photos', op: 'upload', path, options: { upsert: true } },
      ]);
      expect(tableCalls('inspections', 'update')).toEqual([
        expect.objectContaining({
          payload: {
            json_data: { roof: { item1: { notes: 'existing', photos: [url] } } },
            updated_at: expect.any(String),
          },
          filters: [['id', 'insp-6']],
        }),
      ]);
      expect(offlineInspectionDB.markImageSynced).toHaveBeenCalledWith('img-9', url);
      expect(queue).toHaveLength(0);
    });

    it('UPLOAD_INSPECTION_IMAGE files an item-less capture under the section images key', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([
        inspectionImage({ item_key: null }),
      ]);

      await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: null },
      });

      expect(uploads()[0].path).toBe('insp-6/roof/general/img-9.png');
      const payload = tableCalls('inspections', 'update')[0].payload as { json_data: Record<string, unknown> };
      expect(payload.json_data).toEqual({
        roof: { images: { photos: ['https://cdn.test/inspection-photos/insp-6/roof/general/img-9.png'] } },
      });
    });

    it('UPLOAD_INSPECTION_IMAGE appends a dot-less file name as the extension today', async () => {
      // Characterisation: split('.').pop() on a name with no dot returns the whole name,
      // so the 'jpg' fallback only fires for an empty/absent file name.
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([
        inspectionImage({ file_name: 'scan' }),
      ]);

      await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      expect(uploads()[0].path).toBe('insp-6/roof/item1/img-9.scan');
    });

    it('UPLOAD_INSPECTION_IMAGE falls back to a jpg extension when the file name is empty', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([
        inspectionImage({ file_name: '' }),
      ]);

      await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      expect(uploads()[0].path).toBe('insp-6/roof/item1/img-9.jpg');
    });

    it('UPLOAD_INSPECTION_IMAGE does not duplicate a URL already present on the server', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([inspectionImage()]);
      const url = 'https://cdn.test/inspection-photos/insp-6/roof/item1/img-9.png';
      control.serverJson = { roof: { item1: { photos: [url] } } };

      await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      const payload = tableCalls('inspections', 'update')[0].payload as {
        json_data: { roof: { item1: { photos: string[] } } };
      };
      expect(payload.json_data.roof.item1.photos).toEqual([url]);
    });

    it('UPLOAD_INSPECTION_IMAGE keeps the capture queued when the image is missing from IndexedDB', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([]);

      const queue = await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      expect(uploads()).toHaveLength(0);
      expect(offlineInspectionDB.markImageSynced).not.toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });

    it('UPLOAD_INSPECTION_IMAGE keeps the capture queued when the json_data read fails', async () => {
      vi.mocked(offlineInspectionDB.getInspectionImages).mockResolvedValue([inspectionImage()]);
      control.readError = { message: 'timeout' };

      const queue = await drain({
        type: 'UPLOAD_INSPECTION_IMAGE',
        data: { imageId: 'img-9', inspectionId: 'insp-6', sectionKey: 'roof', itemKey: 'item1' },
      });

      expect(tableCalls('inspections', 'update')).toHaveLength(0);
      expect(offlineInspectionDB.markImageSynced).not.toHaveBeenCalled();
      expect(queue).toHaveLength(1);
      expect(queue[0].retries).toBe(1);
    });
  });

  describe('queue outcomes shared by every type', () => {
    it('discards a mutation at MAX_RETRIES and deletes both blob references it held', async () => {
      vi.mocked(offlineDB.getQueuedBlob).mockResolvedValue(undefined);

      const queue = await drain(
        {
          id: 'doc-mut',
          type: 'UPLOAD_DOCUMENT',
          retries: 3,
          data: {
            documentId: 'doc-1',
            subsectionId: 'sub-1',
            categoryId: 'cat-1',
            blobId: 'blob-doc',
            filePath: 'sub-1/coc.pdf',
            fileName: 'coc.pdf',
            fileSize: 1,
          },
        },
        { id: 'pin-mut', type: 'ADD_FLOOR_PLAN_PIN', retries: 3, data: { pin: pin(), photoBlobId: 'blob-pin' } },
      );

      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-doc');
      expect(offlineDB.deleteQueuedBlob).toHaveBeenCalledWith('blob-pin');
      expect(queue).toHaveLength(0);
    });

    it('drops an unrecognised mutation type from the queue without syncing it today', async () => {
      // Characterisation: the executor's default branch only console.warns, so the drain
      // counts the mutation as a success and it leaves the queue unsynced.
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const queue = await drain({ type: 'RENAME_SITE', data: { id: 'site-1' } });

      expect(calls.table).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith('Unknown mutation type:', 'RENAME_SITE');
      expect(queue).toHaveLength(0);
      warn.mockRestore();
    });
  });
});
