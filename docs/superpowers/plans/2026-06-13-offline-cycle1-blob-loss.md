# Offline Cycle 1 — Kill the queue file-loss + idempotent sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop offline image/document/floor-plan uploads from silently losing their file (they currently put a `File`/`Blob` into the localStorage mutation queue, which `JSON.stringify` turns into `{}`), and make upload/create retries idempotent.

**Architecture:** Queued uploads write the blob to a new IndexedDB store (`queued_blobs`) keyed by a UUID `blobId`; the localStorage mutation carries only `{ blobId, fileName, ... }` — never a `File`. At sync, the executor re-reads the blob from IndexedDB, uploads it with `{ upsert: true }`, then deletes it. `CREATE_INSPECTION` uses a real UUID id + `upsert(onConflict: 'id')`.

**Tech Stack:** TypeScript, IndexedDB (`src/lib/offlineDB.ts`, a class wrapping IDB in promises), Supabase JS v2 storage/table APIs, vitest (node env) + **`fake-indexeddb`** (new dev-dep) for the round-trip test.

**Audit + scope:** docs/superpowers/specs — this is Cycle 1 of the offline-hardening program. In scope: the 5 `queueMutation` upload paths — `UPLOAD_IMAGE`, `UPLOAD_DOCUMENT`, `UPLOAD_FLOOR_PLAN`, `ADD_FLOOR_PLAN_PIN` (photo), `UPDATE_FLOOR_PLAN_PIN` (photo) — plus `CREATE_INSPECTION` idempotency. **Out of scope (Cycle 5):** `UPLOAD_INSPECTION_IMAGE` / `BATCH_UPLOAD_INSPECTION_IMAGES` (they persist blobs in `offlineInspectionDB` and are queued via a different path — fixed during the unify cycle).

---

## File structure

**Create**
- `src/lib/offlineDB.queuedBlobs.test.ts` — fake-indexeddb round-trip test (the fix's proof).

**Modify**
- `src/lib/offlineDB.ts` — bump `DB_VERSION` 4→5; add `queued_blobs` store + `putQueuedBlob`/`getQueuedBlob`/`deleteQueuedBlob`.
- `src/hooks/useOfflineSync.ts` — add `queueUpload`; rewrite the 5 upload executor cases to use `blobId` + `{ upsert: true }`; `CREATE_INSPECTION` → upsert.
- `src/hooks/useOfflineInspections.ts` — `UPLOAD_IMAGE` call site → `queueUpload`; `createInspection` id → `crypto.randomUUID()`.
- `src/hooks/useOfflineSubsections.ts` — `UPLOAD_DOCUMENT` + `UPLOAD_FLOOR_PLAN` call sites → `queueUpload`.
- `src/hooks/useOfflineFloorPlanAnnotations.ts` — `ADD_FLOOR_PLAN_PIN` + `UPDATE_FLOOR_PLAN_PIN` photo handling → store via `queueUpload`/`putQueuedBlob`.
- `package.json` — add `fake-indexeddb` dev-dep.

---

## Task 1: Add `queued_blobs` store + helpers (TDD via fake-indexeddb)

**Files:**
- Modify: `src/lib/offlineDB.ts`
- Create: `src/lib/offlineDB.queuedBlobs.test.ts`
- Modify: `package.json` (dev-dep)

- [ ] **Step 1: Add the dev-dep**

Run: `npm install -D fake-indexeddb`
Expected: `fake-indexeddb` added to `devDependencies`.

- [ ] **Step 2: Write the failing test**

Create `src/lib/offlineDB.queuedBlobs.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineDB } from './offlineDB';

describe('queued_blobs round-trip (the file-loss fix)', () => {
  it('a queued upload survives the localStorage JSON round-trip without losing the blob', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });

    const blobId = await offlineDB.putQueuedBlob(original, { fileName: 'x.jpg', fileType: 'image/jpeg' });
    expect(typeof blobId).toBe('string');

    // The mutation payload that goes to localStorage must reference the blob, never carry it.
    const mutationData = { bucket: 'inspection-photos', path: 'p/x.jpg', blobId, fileName: 'x.jpg' };
    const roundTripped = JSON.parse(JSON.stringify(mutationData));
    expect(roundTripped.blobId).toBe(blobId);
    expect('file' in roundTripped).toBe(false); // no File/Blob leaked into the queue

    // After the JSON round-trip, the blob is still recoverable from IndexedDB.
    const recovered = await offlineDB.getQueuedBlob(roundTripped.blobId);
    expect(recovered).toBeTruthy();
    const bytes = new Uint8Array(await recovered!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);

    await offlineDB.deleteQueuedBlob(blobId);
    expect(await offlineDB.getQueuedBlob(blobId)).toBeFalsy();
  });
});
```

- [ ] **Step 3: Run the test — expect FAIL**

Run: `npx vitest run src/lib/offlineDB.queuedBlobs.test.ts`
Expected: FAIL — `offlineDB.putQueuedBlob is not a function`.

- [ ] **Step 4: Bump DB version + add the store**

In `src/lib/offlineDB.ts`, change the version constant from:
```ts
const DB_VERSION = 4;
```
to:
```ts
const DB_VERSION = 5; // v5: + queued_blobs store (blobs referenced by id, kept out of the localStorage queue)
```
In the `request.onupgradeneeded` handler (where other stores are created with the `if (!db.objectStoreNames.contains(...))` guard), add this block alongside the others:
```ts
  // Queued upload blobs — referenced by id from the localStorage mutation queue
  // so File/Blob objects never go through JSON.stringify (which drops them to {}).
  if (!db.objectStoreNames.contains('queued_blobs')) {
    db.createObjectStore('queued_blobs', { keyPath: 'id' });
  }
```

- [ ] **Step 5: Add the three helper methods**

In the `OfflineDatabase` class in `src/lib/offlineDB.ts` (next to `markInspectionSynced` and the other async helpers), add:
```ts
  async putQueuedBlob(blob: Blob, meta?: { fileName?: string; fileType?: string }): Promise<string> {
    if (!this.db) await this.init();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readwrite');
      const req = tx.objectStore('queued_blobs').put({
        id,
        blob,
        fileName: meta?.fileName ?? null,
        fileType: meta?.fileType ?? blob.type ?? null,
        created_at: new Date().toISOString(),
      });
      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error);
    });
  }

  async getQueuedBlob(id: string): Promise<Blob | undefined> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readonly');
      const req = tx.objectStore('queued_blobs').get(id);
      req.onsuccess = () => resolve(req.result ? (req.result.blob as Blob) : undefined);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteQueuedBlob(id: string): Promise<void> {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(['queued_blobs'], 'readwrite');
      const req = tx.objectStore('queued_blobs').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
```

- [ ] **Step 6: Run the test — expect PASS**

Run: `npx vitest run src/lib/offlineDB.queuedBlobs.test.ts`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add src/lib/offlineDB.ts src/lib/offlineDB.queuedBlobs.test.ts package.json package-lock.json
git commit -m "feat(offline): queued_blobs IndexedDB store + helpers (keeps blobs out of the JSON queue)"
```

---

## Task 2: `queueUpload` + rewrite the 3 file executors (UPLOAD_IMAGE / UPLOAD_DOCUMENT / UPLOAD_FLOOR_PLAN)

**Files:**
- Modify: `src/hooks/useOfflineSync.ts`

- [ ] **Step 1: Add the `queueUpload` helper**

In `src/hooks/useOfflineSync.ts`, after the `queueMutation` definition (it ends ~line 53), add:
```ts
  // Queue an upload mutation WITHOUT putting the File/Blob through JSON: store the blob in
  // IndexedDB (queued_blobs) and carry only its id in the localStorage mutation.
  const queueUpload = useCallback(async (type: string, data: Record<string, unknown>, file: Blob & { name?: string }) => {
    const blobId = await offlineDB.putQueuedBlob(file, { fileName: file.name, fileType: file.type });
    queueMutation(type, { ...data, blobId, fileName: file.name ?? null, fileSize: (file as Blob).size });
  }, [queueMutation]);
```

- [ ] **Step 2: Rewrite the `UPLOAD_IMAGE` case**

Replace the existing `case 'UPLOAD_IMAGE':` block with:
```ts
      case 'UPLOAD_IMAGE': {
        const { bucket, path, blobId, inspectionId } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_IMAGE: queued blob ${blobId} missing`);
        const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true });
        if (error) throw error;

        if (inspectionId) {
          const images = await offlineDB.getUnsyncedImages();
          const image = images.find(img => img.inspection_id === inspectionId);
          if (image) await offlineDB.markImageSynced(image.id);
        }
        await offlineDB.deleteQueuedBlob(blobId);
        break;
      }
```

- [ ] **Step 3: Rewrite the `UPLOAD_DOCUMENT` case**

Replace the existing `case 'UPLOAD_DOCUMENT':` block with:
```ts
      case 'UPLOAD_DOCUMENT': {
        const { documentId, subsectionId, categoryId, blobId, filePath, fileName, fileSize } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_DOCUMENT: queued blob ${blobId} missing`);

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

        const { error: dbError } = await supabase.from('subsection_documents').insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: publicUrl,
          file_size: fileSize,
        });
        if (dbError) throw dbError;

        const { markDocumentSynced } = await import('@/lib/offlineDBExtensions');
        await markDocumentSynced(documentId);
        await offlineDB.deleteQueuedBlob(blobId);
        break;
      }
```

- [ ] **Step 4: Rewrite the `UPLOAD_FLOOR_PLAN` case**

Read the current full `case 'UPLOAD_FLOOR_PLAN':` block first (it continues past line 170 — it uploads to `documents`, gets a public URL, inserts a `floor_plans` row, marks synced). Replace its **two file-dependent lines** so it reads the blob and upserts: change the destructure and the `.upload(...)` call. The block becomes:
```ts
      case 'UPLOAD_FLOOR_PLAN': {
        const { floorPlanId, subsectionId, blobId, filePath } = mutation.data;
        const blob = await offlineDB.getQueuedBlob(blobId);
        if (!blob) throw new Error(`UPLOAD_FLOOR_PLAN: queued blob ${blobId} missing`);

        const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;
```
…then KEEP the rest of the original block exactly as-is (getPublicUrl, the `floor_plans` insert, mark-synced), and immediately before its closing `break;` add:
```ts
        await offlineDB.deleteQueuedBlob(blobId);
        break;
      }
```
(If the original used `subsectionId`/`floorPlanId` further down, they are still destructured above — preserve those references.)

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds. (`offlineDB` is already imported in this file; `queueUpload` is added to the hook's closure.)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOfflineSync.ts
git commit -m "feat(offline): queueUpload + blob-by-id sync for image/document/floor-plan (idempotent upsert)"
```

---

## Task 3: Update the 3 simple upload call sites to `queueUpload`

**Files:**
- Modify: `src/hooks/useOfflineInspections.ts`, `src/hooks/useOfflineSubsections.ts`

- [ ] **Step 1: Expose `queueUpload` from the hook**

In `src/hooks/useOfflineSync.ts`, add `queueUpload` to the hook's `return { ... }` object (next to `queueMutation`).

- [ ] **Step 2: `UPLOAD_IMAGE` call site**

In `src/hooks/useOfflineInspections.ts`: change the destructure of `useOfflineSync()` to also pull `queueUpload`, then replace line ~152:
```ts
    queueMutation('UPLOAD_IMAGE', { bucket, path, file, inspectionId });
```
with:
```ts
    await queueUpload('UPLOAD_IMAGE', { bucket, path, inspectionId }, file);
```
(Confirm the enclosing function is `async` — it is, it already `await`s offline DB writes. Add `queueUpload` to its dependency array if the function is a `useCallback`.)

- [ ] **Step 3: `UPLOAD_DOCUMENT` call site**

In `src/hooks/useOfflineSubsections.ts`: pull `queueUpload` from `useOfflineSync()`, then replace the `queueMutation('UPLOAD_DOCUMENT', { documentId, subsectionId, categoryId, file, filePath })` call (~line 136) with:
```ts
    await queueUpload('UPLOAD_DOCUMENT', { documentId, subsectionId, categoryId, filePath, fileName: file.name }, file);
```

- [ ] **Step 4: `UPLOAD_FLOOR_PLAN` call site**

In `src/hooks/useOfflineSubsections.ts`: replace the `queueMutation('UPLOAD_FLOOR_PLAN', { floorPlanId, subsectionId, file, filePath })` call (~line 208) with:
```ts
    await queueUpload('UPLOAD_FLOOR_PLAN', { floorPlanId, subsectionId, filePath }, file);
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds, no type errors. (Both enclosing functions are already async.)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOfflineInspections.ts src/hooks/useOfflineSubsections.ts src/hooks/useOfflineSync.ts
git commit -m "feat(offline): route image/document/floor-plan uploads through queueUpload (no File in queue)"
```

---

## Task 4: Floor-plan pin photos (ADD / UPDATE) — store the photo as a queued blob

**Files:**
- Modify: `src/hooks/useOfflineSync.ts`, `src/hooks/useOfflineFloorPlanAnnotations.ts`

- [ ] **Step 1: `UPDATE_FLOOR_PLAN_PIN` executor — read photo via blobId**

In `src/hooks/useOfflineSync.ts`, replace the `case 'UPDATE_FLOOR_PLAN_PIN':` block with:
```ts
      case 'UPDATE_FLOOR_PLAN_PIN': {
        const { pinId, updates, photoBlobId, photoFileName } = mutation.data;
        const { markPinSynced } = await import('@/lib/offlineFloorPlanDB');

        let photoUrl = updates.photo_url;
        if (photoBlobId) {
          const photo = await offlineDB.getQueuedBlob(photoBlobId);
          if (!photo) throw new Error(`UPDATE_FLOOR_PLAN_PIN: queued blob ${photoBlobId} missing`);
          const fileName = `floor-plan-pins/${pinId}/${Date.now()}_${photoFileName ?? 'photo.jpg'}`;
          const { error } = await supabase.storage.from('inspection-photos').upload(fileName, photo, { upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(fileName);
          photoUrl = publicUrl;
          await offlineDB.deleteQueuedBlob(photoBlobId);
        }

        await supabase.from('floor_plan_pins').update({ ...updates, photo_url: photoUrl }).eq('id', pinId);
        await markPinSynced(pinId);
        break;
      }
```

- [ ] **Step 2: `ADD_FLOOR_PLAN_PIN` executor — read photo via blobId**

In `src/hooks/useOfflineSync.ts`, in the `case 'ADD_FLOOR_PLAN_PIN':` block, replace the photo-upload section (the `if (pin.photo_blob) { ... }` block) with one driven by a `photoBlobId` on the mutation:
```ts
        let photoUrl = pin.photo_url;
        if (mutation.data.photoBlobId) {
          const photo = await offlineDB.getQueuedBlob(mutation.data.photoBlobId);
          if (!photo) throw new Error(`ADD_FLOOR_PLAN_PIN: queued blob ${mutation.data.photoBlobId} missing`);
          const fileName = `floor-plan-pins/${pin.floor_plan_id}/${Date.now()}_photo.jpg`;
          const { error } = await supabase.storage.from('inspection-photos').upload(fileName, photo, { upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(fileName);
          photoUrl = publicUrl;
          await offlineDB.deleteQueuedBlob(mutation.data.photoBlobId);
        }
```
(Keep the existing `floor_plan_pins` insert and `markPinSynced(pin.id)` exactly as-is below it; they already use `photoUrl`.)

- [ ] **Step 3: Call sites — store the photo blob, drop it from the queued object**

In `src/hooks/useOfflineFloorPlanAnnotations.ts`:

For `UPDATE_FLOOR_PLAN_PIN` (~line 154), replace:
```ts
    queueMutation('UPDATE_FLOOR_PLAN_PIN', { pinId, updates, photo });
```
with:
```ts
    if (photo) {
      const photoBlobId = await offlineDB.putQueuedBlob(photo, { fileName: photo.name, fileType: photo.type });
      queueMutation('UPDATE_FLOOR_PLAN_PIN', { pinId, updates, photoBlobId, photoFileName: photo.name });
    } else {
      queueMutation('UPDATE_FLOOR_PLAN_PIN', { pinId, updates });
    }
```

For `ADD_FLOOR_PLAN_PIN` (~line 93), where `offlinePin` carries `photo_blob`: before queueing, lift the blob out into `queued_blobs` and remove it from the queued object:
```ts
    let photoBlobId: string | undefined;
    if (offlinePin.photo_blob) {
      photoBlobId = await offlineDB.putQueuedBlob(offlinePin.photo_blob, { fileType: offlinePin.photo_blob.type });
    }
    const { photo_blob, ...pinForQueue } = offlinePin; // strip the non-serializable blob
    queueMutation('ADD_FLOOR_PLAN_PIN', { pin: pinForQueue, floorPlanId, photoBlobId });
```
Add `import { offlineDB } from '@/lib/offlineDB';` to this file if not already imported, and confirm both enclosing functions are `async` (add `await` as shown).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/useOfflineFloorPlanAnnotations.ts
git commit -m "feat(offline): floor-plan pin photos stored as queued blobs (no Blob in the JSON queue)"
```

---

## Task 5: `CREATE_INSPECTION` idempotency (UUID id + upsert)

**Files:**
- Modify: `src/hooks/useOfflineInspections.ts`, `src/hooks/useOfflineSync.ts`

- [ ] **Step 1: Use a real UUID for the offline inspection id**

In `src/hooks/useOfflineInspections.ts`, in `createInspection`, change:
```ts
    const inspectionId = `offline_${Date.now()}_${Math.random()}`;
```
to:
```ts
    const inspectionId = crypto.randomUUID();
```
(The old `offline_…` string is not a valid UUID and would fail a `uuid` PK column; a real UUID also makes the row idempotent across retries.)

- [ ] **Step 2: Make the `CREATE_INSPECTION` executor an upsert**

In `src/hooks/useOfflineSync.ts`, replace the `case 'CREATE_INSPECTION':` block with:
```ts
      case 'CREATE_INSPECTION': {
        // upsert on the row id so a retry after a partial success can't duplicate or PK-conflict.
        const { error } = await supabase.from('inspections').upsert([mutation.data], { onConflict: 'id' });
        if (error) throw error;
        if (mutation.data.id) await offlineDB.markInspectionSynced(mutation.data.id);
        break;
      }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOfflineInspections.ts src/hooks/useOfflineSync.ts
git commit -m "fix(offline): idempotent CREATE_INSPECTION (uuid id + upsert onConflict)"
```

---

## Task 6: Full verification

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: PASS — existing suites plus the new `offlineDB.queuedBlobs.test.ts` (the blob round-trip).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0, no type errors.

- [ ] **Step 3: rules-of-hooks sweep on touched hooks (lint is otherwise broken)**

The repo's `npm run lint` is broken; run the isolated hooks check (the recipe used previously):
Create a temp config `.hooks-check.eslint.config.mjs` importing `eslint-plugin-react-hooks` + `@typescript-eslint/parser` with `react-hooks/rules-of-hooks: error`, then:
`ESLINT_USE_FLAT_CONFIG=true npx eslint --config .hooks-check.eslint.config.mjs src/hooks/useOfflineSync.ts src/hooks/useOfflineInspections.ts src/hooks/useOfflineSubsections.ts src/hooks/useOfflineFloorPlanAnnotations.ts`
Expected: 0 rules-of-hooks violations (we added a `useCallback`/`async` to these). Remove the temp config after.

- [ ] **Step 4: Commit (if Step 3 needed any fix)**

Only if a fix was required:
```bash
git add -A
git commit -m "fix(offline): hook placement in offline upload hooks"
```

## Notes for the executor
- **The bug, precisely:** `saveQueue` does `localStorage.setItem(KEY, JSON.stringify(queue))`; `processQueue` reads it back via `JSON.parse`. A `File`/`Blob` in `mutation.data` becomes `{}` — so the upload sends nothing. The fix removes all File/Blob from anything that reaches `JSON.stringify`.
- **Idempotency:** every storage `.upload(...)` in the touched cases now passes `{ upsert: true }` (retry overwrites instead of erroring); `CREATE_INSPECTION` upserts on `id`.
- **Out of scope (Cycle 5):** `UPLOAD_INSPECTION_IMAGE` / `BATCH_UPLOAD_INSPECTION_IMAGES` still read `mutation.data.blob`. They persist blobs in `offlineInspectionDB.inspection_images` (so the blob isn't truly lost), and aren't queued via `queueMutation`. They'll be fixed when the two offline mechanisms are unified. Do NOT touch them here.
- Do not change `useOfflinePhotos` (the separate, already-UUID'd photos path).
