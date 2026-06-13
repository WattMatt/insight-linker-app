# Offline Cycle 1b — Inspection-detail edits & photos actually sync (no end-of-day loss)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Offline inspection section inputs and photos (the primary field workflow) currently persist to IndexedDB but are **never pushed to the server**. Wire them onto the hardened mutation queue so they sync on reconnect/app-reopen, with nothing lost at end of a daily session.

**Root cause (verified):** `useOfflineInspectionDetail.saveInspectionSection` / `addOfflineImage` only write to `offlineInspectionDB` (cache + `pending_changes`/`inspection_images`); they queue no mutation, and nothing reads the pending cache to push it. The `UPLOAD_INSPECTION_IMAGE` executor exists but is dead (never queued) and reads the lost `mutation.data.blob`.

**Architecture:** A standalone `enqueueOfflineMutation(type, data, opts?)` appends to the same `offline_mutation_queue` localStorage key (no second `useOfflineSync` hook instance). The inspection hook enqueues `SYNC_INSPECTION` (json_data) on each save (deduped per inspection) and `UPLOAD_INSPECTION_IMAGE` per photo (blob stays in `offlineInspectionDB`, referenced by `imageId`). The single `useOfflineSync` instance (OfflineIndicator) drains the queue on mount + reconnect. Executors fixed to read the blob from IndexedDB and to link images via a server read-modify-write (no orphans).

**Tech Stack:** TS, localStorage queue, IndexedDB (`offlineInspectionDB`), Supabase v2, vitest (node) with an injected `localStorage` mock.

---

## Task 1: `enqueueOfflineMutation` standalone (TDD)

**Files:** Create `src/lib/offlineQueue.ts` + `src/lib/offlineQueue.test.ts`.

- [ ] **Step 1: Failing test** — `src/lib/offlineQueue.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueOfflineMutation, OFFLINE_QUEUE_KEY } from './offlineQueue';

function mockLocalStorage() {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe('enqueueOfflineMutation', () => {
  beforeEach(() => mockLocalStorage());

  it('appends a well-formed mutation to the shared queue', () => {
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { a: 1 } });
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ type: 'SYNC_INSPECTION', data: { id: 'i1', json_data: { a: 1 } }, retries: 0 });
    expect(typeof q[0].id).toBe('string');
  });

  it('dedupes by dedupeKey — repeated saves collapse to the latest', () => {
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { v: 1 } }, { dedupeKey: 'i1' });
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { v: 2 } }, { dedupeKey: 'i1' });
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0].data.json_data.v).toBe(2);
  });

  it('does NOT dedupe distinct items without a dedupeKey', () => {
    enqueueOfflineMutation('UPLOAD_INSPECTION_IMAGE', { imageId: 'a' });
    enqueueOfflineMutation('UPLOAD_INSPECTION_IMAGE', { imageId: 'b' });
    expect(JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — FAIL** (`npx vitest run src/lib/offlineQueue.test.ts`) → "Cannot find module './offlineQueue'".

- [ ] **Step 3: Implement** — `src/lib/offlineQueue.ts`:
```ts
// Standalone append to the offline mutation queue (same localStorage key useOfflineSync drains).
// Used by hooks that need to enqueue without instantiating the full useOfflineSync hook.
export const OFFLINE_QUEUE_KEY = 'offline_mutation_queue';

interface QueuedMutation {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

export function enqueueOfflineMutation(
  type: string,
  data: unknown,
  opts?: { dedupeKey?: string },
): void {
  let queue: QueuedMutation[] = [];
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    queue = stored ? JSON.parse(stored) : [];
  } catch {
    queue = [];
  }
  if (opts?.dedupeKey) {
    queue = queue.filter(
      m => !(m.type === type && (m.data as { id?: string })?.id === opts.dedupeKey),
    );
  }
  queue.push({ id: crypto.randomUUID(), type, data, timestamp: Date.now(), retries: 0 });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}
```
(NOTE: `useOfflineSync.ts` uses the same literal `'offline_mutation_queue'`; keep them identical. The dedupe matches on `data.id` — `SYNC_INSPECTION` carries `{ id: inspectionId }`, so `dedupeKey = inspectionId`.)

- [ ] **Step 4: Run — PASS** (3 tests).
- [ ] **Step 5: Commit**: `git commit -m "feat(offline): standalone enqueueOfflineMutation (shared queue, dedupe)"`

---

## Task 2: Queue inspection edits + photos from the detail hook

**Files:** Modify `src/hooks/useOfflineInspectionDetail.ts`.

- [ ] **Step 1: Import**
Add: `import { enqueueOfflineMutation } from '@/lib/offlineQueue';`

- [ ] **Step 2: `saveInspectionSection` — queue the json_data push**
After `await offlineInspectionDB.updateCachedInspectionData(inspectionId, updatedJsonData);` (line ~157), add:
```ts
      // Queue a server sync of the full json_data (deduped per inspection so a day of edits = one pending push).
      enqueueOfflineMutation('SYNC_INSPECTION', { id: inspectionId, json_data: updatedJsonData }, { dedupeKey: inspectionId });
```

- [ ] **Step 3: `addOfflineImage` — queue the photo upload**
After `await offlineInspectionDB.saveInspectionImage(offlineImage);` (line ~197), add:
```ts
      // Queue the upload. The blob stays in offlineInspectionDB (inspection_images), referenced by imageId —
      // it is NEVER put into the localStorage queue.
      enqueueOfflineMutation('UPLOAD_INSPECTION_IMAGE', {
        imageId, inspectionId, sectionKey, itemKey: itemKey || null,
      });
```

- [ ] **Step 4: Verify build** (`npm run build`) → success.
- [ ] **Step 5: Commit**: `git commit -m "feat(offline): queue inspection section edits + photos for sync (were never pushed)"`

---

## Task 3: Fix the `UPLOAD_INSPECTION_IMAGE` executor + add `SYNC_INSPECTION`

**Files:** Modify `src/hooks/useOfflineSync.ts`.

- [ ] **Step 1: `SYNC_INSPECTION` executor**
Add a new case in `executeMutation` (next to `UPDATE_INSPECTION`):
```ts
      case 'SYNC_INSPECTION': {
        const { id, json_data } = mutation.data;
        const { error } = await supabase.from('inspections')
          .update({ json_data, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');
        await offlineInspectionDB.markInspectionSynced(id); // clears pending_changes in the cache
        break;
      }
```

- [ ] **Step 2: Rewrite `UPLOAD_INSPECTION_IMAGE` to read the blob from IndexedDB + link via server read-modify-write**
Replace the existing `case 'UPLOAD_INSPECTION_IMAGE': { ... }` block with:
```ts
      case 'UPLOAD_INSPECTION_IMAGE': {
        const { imageId, inspectionId, sectionKey, itemKey } = mutation.data;
        const { offlineInspectionDB } = await import('@/lib/offlineInspectionDB');

        // Read the blob from IndexedDB (NOT mutation.data.blob — that never survived the JSON queue).
        const images = await offlineInspectionDB.getInspectionImages(inspectionId);
        const image = images.find(i => i.id === imageId);
        if (!image) throw new Error(`UPLOAD_INSPECTION_IMAGE: image ${imageId} missing in offlineInspectionDB`);

        const fileExtension = (image.file_name?.split('.').pop()) || 'jpg';
        const filePath = `${inspectionId}/${sectionKey}/${itemKey || 'general'}/${imageId}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('inspection-photos').upload(filePath, image.blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(filePath);

        // Link into the inspection's json_data via a server read-modify-write so it's never orphaned
        // (independent of whether the local cache still exists).
        const { data: row, error: readError } = await supabase
          .from('inspections').select('json_data').eq('id', inspectionId).single();
        if (readError) throw readError;
        const jsonData = { ...(row?.json_data || {}) } as Record<string, any>;
        const targetKey = itemKey || 'images';
        jsonData[sectionKey] = jsonData[sectionKey] || {};
        jsonData[sectionKey][targetKey] = jsonData[sectionKey][targetKey] || { photos: [] };
        jsonData[sectionKey][targetKey].photos = jsonData[sectionKey][targetKey].photos || [];
        if (!jsonData[sectionKey][targetKey].photos.includes(publicUrl)) {
          jsonData[sectionKey][targetKey].photos.push(publicUrl); // idempotent: no dupe URL on retry
        }
        const { error: updError } = await supabase.from('inspections')
          .update({ json_data: jsonData, updated_at: new Date().toISOString() }).eq('id', inspectionId);
        if (updError) throw updError;

        await offlineInspectionDB.markImageSynced(imageId, publicUrl);
        break;
      }
```
(This also resolves the audit's "orphaned image" finding — the link is written against the live server row, idempotently.)

- [ ] **Step 3: Verify build** (`npm run build`) → success.
- [ ] **Step 4: Commit**: `git commit -m "fix(offline): UPLOAD_INSPECTION_IMAGE reads blob from IndexedDB + links via server RMW; add SYNC_INSPECTION"`

---

## Task 4: Verification

- [ ] `npm test` → PASS (incl. `offlineQueue.test.ts` + the Cycle-1 round-trip).
- [ ] `npm run build` → exit 0.
- [ ] rules-of-hooks sweep on `useOfflineInspectionDetail.ts` + `useOfflineSync.ts` → 0 violations.
- [ ] Grep: confirm `BATCH_UPLOAD_INSPECTION_IMAGES` is still unused (we did not wire it); leave a note that single-image queueing is the supported path.

## Notes
- **End-to-end durability now:** edit/photo offline → persisted (IndexedDB) AND queued (localStorage) immediately → `processQueue` runs on app mount + on `online` event → `SYNC_INSPECTION` pushes json_data, `UPLOAD_INSPECTION_IMAGE` uploads the blob + links it → cache `pending_changes` cleared / image marked synced. Nothing relies on the tab staying open.
- Dedup keeps the queue small across a long offline session.
- `BATCH_UPLOAD_INSPECTION_IMAGES` left as-is (unused); not in scope.
