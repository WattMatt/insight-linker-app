
# Enhanced Offline-First Inspection System

## Overview

This plan outlines enhancements to enable users with poor cell reception to capture images offline, navigate inspections with all applicable tabs, and automatically sync data when connectivity improves.

## Current State Analysis

### What Already Exists

| Component | Status | Description |
|-----------|--------|-------------|
| IndexedDB Storage | Implemented | `offlineDB.ts` stores inspections, images, subsections, documents, floor plans, pins |
| Offline Sync Hook | Implemented | `useOfflineSync.ts` with queue processing, 3 retries, auto-sync |
| PWA Service Worker | Implemented | Network-first API caching (24h), cache-first images (7d) |
| Offline Indicator | Implemented | Shows connection status and pending queue |
| Image Upload Queue | Implemented | Stores blobs in IndexedDB, queues for sync |
| Floor Plan Annotations | Implemented | Offline pins, markups, measurements |

### Current Gaps

1. **Inspection Detail Page** - Not designed for offline navigation; relies on live Supabase queries
2. **Inspection Data Caching** - No proactive caching of inspection data and templates
3. **Offline Image Gallery** - Images taken offline not displayed in inspection tabs
4. **Tab Navigation** - Cannot switch between inspection sections offline
5. **Template Caching** - Inspection templates not cached for offline use

## Architecture

```text
+-----------------------------------------------------------------------------------+
|                     ENHANCED OFFLINE INSPECTION SYSTEM                            |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +---------------------------+     +----------------------------------------+     |
|  |   Inspection Cache        |     |       Offline Inspection Hook          |     |
|  |                           |     |                                        |     |
|  |  - Inspection metadata    |<--->|  - cacheInspection()                   |     |
|  |  - Template sections      |     |  - getCachedInspection()               |     |
|  |  - Section data (JSON)    |     |  - saveInspectionSection()             |     |
|  |  - Offline images         |     |  - addOfflineImage()                   |     |
|  +---------------------------+     +----------------------------------------+     |
|              |                                    |                               |
|              v                                    v                               |
|  +---------------------------+     +----------------------------------------+     |
|  |   IndexedDB Extended      |     |       InspectionDetail Offline         |     |
|  |                           |     |                                        |     |
|  |  NEW: inspections_cache   |     |  - Load from cache when offline        |     |
|  |  NEW: inspection_images   |     |  - Display offline images in gallery   |     |
|  |  NEW: templates_cache     |     |  - Enable all tab navigation           |     |
|  +---------------------------+     |  - Queue changes for sync              |     |
|                                    +----------------------------------------+     |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

## Implementation Details

### 1. Extended IndexedDB Schema

Add new object stores to `offlineDB.ts`:

| Store | Purpose | Indexes |
|-------|---------|---------|
| `inspection_cache` | Full inspection data with template | `id`, `synced`, `site_id` |
| `inspection_images` | Images captured during inspection | `inspection_id`, `section_key`, `synced` |
| `template_cache` | Inspection templates | `id` |

### 2. New Hook: useOfflineInspectionDetail

```text
src/hooks/useOfflineInspectionDetail.ts

Features:
- cacheInspection(inspectionId) - Downloads and stores full inspection data
- getCachedInspection(id) - Returns cached inspection with template
- saveInspectionSection(id, sectionKey, data) - Saves section changes offline
- addOfflineImage(inspectionId, sectionKey, blob) - Stores image for gallery
- getOfflineImages(inspectionId, sectionKey) - Retrieves cached images as blob URLs
- isInspectionCached(id) - Checks if inspection is available offline
```

### 3. Enhanced Offline Sync Mutations

Add to `useOfflineSync.ts`:

| Mutation Type | Description |
|---------------|-------------|
| `UPDATE_INSPECTION_SECTION` | Sync section data changes |
| `UPLOAD_INSPECTION_IMAGES` | Batch upload offline images |
| `SAVE_INSPECTION_JSON` | Sync full inspection JSON |

### 4. InspectionDetail Offline Mode

Modify `InspectionDetail.tsx`:

**On Load:**
1. Check if online - if yes, fetch from Supabase and cache
2. If offline, load from IndexedDB cache
3. Display "Offline Mode" badge when cached

**Image Capture:**
1. Compress image (800px, 70% JPEG)
2. Store blob in IndexedDB with section reference
3. Display in gallery using blob URL
4. Queue for upload when online

**Tab Navigation:**
- All tabs work from cached data
- Section changes saved to IndexedDB
- Visual indicator for unsaved changes

### 5. Proactive Caching Strategy

When user opens an inspection while online:
1. Cache the full inspection data
2. Cache the associated template
3. Pre-cache up to 20 recent images
4. Show "Available Offline" indicator

### 6. Offline Image Gallery

New component: `OfflineImageGallery.tsx`

- Displays both online URLs and offline blob URLs
- Shows sync status for each image
- Supports adding new images offline
- Handles mixed online/offline image sources

### 7. Sync Queue Enhancements

Priority order when syncing:
1. Image uploads (largest payloads first for stable connection)
2. Inspection section updates
3. Other queued mutations

Background upload with progress indicator.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/lib/offlineDB.ts` | Modify | Add `inspection_cache`, `inspection_images`, `template_cache` stores |
| `src/hooks/useOfflineInspectionDetail.ts` | Create | Core hook for offline inspection management |
| `src/hooks/useOfflineSync.ts` | Modify | Add new mutation types |
| `src/pages/InspectionDetail.tsx` | Modify | Integrate offline mode for all tabs |
| `src/components/OfflineImageGallery.tsx` | Create | Display mixed online/offline images |
| `src/components/InspectionOfflineBanner.tsx` | Create | Shows offline status and cache info |

## User Experience Flow

### Scenario 1: Poor Reception During Inspection

1. **User opens inspection** while online - data is cached
2. **Connection drops** - "Offline Mode" banner appears
3. **User navigates tabs** - all sections work from cache
4. **User takes photos** - stored locally, shown in gallery
5. **User makes notes** - saved to IndexedDB, queued for sync
6. **Connection returns** - automatic background sync
7. **Sync completes** - toast notification, data updated

### Scenario 2: Starting Offline

1. **User sees inspection list** - shows cached inspections with "Offline" badge
2. **Opens cached inspection** - full functionality available
3. **Uncached inspections** - disabled with "Requires connection" message

## Visual Indicators

```text
+--------------------------------------------------------------+
|  [Offline Mode]  Last synced: 14:35              [3 pending] |
+--------------------------------------------------------------+
|                                                              |
|  General | Electrical | Safety | Images                      |
|  --------                                                    |
|                                                              |
|  +------------------+  +------------------+                  |
|  | [img] [sync]     |  | [img] [offline]  |                  |
|  +------------------+  +------------------+                  |
|                                                              |
|  [+ Add Photo]                                               |
|                                                              |
+--------------------------------------------------------------+
```

## Storage Limits and Cleanup

| Data Type | Max Size | Cleanup Strategy |
|-----------|----------|------------------|
| Inspection cache | 50 inspections | LRU eviction |
| Offline images | 100MB total | Compress + sync then delete |
| Templates | 20 templates | LRU eviction |

## Technical Considerations

### Image Compression
- Max width: 800px
- JPEG quality: 70%
- Average size: ~50-100KB per image
- Allows ~1000 images in 100MB quota

### IndexedDB Version Migration
- Increment DB_VERSION to 2
- Handle upgrade from version 1
- Preserve existing offline data

### Conflict Resolution
- Last-write-wins for section data
- Images are additive (no conflicts)
- Toast notification for sync issues

## Testing Checklist

- [ ] Cache inspection when online
- [ ] Navigate all tabs when offline
- [ ] Capture and display images offline
- [ ] Edit section data offline
- [ ] Automatic sync when connection returns
- [ ] Handle partial sync failures
- [ ] LRU cache eviction working
- [ ] Storage quota warning
