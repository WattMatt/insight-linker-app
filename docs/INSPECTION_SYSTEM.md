# Inspection System

Complete reference for the inspection module — data structures, relationships, workflows, templates, offline support, photo handling, signatures, and report generation.

---

## Table of Contents

- [Overview](#overview)
- [Database Schema](#database-schema)
- [Inspection Lifecycle](#inspection-lifecycle)
- [Templates](#templates)
- [Subsections](#subsections)
- [Snags & Defects](#snags--defects)
- [Floor Plans & Pins](#floor-plans--pins)
- [Photo & Image Handling](#photo--image-handling)
- [Digital Signatures](#digital-signatures)
- [Offline Support](#offline-support)
- [Report & PDF Generation](#report--pdf-generation)
- [COC Relationship](#coc-relationship)
- [Key Files](#key-files)

---

## Overview

The inspection system manages the full lifecycle of electrical compliance inspections — from creation and template assignment through field data capture, photo evidence, snag logging, digital signatures, and professional PDF report generation.

Inspections are scoped to a **site** and optionally to a **subsection** (a specific electrical circuit or area within a site). Templates define the structure of the inspection form — what sections and fields the inspector fills out.

```
Site
 └── Subsection (circuit/area)
      ├── Inspection (uses a Template)
      │    ├── Sections & Items (from Template)
      │    ├── Photos (per item)
      │    ├── Tenants (meter/breaker data)
      │    ├── Snags (defects found)
      │    ├── Signatures (4 signer types)
      │    └── Report (PDF output)
      └── COC Validation (separate system)
```

---

## Database Schema

### `inspections`

Primary table for all inspection records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `site_id` | UUID | FK → sites, NOT NULL | Parent site |
| `subsection_id` | UUID | FK → subsections, nullable | Specific circuit/area |
| `template_id` | UUID | FK → inspection_templates, nullable | Template used |
| `title` | TEXT | NOT NULL | Inspection title |
| `description` | TEXT | nullable | Description/notes |
| `status` | TEXT | NOT NULL, DEFAULT 'Pending' | Pending / In Progress / Completed |
| `inspection_date` | TIMESTAMPTZ | nullable | Date of inspection |
| `inspector_id` | UUID | FK → auth.users, nullable | Assigned inspector |
| `inspector_name` | TEXT | nullable | Inspector display name |
| `assigned_to` | UUID[] | nullable | Array of assigned user IDs |
| `client_rep` | TEXT | nullable | Client representative name |
| `consultant` | TEXT | nullable | Consultant name |
| `contractor` | TEXT | nullable | Contractor name |
| `testing_party` | TEXT | nullable | Testing party name |
| `location` | TEXT | nullable | Inspection location |
| `json_data` | JSON | nullable | All inspection responses (see below) |
| `project_name` | TEXT | nullable | Project name |
| `shop_name` | TEXT | nullable | Shop/unit name |
| `shop_number` | TEXT | nullable | Shop/unit number |
| `quality_rating` | NUMERIC | nullable | Overall quality score (0–100) |
| `qr_code_url` | TEXT | nullable | QR code link |
| `priority` | TEXT | nullable | Priority level |
| `end_date` | TIMESTAMPTZ | nullable | Inspection end date |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Record creation |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last modification |

#### `json_data` Structure

All inspection responses are stored as a nested JSON object keyed by template section and item:

```json
{
  "section_key": {
    "item_key": {
      "status": "Pass | Fail | N/A",
      "notes": "Free-text notes",
      "photos": ["https://storage.url/photo1.jpg", "..."],
      "images": {
        "image_id": {
          "id": "uuid",
          "url": "https://...",
          "name": "photo.jpg",
          "path": "storage/path",
          "size": 123456
        }
      }
    }
  }
}
```

### `inspection_templates`

Defines the structure/form that inspections follow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `name` | TEXT | Template name |
| `category` | TEXT | Category (see [Template Categories](#template-categories)) |
| `description` | TEXT | Template description |
| `sections` | JSON | Array of sections with nested items |
| `sections_count` | INTEGER | Number of sections |
| `pages_count` | INTEGER | Expected page count |
| `tenants` | JSON | Pre-configured tenant template data |
| `cover_page` | JSON | Cover page configuration |
| `created_at` | TIMESTAMPTZ | Created timestamp |
| `updated_at` | TIMESTAMPTZ | Updated timestamp |

### `inspection_signatures`

Digital signature records per inspection.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK | |
| `inspection_id` | UUID | FK → inspections, NOT NULL | Parent inspection |
| `signer_type` | TEXT | CHECK: inspector, contractor, client, witness | Role of signer |
| `signer_name` | TEXT | NOT NULL | Signer's full name |
| `signer_email` | TEXT | nullable | Signer's email |
| `signature_data` | TEXT | NOT NULL | Base64-encoded PNG |
| `signature_url` | TEXT | nullable | Supabase storage URL |
| `signed_at` | TIMESTAMPTZ | DEFAULT NOW() | When signed |
| `ip_address` | TEXT | nullable | Client IP |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | |

**Constraint:** `UNIQUE(inspection_id, signer_type)` — one signature per role per inspection. New signatures replace existing ones.

### `inspection_subsections`

Subsection groupings within an inspection (not to be confused with site-level subsections).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `inspection_id` | UUID | FK → inspections |
| `name` | TEXT | Section name |
| `description` | TEXT | Section description |
| `order_index` | INTEGER | Sort order |
| `created_at` | TIMESTAMPTZ | |

### `inspection_items`

Individual items/checks within an inspection subsection.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `subsection_id` | UUID | FK → inspection_subsections |
| `item_name` | TEXT | Check/item name |
| `status` | TEXT | Pass / Fail / N/A |
| `notes` | TEXT | Inspector notes |
| `image_url` | TEXT | Photo URL |
| `created_at` | TIMESTAMPTZ | |

### `snags`

Defects/issues found during inspection.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `inspection_id` | UUID | FK → inspections, nullable |
| `subsection_id` | UUID | FK → subsections, NOT NULL |
| `title` | TEXT | Snag title |
| `description` | TEXT | Detailed description |
| `status` | TEXT | Open / Rectified |
| `risk_level` | TEXT | Risk classification |
| `notes` | TEXT | Additional notes |
| `photos` | JSON | Array of photo URLs |
| `estimated_cost` | NUMERIC | Estimated repair cost |
| `rectification_notes` | TEXT | How it was fixed |
| `rectification_photos` | JSON | Photos of the fix |
| `rectified_at` | TIMESTAMPTZ | When rectified |
| `rectified_by` | UUID | Who rectified |
| `created_by` | UUID | Who logged the snag |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## Inspection Lifecycle

```
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Pending  │ ──→ │ In Progress  │ ──→ │ Completed │
└──────────┘     └──────────────┘     └───────────┘
```

### Step-by-step workflow

| Step | Action | Details |
|------|--------|---------|
| 1 | **Create** | New inspection with title, site, optional subsection |
| 2 | **Assign template** | Select an inspection template (defines form structure) |
| 3 | **Fill sections** | Inspector works through template sections, marking items Pass/Fail/N/A with notes |
| 4 | **Capture photos** | Add photos to individual items as evidence (up to 3 per item) |
| 5 | **Add tenants** | If applicable — shop number, meter serial, breaker size, CT ratio, images |
| 6 | **Log snags** | Record defects with description, risk level, photos, estimated cost |
| 7 | **Update status** | Move from Pending → In Progress → Completed |
| 8 | **Set quality rating** | Score the overall inspection quality (0–100) |
| 9 | **Capture signatures** | Digital sign-off from Inspector, Contractor, Client, Witness |
| 10 | **Generate report** | Create PDF with all sections, photos, snags, and signatures |
| 11 | **Sync** | Save to Supabase; if offline, changes queue for automatic sync |

---

## Templates

Templates define the form structure an inspector fills out. They are reusable across inspections.

### Template Structure

```typescript
{
  id: string           // UUID
  name: string         // e.g. "LV Distribution Board Inspection"
  category: string     // See categories below
  description?: string
  sections_count: number
  pages_count: number
  cover_page?: {
    title: string
    subtitle: string
    company_name: string
    logo_url: string
  }
  sections: [
    {
      id: string
      name: string           // e.g. "General Condition"
      order_index: number
      items: [
        {
          id: string
          name: string       // e.g. "Earth leakage protection functional"
          type: string       // text, checkbox, dropdown, textarea, number, date
          required: boolean
          options?: string[] // For dropdown type
        }
      ]
    }
  ]
  tenants?: [
    {
      id: string
      shopNumber: string
      shopName: string
      breakerSize: string
      ctSizeAndRatio: string
      meterSerialNumber?: string
    }
  ]
}
```

### Template Categories

| Category | Icon | Use Case |
|----------|------|----------|
| General | ClipboardList | General purpose inspections |
| Medium Voltage | Zap | 11kV+ switchgear, transformers |
| Low Voltage | Battery | Distribution boards, meters, panels |
| Generator | Cog | Genset FAT & commissioning |
| Solar | Sun | PV system inspections |
| Progress | TrendingUp | Project progress reports |
| Site Drawing | Map | Site drawing inspections |

### Template Field Types

| Type | Renders As | Use Case |
|------|-----------|----------|
| `text` | Single-line input | Short text answers |
| `textarea` | Multi-line input | Detailed notes |
| `checkbox` | Toggle | Yes/No checks |
| `dropdown` | Select menu | Predefined options |
| `number` | Numeric input | Measurements, counts |
| `date` | Date picker | Date values |

### Template Management

- **Browse:** `/inspection-templates` — filter by category, paginated (9 per page)
- **Build:** `/templates/builder/:templateId?` — drag-and-drop section/field editor
- **Export:** Templates can be exported as PDF
- **Sync:** `template-sync` edge function for cross-environment sync

---

## Subsections

Subsections represent specific electrical circuits or areas within a site. They are the primary unit that inspections and COC validations target.

### Subsection Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `name` | TEXT | Circuit/area name |
| `description` | TEXT | Description |
| `category` | TEXT | Classification |
| `coc_status` | TEXT | Approved / Failed / Pending |
| `metering_status` | TEXT | Metering state |
| `is_compliant` | BOOLEAN | Overall compliance flag |
| `is_coc_required` | BOOLEAN | Whether COC is needed |
| `tenant_name` | TEXT | Tenant occupying this area |
| `coc_number` | TEXT | Certificate number |
| `meter_serial_number` | TEXT | Meter serial |
| `ct_ratio` | TEXT | CT size and ratio |
| `qr_code_url` | TEXT | Public access QR code |

### Relationship to Inspections

- **One-to-Many:** A subsection can have multiple inspections
- `inspections.subsection_id` links an inspection to a specific subsection
- The subsection detail page lists all related inspections
- Inspection status does not directly set subsection compliance — COC validation handles that
- Snags link to both `inspection_id` AND `subsection_id`

---

## Snags & Defects

Snags are defects or issues found during an inspection. They track the full lifecycle from discovery through rectification.

### Snag Lifecycle

```
Open  ──→  Rectified
```

### Snag Fields

| Field | Required | Description |
|-------|----------|-------------|
| `title` | Yes | Short description of the defect |
| `description` | No | Detailed explanation |
| `risk_level` | No | Risk classification |
| `photos` | No | Evidence photos (JSON array of URLs) |
| `estimated_cost` | No | Estimated repair cost (numeric) |
| `rectification_notes` | No | How the issue was fixed |
| `rectification_photos` | No | Photos proving the fix |
| `rectified_at` | No | Timestamp of rectification |
| `rectified_by` | No | User who rectified |

### Snag → Inspection → Subsection

A snag always belongs to a subsection and optionally to a specific inspection:

```
Subsection
 ├── Inspection A
 │    └── Snag 1 (inspection_id = A, subsection_id = X)
 ├── Inspection B
 │    └── Snag 2 (inspection_id = B, subsection_id = X)
 └── Snag 3 (inspection_id = NULL, subsection_id = X)  ← standalone snag
```

Open snags are displayed on the subsection overview page.

---

## Floor Plans & Pins

Floor plans provide a visual layer for marking issues and observations on a diagram of the installation.

### Floor Plan Pin Structure

```typescript
{
  id: string
  floor_plan_id: string
  pin_number: number
  x_position: number          // X coordinate on the image
  y_position: number          // Y coordinate on the image
  pin_type: 'snag' | 'observation'
  title?: string
  notes?: string
  detailed_description?: string
  priority?: string
  status: string
  assigned_contractor?: string
  stakeholders?: string
  package?: string
  due_date?: string
  photo_url?: string
  photo_blob?: Blob           // Offline photo data
  created_by?: string
  created_at: string
  synced: boolean
}
```

### Floor Plan Features

- Interactive drag-and-drop pin placement
- Markup tools: lines, rectangles, circles, arrows, freehand drawing
- Dimension/measurement annotations
- Pin photos with offline support
- Pins can reference snags found during inspection
- Floor plans attach to subsections
- Dedicated floor plan report PDF output

---

## Photo & Image Handling

### Storage Locations

| Context | Online Storage | Offline Storage |
|---------|---------------|-----------------|
| Inspection items | Supabase Storage → URLs in `json_data` | IndexedDB `images` store |
| Snag photos | Supabase Storage → URLs in `snags.photos` | IndexedDB |
| Floor plan pins | Supabase Storage → `photo_url` | IndexedDB `floor_plan_pins` |
| COC evidence | Supabase Storage → `coc_compliance_photos` | IndexedDB `offline_photos` |
| General evidence | Supabase Storage → `offline_photos` table | IndexedDB `offline_photos` |

### Unified Offline Photo System

The `useOfflinePhotos` hook provides a single interface for photo capture and storage across all contexts.

```typescript
OfflinePhoto {
  id: string
  context_type: 'coc' | 'inspection' | 'floor_plan' | 'site' | 'document'
  context_id: string              // inspection_id, subsection_id, etc.
  secondary_context_id?: string   // e.g. coc_validation_id
  photo_type: string              // See types below
  file_blob: Blob                 // Actual image data
  file_name: string
  file_size: number
  thumbnail_blob?: Blob           // Compressed preview (200px, 60% quality)
  mime_type: string               // e.g. 'image/jpeg'
  captured_at: string
  captured_by: string
  latitude?: number               // GPS
  longitude?: number              // GPS
  notes?: string
  synced: boolean
  sync_error?: string
  retry_count: number             // 0–3
  remote_url?: string             // Supabase URL after sync
}
```

### Photo Types by Context

| Context | Photo Types |
|---------|------------|
| Inspection | `inspection_finding`, `inspection_snag`, `general_evidence` |
| COC | `coc_document`, `test_equipment_reading`, `db_board`, `installation_overview`, `signature` |
| Floor Plan | `floor_plan_pin`, `floor_plan_overview` |
| Site | `site_progress` |
| Document | `document_scan` |

### Photo Capture

1. Uses Capacitor Camera plugin on native devices
2. Falls back to file picker on web
3. Compression applied based on connection:
   - **Standard:** 800px max dimension, 70% JPEG quality
   - **Aggressive (cellular):** 500px max dimension, 50% quality
4. Thumbnail generated: 200px, 60% quality
5. GPS coordinates captured when available
6. HEIC images auto-converted to JPEG via `heic2any`

### Photo Sync

- **Priority order:** COC > Document > Inspection > Floor Plan > Site
- **Upload path:** `{context_type}/{context_id}/{photo_type}/{id}.jpg`
- **Bucket:** `coc-photos` in Supabase Storage
- **Retry:** Up to 3 attempts with exponential backoff
- **Adaptive:** Compression increases on slow connections
- **Pauseable:** Manual pause/resume via `OfflinePhotoGallery`

### Limits

| Limit | Value |
|-------|-------|
| Photos per item | 3 (displayed in 3-column grid) |
| Photos per report | 150 max |
| Cache per file | 5 MB |
| Image cache TTL | 7 days |

---

## Digital Signatures

Four signature types are captured per inspection:

| Type | Signer | Purpose |
|------|--------|---------|
| `inspector` | The inspector | Confirms inspection was conducted |
| `contractor` | Electrical contractor | Acknowledges findings |
| `client` | Client representative | Accepts the report |
| `witness` | Independent witness | Verifies the process |

### Signature Capture Flow

1. Open signature modal for a signer type
2. Draw signature on canvas
3. Clear/redraw if needed
4. Save — signature stored as Base64 PNG in `signature_data`
5. Optionally uploaded to Supabase Storage → `signature_url`
6. `signed_at` timestamp and `ip_address` recorded

### Constraints

- One signature per `signer_type` per inspection (`UNIQUE(inspection_id, signer_type)`)
- Saving a new signature for an existing type replaces the previous one
- All four signatures displayed together on the report's signature page

---

## Offline Support

### Cached Data

| IndexedDB Store | Contents |
|-----------------|----------|
| `inspections` | Offline-created inspection records |
| `images` | Photo blobs for inspections |
| `inspection_cache` | Full cached inspection data for offline viewing |
| `inspection_images` | Images keyed by section/item |
| `template_cache` | Cached templates for offline form rendering |
| `offline_photos` | Universal photo store (all contexts) |
| `mutations` | Queued CRUD operations |

### Cached Inspection Structure

```typescript
CachedInspection {
  id: string
  title: string
  status: string
  inspection_date: string | null
  site_id: string
  subsection_id: string | null
  inspector_name: string | null
  json_data: any                 // Full form responses
  template: any | null           // Full template definition
  template_id: string | null
  template_category: string | null
  site_data: {
    clientName: string
    siteName: string
    physicalAddress: string
    siteImageUrl: string
    clientLogoUrl: string
  }
  subsection_data: { name: string }
  cached_at: string
  last_modified: string
  synced: boolean
  pending_changes: boolean
}
```

### Offline Workflow

1. Component mounts → check `navigator.onLine` + Supabase health
2. **Online:** fetch from Supabase, cache to IndexedDB
3. **Offline:** load from IndexedDB, show `InspectionOfflineBanner`
4. Mutations queued in `offline_mutation_queue` (LocalStorage)
5. Photos saved to IndexedDB with blob data
6. On reconnect → automatic sync with exponential backoff (3 retries)
7. Banner shows pending change count and last sync time

### Supported Offline Mutations

| Mutation | Description |
|----------|-------------|
| `CREATE_INSPECTION` | Create new inspection record |
| `UPDATE_INSPECTION` | Update inspection fields or json_data |
| `DELETE_INSPECTION` | Delete an inspection |
| `UPLOAD_IMAGE` | Upload photo blob to storage |
| `UPLOAD_DOCUMENT` | Upload document blob |

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useOfflineInspections` | CRUD operations with offline fallback |
| `useOfflineInspectionDetail` | Cache/load full inspection data, track pending changes |
| `useOfflineSync` | Mutation queue management, sync orchestration |
| `useOfflinePhotos` | Unified photo capture/storage/sync |
| `useOfflineSubsections` | Subsection caching |
| `useOfflineFloorPlanAnnotations` | Floor plan pin caching |

---

## Report & PDF Generation

### Architecture

```
Inspection Data
      │
      ├─→ Server-side (pdfmake via edge function) — fast, reliable
      ├─→ Client-side (html2canvas) — visual fidelity fallback
      └─→ Client-side (pdfmake direct) — lower latency
```

### Report Data Structure

```typescript
InspectionReportData {
  inspectionId: string
  templateName?: string
  inspectorName?: string
  inspectionDate?: string
  status?: string
  qualityRating?: number
  generalInfo?: Record<string, any>
  sections?: InspectionSection[]
  tenants?: InspectionTenant[]
  snags?: InspectionSnag[]
  signatures?: InspectionSignature[]
  subsectionName?: string
}

InspectionSection {
  title: string
  items: {
    label: string
    value: string | boolean | number
    type?: string
    notes?: string
    photos?: string[]     // Up to 3 per item
  }[]
}
```

### Report Sections

| Section | Contents |
|---------|----------|
| **Cover Page** | Title, date, company logo, site info, inspector name |
| **Table of Contents** | Auto-generated page numbers |
| **Quality Dashboard** | Visual quality score (0–100) |
| **Template Sections** | Each section's items with status, notes, photos |
| **Tenant Information** | Shop number, meter serial, breaker size, CT ratio, images |
| **Snag Listing** | All defects with risk level, photos, rectification status |
| **Signature Page** | All 4 signature blocks (Inspector, Contractor, Client, Witness) |

### Report Styling

| Element | Color |
|---------|-------|
| Primary (headers) | `#1e3a5f` (Navy) |
| Secondary | `#1a7a8a` (Teal) |
| Accent | `#2563eb` (Blue) |
| Pass/Success | `#16a34a` (Green) |
| Warning | `#d97706` (Amber) |
| Fail/Error | `#dc2626` (Red) |

### Generation via Edge Function

The `generate-inspection-pdf` edge function:
- Accepts full inspection payload via HTTP POST
- Uses Browserless API for headless Chrome rendering
- Embeds images as Base64 for reliability
- Supports up to 150 images per report
- Returns PDF blob

---

## COC Relationship

COC (Certificate of Compliance) validation and inspections are **separate but related** systems:

| Aspect | Inspections | COC Validation |
|--------|-------------|----------------|
| **Scope** | Inspection of physical installation | Validation of COC document data |
| **Target** | Site or subsection | Subsection only |
| **Standard** | Template-defined checks | SANS 10142-1 rules |
| **Output** | Inspection report PDF | Certificate of Evidence PDF |
| **Status field** | `inspections.status` | `subsections.coc_status` |
| **Table** | `inspections` | `coc_validations` |

### How They Connect

- Subsections have an `is_coc_required` flag
- COC validation determines `coc_status` (Approved/Failed/Pending) on the subsection
- Inspections can be conducted on subsections regardless of COC status
- COC documents uploaded to `subsection_documents` can be referenced during inspections
- COC-specific photos are tracked in `coc_compliance_photos` (separate from inspection photos)
- Both systems feed into the subsection's overall compliance picture

---

## Tenant Data

Inspections can include tenant-specific data for multi-tenant sites (e.g. shopping centres).

### Tenant Structure

```typescript
Tenant {
  id: string
  shopNumber: string
  shopName: string
  breakerSize: string           // e.g. "63A"
  breakerImage: string          // Photo URL
  ctSizeAndRatio: string        // e.g. "200/5"
  ctRatioImage: string          // Photo URL
  controlStatus48V?: string     // 48V control status
  meterSerialNumber?: string    // Meter serial number
  meterImage?: string           // Photo of meter
}
```

Tenant data is stored in `inspections.json_data` and rendered in dedicated tenant pages in the PDF report.

---

## Key Files

### Pages

| File | Route | Purpose |
|------|-------|---------|
| `src/pages/Inspections.tsx` | `/inspections` | Inspection list with create/delete |
| `src/pages/InspectionDetail.tsx` | `/inspections/:inspectionId` | Full inspection editor |
| `src/pages/InspectionTemplates.tsx` | `/inspection-templates` | Template browser |
| `src/pages/TemplateBuilderPage.tsx` | `/templates/builder/:templateId?` | Template editor |
| `src/pages/SubsectionDetail.tsx` | `/subsections/:id` | Subsection with inspections |

### Components

| File | Purpose |
|------|---------|
| `src/components/InspectionSignatures.tsx` | 4-panel signature capture |
| `src/components/inspection-report/CoverPage.tsx` | Report cover page |
| `src/components/inspection-report/SectionPage.tsx` | Report section rendering |
| `src/components/inspection-report/TenantSection.tsx` | Tenant data cards |
| `src/components/inspection-report/SignaturePage.tsx` | Signature blocks |
| `src/components/inspection-report/SnagSection.tsx` | Snag listing |
| `src/components/inspection-report/QualityDashboard.tsx` | Quality score visual |
| `src/components/InspectionOfflineBanner.tsx` | Offline status/sync banner |
| `src/components/floor-plan/InteractiveFloorPlan.tsx` | Pin placement on diagrams |

### Hooks

| File | Purpose |
|------|---------|
| `src/hooks/useOfflineInspections.ts` | CRUD with offline fallback |
| `src/hooks/useOfflineInspectionDetail.ts` | Cache/load full inspection data |
| `src/hooks/useOfflineSync.ts` | Mutation queue and sync |
| `src/hooks/useOfflinePhotos.ts` | Unified photo system |
| `src/hooks/useCamera.ts` | Capacitor camera integration |
| `src/hooks/useUnifiedPdfGeneration.ts` | PDF report generation |

### Libraries

| File | Purpose |
|------|---------|
| `src/lib/offlineDB.ts` | IndexedDB wrapper (v3) |
| `src/lib/offlineInspectionDB.ts` | Inspection-specific offline storage |
| `src/lib/pdfmakeInspectionReport.ts` | Client-side PDF generation |
| `src/lib/pdfEngine.ts` | PDF orchestration layer |
| `src/lib/complianceReportGenerator.ts` | Compliance report builder |

### Edge Functions

| Function | Purpose |
|----------|---------|
| `supabase/functions/generate-inspection-pdf` | Server-side PDF rendering |
| `supabase/functions/generate-pdf` | Generic PDF generation |
| `supabase/functions/generate-docx-report` | DOCX export |
| `supabase/functions/compress-image` | Image optimization |
| `supabase/functions/template-sync` | Template synchronization |
