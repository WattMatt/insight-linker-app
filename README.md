# WM Compliance Inspector

A professional electrical compliance inspection and reporting platform for South African installations, built around SANS 10142-1 standards. The system supports offline-first field work, multi-role portal access, AI-powered COC validation, and comprehensive PDF report generation.

**Live:** [Lovable Project](https://lovable.dev/projects/7b7a829f-6566-4e31-a58f-428ee0cc1c75)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Edge Functions](#edge-functions)
- [Offline Architecture](#offline-architecture)
- [PDF Generation](#pdf-generation)
- [COC Validation Engine](#coc-validation-engine)
- [Authentication & Roles](#authentication--roles)
- [Mobile & PWA](#mobile--pwa)
- [Routing](#routing)
- [Documentation](#documentation)

---

## Features

### COC Validation (SANS 10142-1)
- AI-powered PDF extraction via Google Gemini 3 Pro
- Deterministic server-side pass/fail validation (not AI-decided)
- 10+ SANS 10142-1 clause rules: insulation resistance, earth loop impedance, RCD trip time, polarity, etc.
- Certificate types: Initial, Re-inspection, Alteration, Supplementary, Temporary
- Renewable energy support (Solar PV, BESS, inverter sync, SPD, AFDD)
- Configurable strictness: Strict / Standard / Relaxed presets
- Professional Certificate of Evidence PDF output
- Full audit trail with timestamps

### Offline-First Field Work
- IndexedDB storage for inspections, photos, documents, floor plans
- Service worker caching (Workbox): app shell precache, NetworkFirst APIs, CacheFirst images
- Automatic sync queue with exponential backoff retry
- Unified offline photo system across all contexts (COC, inspection, site, floor plan)
- Online/offline detection with graceful degradation

### Multi-Role Portal System
- **Admin/Staff** — Full CRUD on clients, sites, inspections, users, templates, QR codes
- **Client Portal** — View assigned sites, download reports, calendar, subsection details
- **Contractor Portal** — Access assigned inspections and subsections
- **Public Portals** — QR code-based subsection access and magic-link site review (no login)

### Inspection Management
- Template-driven inspections with custom fields
- Mobile camera integration via Capacitor
- Subsection organization by electrical circuit/area
- Floor plan annotations with pin-based issue marking
- Digital signature capture

### Document & Reporting
- Multiple PDF engines: pdfmake (primary), jsPDF, html2canvas
- Report types: inspection, COC certificate, site summary, floor plan, asset verification
- DOCX and Excel export
- Template gatekeeper architecture for PDF layouts

### Additional
- Global search (Cmd/Ctrl+K) across clients, sites, subsections, inspections
- QR code generation with public landing pages
- Real-time notifications
- Consolidated feedback management
- User invitation system with role assignment

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript 5.8 |
| Build | Vite 5 + PWA plugin |
| Routing | React Router 6 |
| Styling | Tailwind CSS 3 + shadcn/ui (Radix UI) |
| State | TanStack React Query 5 |
| Forms | React Hook Form + Zod |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) |
| PDF | pdfmake, jsPDF, html2canvas, react-pdf |
| AI | Google Gemini 3 Pro (COC extraction/validation) |
| Mobile | Capacitor 7 (iOS + Android) + Capacitor Camera |
| Offline | Workbox 7 + IndexedDB |
| Charts | Recharts |
| Other | fabric.js, xlsx, qrcode, date-fns, cmdk, heic2any |

---

## Project Structure

```
src/
├── pages/                    # ~51 route pages
│   ├── Auth.tsx              # Authentication
│   ├── Dashboard.tsx         # Admin dashboard
│   ├── Clients.tsx           # Client management
│   ├── Sites.tsx             # Site management
│   ├── Inspections.tsx       # Inspection list
│   ├── COCValidation.tsx     # COC validation interface
│   ├── SubsectionDetail.tsx  # Electrical subsections
│   ├── TemplateBuilderPage.tsx
│   ├── QRCodes.tsx           # QR code management
│   ├── OfflineReview.tsx     # Offline data review
│   ├── ClientPortal*.tsx     # Client portal pages (5)
│   ├── ContractorPortal*.tsx # Contractor portal pages (3)
│   └── Public*.tsx           # Public access pages
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   ├── compliance/           # COC validation forms
│   ├── pdf-editor/           # PDF editing tools
│   ├── pdf-preview/          # PDF viewing
│   ├── inspection-report/    # Report rendering
│   ├── floor-plan/           # Floor plan viewer/editor
│   ├── site/                 # Site management UI
│   ├── templates/            # Template components
│   ├── client-portal/        # Client portal layout
│   ├── AppSidebar.tsx        # Main navigation
│   ├── OfflineIndicator.tsx  # Offline status badge
│   └── GlobalSearch.tsx      # Cmd+K search
├── hooks/
│   ├── useOfflineSync.ts     # Mutation queue & sync
│   ├── useOfflinePhotos.ts   # Unified photo management
│   ├── useOfflineInspections.ts
│   ├── useCamera.ts          # Capacitor camera
│   ├── useUnifiedPdfGeneration.ts
│   ├── useUserRole.tsx       # Role-based access
│   └── 15+ more custom hooks
├── lib/
│   ├── offlineDB.ts          # IndexedDB wrapper (v3)
│   ├── pdfEngine.ts          # PDF orchestration
│   ├── pdfmakeInspectionReport.ts
│   ├── cocValidationPdfBuilder.ts
│   ├── qrCodeGenerator.ts
│   └── 40+ utility modules
├── utils/
│   ├── cocValidationEngine.ts  # SANS 10142-1 rules
│   └── validation/export utilities
├── types/
│   └── site.ts
├── integrations/supabase/
│   ├── client.ts             # Supabase client init
│   └── types.ts              # Generated DB types
└── App.tsx                   # Router & layout

supabase/
├── config.toml
├── functions/                # 26 edge functions
│   ├── validate-coc/         # COC validation (Gemini)
│   ├── extract-coc/          # PDF extraction
│   ├── generate-pdf/         # PDF generation
│   ├── generate-inspection-pdf/
│   ├── generate-docx-report/
│   ├── compress-image/       # Image optimization
│   ├── send-email/           # Email notifications
│   ├── invite-user/          # User invitations
│   ├── qr-redirect/          # QR code resolution
│   ├── offline-review/       # Offline data export
│   └── 16 more functions
└── migrations/               # ~130 database migrations

docs/                         # Technical specifications
public/                       # Static assets & PWA manifest
```

---

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: install via [nvm](https://github.com/nvm-sh/nvm))
- npm or bun

### Installation

```sh
git clone https://github.com/WattMatt/insight-linker-app.git
cd insight-linker-app
npm install
npm run dev
```

The app will be available at `http://localhost:8080`.

### Lovable

Changes can also be made directly via the [Lovable editor](https://lovable.dev/projects/7b7a829f-6566-4e31-a58f-428ee0cc1c75). Commits made in Lovable sync to this repo automatically.

### Mobile Builds (Capacitor)

```sh
npx cap sync
npx cap open android   # Open in Android Studio
npx cap open ios       # Open in Xcode
```

See [android-camera-setup.md](android-camera-setup.md) and [android-permissions.md](android-permissions.md) for native configuration.

---

## Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

Edge functions may require additional secrets configured in Supabase (e.g., Gemini API key for COC validation).

---

## Database

Powered by Supabase Postgres with Row-Level Security (RLS).

### Key Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profile data (name, photo, role) |
| `clients` | Client companies |
| `sites` | Electrical installation sites |
| `subsections` | Circuits/areas per site |
| `inspections` | Inspection records |
| `inspection_templates` | Reusable inspection templates |
| `subsection_documents` | Uploaded COC PDFs and documents |
| `floor_plans` | Floor plan images per subsection |
| `floor_plan_pins` | Annotated issues on floor plans |
| `coc_validations` | COC validation audit trail |
| `coc_compliance_photos` | COC photo evidence |
| `offline_photos` | Universal offline photo storage |
| `inspection_reports` | Generated report metadata |
| `user_roles` | RBAC role definitions |
| `user_sites` | Site assignments for contractors |

### RLS Policy Summary

- **Admin** — Full access to all tables
- **User/Staff** — Access to assigned clients and sites
- **Contractor** — Read/write on assigned sites only
- **Client** — Read-only access to own data

### Migrations

~130 migrations in `supabase/migrations/`. Apply via Supabase CLI:

```sh
supabase db push
```

---

## Edge Functions

26 Supabase Edge Functions in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `validate-coc` | AI extraction + deterministic SANS 10142-1 validation |
| `extract-coc` | Gemini vision analysis of COC PDFs |
| `generate-pdf` | Generic PDF generation |
| `generate-inspection-pdf` | Inspection report PDFs |
| `generate-docx-report` | Word document export |
| `compress-image` | Image optimization |
| `batch-compress-images` | Bulk image processing |
| `send-email` | Email notifications |
| `send-password-reset` | Password recovery |
| `invite-user` | User invitation emails |
| `delete-user` | Account deletion cleanup |
| `qr-redirect` | QR code resolution |
| `offline-review` | Offline data export/review |
| `template-sync` | Template synchronization |
| `bulk-validate-coc` | Batch COC validation |
| `detect-schematic-regions` | AI schematic analysis |

Deploy with:

```sh
supabase functions deploy <function-name>
```

---

## Offline Architecture

### Storage

```
IndexedDB (wm_compliance_offline, v3):
├── inspections       # Offline inspection records
├── images            # Image blobs with metadata
├── subsections       # Subsection cache
├── documents         # Document blobs
├── floor_plans       # Floor plan images
├── floor_plan_pins   # Pin annotations
└── offline_photos    # Universal photo storage

LocalStorage:
└── offline_mutation_queue   # Serialized sync queue
```

### Caching Strategy (Workbox)

| Resource | Strategy | TTL |
|----------|----------|-----|
| App shell | Precache | Build-time |
| Supabase API | NetworkFirst | 24 hours |
| Images | CacheFirst | 7 days |
| Per-file limit | — | 5 MB |

### Sync Flow

1. Actions are queued in `offline_mutation_queue` when offline
2. `navigator.onLine` + Supabase health check detect connectivity
3. On reconnect: automatic sync with exponential backoff (3 retries)
4. Supported mutations: `CREATE_INSPECTION`, `UPDATE_INSPECTION`, `DELETE_INSPECTION`, `UPLOAD_IMAGE`, `UPLOAD_DOCUMENT`
5. UI feedback via toast notifications + `OfflineIndicator` badge

### Key Hooks

- `useOfflineSync` — Mutation queue management and sync orchestration
- `useOfflinePhotos` — Unified photo capture/storage across all contexts
- `useOfflineInspections` — Inspection CRUD with offline fallback
- `useOfflineSubsections` — Subsection caching and offline access

---

## PDF Generation

### Architecture

```
PDF Request
    │
    ├─→ Server-side (pdfmake via edge function) — fast, reliable
    ├─→ Client-side (html2canvas) — visual fidelity fallback
    └─→ Client-side (pdfmake direct) — lower latency
```

### Report Types

| Report | Engine | Description |
|--------|--------|-------------|
| Inspection Report | pdfmake | Full inspection documentation with photos |
| COC Certificate | pdfmake | Certificate of Evidence for SANS 10142-1 |
| Site Summary | pdfmake | Overview of all inspections at a site |
| Floor Plan Report | pdfmake | Annotated floor plans with pin notes |
| Asset Verification | pdfmake | Equipment and asset listing |

### Features

- Professional branding and templates
- Multi-page with headers/footers
- Embedded images (local blobs or URLs)
- QR codes, watermarks, and digital signatures
- Template gatekeeper architecture for layout consistency

See [docs/PDF_GENERATION_ROADMAP.md](docs/PDF_GENERATION_ROADMAP.md) and [docs/PDF_LAYOUT_STANDARDS.md](docs/PDF_LAYOUT_STANDARDS.md) for details.

---

## COC Validation Engine

Located at `src/utils/cocValidationEngine.ts`.

### How It Works

1. **Upload** — User uploads a COC PDF or enters data manually
2. **Extract** — Gemini 3 Pro extracts structured data from the PDF
3. **Validate** — Deterministic rules engine checks against SANS 10142-1 clauses
4. **Report** — Pass/fail result with detailed findings and Certificate of Evidence PDF

### Validation Rules

- Insulation resistance thresholds
- Earth loop impedance limits
- RCD trip time compliance
- Polarity verification
- Earth continuity checks
- Circuit breaker coordination
- Renewable energy system checks (PV, BESS, inverter)
- SPD and AFDD requirements
- Conductor sizing validation

### Strictness Presets

| Preset | Behavior |
|--------|----------|
| Strict | Zero tolerance — all checks must pass |
| Standard | Default thresholds per SANS 10142-1 |
| Relaxed | Wider tolerances for older installations |

See [docs/COC_VALIDATION_SPEC.md](docs/COC_VALIDATION_SPEC.md) for the full specification.

---

## Authentication & Roles

### Auth Flow

- Email + password via Supabase Auth
- Password reset via `send-password-reset` edge function
- Admin-initiated user invitations with role assignment
- Magic links for temporary public access (no account needed)

### Roles

| Role | Access |
|------|--------|
| Admin | Full platform access, user management |
| User/Staff | Assigned clients and sites |
| Client | Read-only portal for own sites and reports |
| Contractor | Read/write on assigned sites and inspections |
| Visitor | Public portal only (QR/magic link) |

RLS policies enforce permissions at the database level.

---

## Mobile & PWA

### Progressive Web App

- Installable on iOS, Android, and desktop
- Standalone display mode with app shortcuts
- Service worker for offline caching
- Configured in `vite.config.ts` (VitePWA plugin) and `public/manifest.json`

### Capacitor Native

- iOS and Android builds via Capacitor 7
- Camera plugin for photo capture
- Platform-specific permission handling

| Feature | iOS | Android | Web |
|---------|-----|---------|-----|
| PWA Install | Yes | Yes | Yes |
| Camera | Yes | Yes | Yes |
| Offline Mode | Yes | Yes | Yes |
| Responsive | Yes | Yes | Yes |

See [MOBILE_OFFLINE_SETUP.md](MOBILE_OFFLINE_SETUP.md) for setup and testing.

---

## Routing

### Public Routes

| Path | Page |
|------|------|
| `/auth` | Authentication |
| `/install` | PWA installation guide |
| `/public/subsections/:id` | Public subsection (QR code) |
| `/review/:token` | Magic-link site review |
| `/portfolio/:token` | Public client portfolio |

### Admin/Staff Routes

| Path | Page |
|------|------|
| `/dashboard` | Main dashboard |
| `/clients` | Client management |
| `/sites` | Site management |
| `/inspections` | Inspection list |
| `/inspection-templates` | Template builder |
| `/users` | User management |
| `/calendar` | Inspection calendar |
| `/settings` | App settings |
| `/qr-codes` | QR code management |
| `/coc-validation` | COC validation |
| `/coc-documentation` | SANS standards reference |
| `/offline-review` | Offline data review |
| `/feedback-management` | Consolidated feedback |

### Portal Routes

| Path | Portal |
|------|--------|
| `/client-portal` | Client dashboard |
| `/client-portal/sites` | Client site list |
| `/client-portal/sites/:id` | Client site detail |
| `/client-portal/calendar` | Client calendar |
| `/contractor` | Contractor dashboard |
| `/contractor/subsections/:id` | Contractor subsection |
| `/contractor/inspections/:id` | Contractor inspection |

---

## Documentation

| File | Topic |
|------|-------|
| [docs/COC_VALIDATION_SPEC.md](docs/COC_VALIDATION_SPEC.md) | SANS 10142-1 validation specification |
| [docs/COC_TEST_FRAMEWORK.md](docs/COC_TEST_FRAMEWORK.md) | COC testing strategies |
| [docs/PDF_GENERATION_ROADMAP.md](docs/PDF_GENERATION_ROADMAP.md) | PDF architecture and roadmap |
| [docs/PDF_LAYOUT_STANDARDS.md](docs/PDF_LAYOUT_STANDARDS.md) | PDF design standards |
| [docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md](docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md) | Template system architecture |
| [AI_MODEL_CONFIGURATION.md](AI_MODEL_CONFIGURATION.md) | Gemini 3 Pro setup and pricing |
| [OFFLINE_IMPLEMENTATION.md](OFFLINE_IMPLEMENTATION.md) | Offline architecture details |
| [MOBILE_OFFLINE_SETUP.md](MOBILE_OFFLINE_SETUP.md) | PWA and mobile setup |
| [OFFLINE_SUBSECTIONS_GUIDE.md](OFFLINE_SUBSECTIONS_GUIDE.md) | Subsection offline features |
| [IMPROVEMENTS_IMPLEMENTED.md](IMPROVEMENTS_IMPLEMENTED.md) | Code splitting, validation, error handling |

---

## Deployment

### Via Lovable

Open the [Lovable project](https://lovable.dev/projects/7b7a829f-6566-4e31-a58f-428ee0cc1c75) and click **Share > Publish**.

### Custom Domain

Navigate to **Project > Settings > Domains > Connect Domain** in Lovable. See [custom domain docs](https://docs.lovable.dev/features/custom-domain#custom-domain).

### Supabase

Edge functions and database migrations are deployed via the Supabase CLI:

```sh
supabase db push
supabase functions deploy
```

---

## License

Private repository. All rights reserved.
