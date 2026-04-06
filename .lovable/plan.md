

# Plan: Create Exhaustive APPLICATION_SPEC.md

## Context
No single comprehensive specification document exists. Documentation is scattered across 9 topic-specific files in `docs/`. The user requires an extremely detailed, leave-nothing-out reference document.

## Document Structure and Content

The document will be written to `docs/APPLICATION_SPEC.md` and will contain the following sections, each with granular detail.

---

### Section 1: Application Overview (~100 lines)
- Purpose: South African electrical compliance (SANS 10142-1) management
- Tech stack: React 18, Vite 5, Tailwind CSS v3, TypeScript 5, Supabase, Capacitor 7.x, pdfmake, Workbox
- Architecture diagram (ASCII): Client App -> Supabase (Auth + Postgres + Storage + Edge Functions) -> External services (Resend, Gemini AI, PdfShift, Google Drive)

### Section 2: Branding & Asset Locations (~80 lines)
Document every branding asset with exact storage and rendering locations:
- **Company Logo**: Stored in `settings.company_logo_url`, uploaded to `company-logos` bucket from Settings > General > "Company Logo" upload button. Rendered in: `AppSidebar` (header), PDF cover pages (`pdfBranding.ts` > `createCoverLogo`), PDF headers (`createHeaderLogo`), QR code overlays (`qrCodeGenerator.ts` 30% overlay), Auth page (fallback icon)
- **Login Hero Image**: Stored in `settings.login_hero_image_url`, uploaded to `company-logos` bucket from Settings > General > "Login Page Hero Image" upload button. Rendered in: `Auth.tsx` right panel (`<img>` tag, `object-cover`)
- **Company Name**: Stored in `settings.company_name`. Rendered in: `AppSidebar` header text, PDF branding fallback when no logo, `DashboardLayout` header ("Electrical Compliance" hardcoded, not from settings)
- **Client Logos**: Stored in `clients.logo_url`, uploaded to `client-logos` bucket. Rendered in: `Clients.tsx` card grid, `ClientDetail.tsx` header, PDF reports via `loadClientBranding()`, QR code overlays
- **Site Images**: Stored in `sites.site_image_url`, uploaded to `site-images` bucket. Rendered in: `Sites.tsx` card grid (uses signed URLs), `SiteDetail.tsx` overview tab
- **Profile Avatars**: Stored in `profiles.avatar_url`, uploaded to `profile-images` bucket. Rendered in: `AppSidebar` footer, `MyProfile.tsx`
- **QR Base URL**: Stored in `settings.qr_base_url`. Used by `qrCodeGenerator.ts` for encoding. Configurable in Settings > General

### Section 3: Authentication & Session Management (~120 lines)
- **Route**: `/auth`
- **Component**: `Auth.tsx` (757 lines)
- **Modes**: Login, Sign Up, Forgot Password, Invite Password Setup, Recovery Password Reset
- **Login form fields**: email, password. Button: "Sign In"
- **Sign Up form fields**: email, password, full_name. Button: "Create Account"
- **Forgot Password**: email field. Calls `send-password-reset` Edge Function (sends branded email via Resend). Button: "Send Reset Link"
- **Invite flow**: Detects `?token=` param, calls `supabase.auth.setSession()`, shows password setup form
- **Recovery flow**: Detects `?type=recovery&token=`, calls `supabase.auth.verifyOtp()`, shows password change form
- **Post-login redirect logic** (in `Auth.tsx` `onAuthStateChange`):
  1. Fetch `user_roles.role` for current user
  2. If role === "Client" -> navigate `/client-portal`
  3. If role === "Contractor" -> navigate `/contractor`
  4. Else -> navigate `/dashboard`
- **Session management**: `SessionWatcher.tsx` runs globally, monitors `auth.onAuthStateChange`, handles token refresh
- **Auto-logout**: `AutoLogoutSettings.tsx` component in Settings, configurable inactivity timeout
- **Onboarding**: `ProtectedRoute.tsx` checks `profiles.onboarding_completed`, shows `OnboardingWizard` if false

### Section 4: Route Table (~100 lines)
Every route with protection wrapper, layout, and component:

```text
Route                                                          | Protection           | Layout           | Component
---------------------------------------------------------------|----------------------|------------------|---------------------------
/                                                              | None                 | None             | Index (redirect)
/auth                                                          | None                 | None             | Auth
/install                                                       | None                 | None             | Install
/public/subsections/:subsectionId                              | None                 | None             | PublicSubsection
/public/clients/:clientId/sites/:siteId/subsections/:id        | None                 | None             | PublicSubsection
/review/:token                                                 | None (visitor gate)  | None             | PublicSiteReview
/review/:token/subsection/:subsectionId                        | None (visitor gate)  | None             | PublicSubsectionReview
/portfolio/:token                                              | None (visitor gate)  | None             | PublicClientPortfolio
/portfolio/:token/site/:siteId                                 | None (visitor gate)  | None             | PublicSiteReview
/dashboard                                                     | ProtectedRoute       | DashboardLayout  | Dashboard
/clients                                                       | ProtectedRoute       | DashboardLayout  | Clients
/clients/:clientId                                             | ProtectedRoute       | DashboardLayout  | ClientDetail
/clients/:clientId/sites                                       | ProtectedRoute       | DashboardLayout  | Sites
/clients/:clientId/sites/:siteId                               | ProtectedRoute       | DashboardLayout  | SiteDetail
/clients/:clientId/sites/:siteId/subsections/:subsectionId     | ProtectedRoute       | DashboardLayout  | SubsectionDetail
/.../subsections/:subsectionId/inspections/:inspectionId       | ProtectedRoute       | DashboardLayout  | InspectionDetail
/sites                                                         | ProtectedRoute       | DashboardLayout  | Sites
/sites/:siteId                                                 | ProtectedRoute       | DashboardLayout  | SiteDetail
/sites/:siteId/subsections/:subsectionId                       | ProtectedRoute       | DashboardLayout  | SubsectionDetail
/.../inspections/:inspectionId                                 | ProtectedRoute       | DashboardLayout  | InspectionDetail
/inspections                                                   | ProtectedRoute       | DashboardLayout  | Inspections
/inspection-templates                                          | ProtectedRoute       | DashboardLayout  | InspectionTemplates
/inspection-templates/new                                      | ProtectedRoute       | DashboardLayout  | TemplateBuilderPage
/inspection-templates/:templateId/edit                         | ProtectedRoute       | DashboardLayout  | TemplateBuilderPage
/inspection-templates/validate                                 | ProtectedRoute       | DashboardLayout  | TemplateValidator
/users                                                         | ProtectedRoute       | DashboardLayout  | Users
/calendar                                                      | ProtectedRoute       | DashboardLayout  | Calendar
/settings                                                      | ProtectedRoute       | DashboardLayout  | Settings
/site-assignments                                              | ProtectedRoute       | DashboardLayout  | PortalManagement
/offline-review                                                | ProtectedRoute       | DashboardLayout  | OfflineReview
/validation-feedback                                           | ProtectedRoute       | DashboardLayout  | ValidationFeedback
/feedback-management                                           | ProtectedRoute       | DashboardLayout  | FeedbackManagement
/qr-codes                                                      | ProtectedRoute       | DashboardLayout  | QRCodes
/portal-management                                             | ProtectedRoute       | DashboardLayout  | PortalManagement
/development-skills                                            | ProtectedRoute       | DashboardLayout  | DevelopmentSkills
/pdf-template-tests                                            | ProtectedRoute       | DashboardLayout  | PDFTemplateTestDashboard
/profile                                                       | AuthOnlyRoute        | DashboardLayout  | MyProfile
/client-portal                                                 | ClientProtected      | ClientPortalLayout| ClientPortalDashboard
/client-portal/sites                                           | ClientProtected      | ClientPortalLayout| ClientPortalSites
/client-portal/sites/:siteId                                   | ClientProtected      | ClientPortalLayout| ClientPortalSiteDetail
/client-portal/subsections/:subsectionId                       | ClientProtected      | ClientPortalLayout| ClientPortalSubsectionDetail
/client-portal/calendar                                        | ClientProtected      | ClientPortalLayout| ClientPortalCalendar
/contractor                                                    | ContractorProtected  | ContractorPortal  | ContractorPortal
/contractor/subsections/:subsectionId                          | ContractorProtected  | None              | ContractorSubsectionDetail
/contractor/inspections/:inspectionId                          | ContractorProtected  | ContractorLayout  | InspectionDetail
```

Redirect aliases: `/issue-reports`, `/suggestions`, `/verification-management` all -> FeedbackManagement. `/admin-client-preview`, `/admin-contractor-preview`, `/admin/contractor-access-simulator` all -> PortalManagement.

### Section 5: Global Chrome (~80 lines)
Components that appear on every protected page:
- **DashboardLayout**: `SidebarProvider` + `AppSidebar` + sticky header (SidebarTrigger + "Electrical Compliance" title + `GlobalSearch`) + scrollable content area
- **AppSidebar**: 
  - Header: Company logo from `settings.company_logo_url` or Zap icon fallback + company name
  - Menu items: Dashboard, Clients, Sites, Inspections, Templates (admin), Calendar, Users (admin), Settings (admin), QR Codes, Portal Mgmt (admin), Feedback (admin), Offline Review, Dev Skills
  - Footer: User avatar, full name, email, "My Profile" link, "Logout" button
  - Admin-only items gated by `useUserRole() === 'Admin'`
- **GlobalSearch** (`useGlobalSearch`): Searches `clients`, `sites`, `subsections`, `inspections` tables. Supports filters by client, site type, COC status, inspection status, date range
- **Background listeners** (always mounted):
  - `NotificationListener`: Subscribes to `notifications` table realtime, shows toasts for new notifications
  - `VerificationListener`: Monitors pending verification requests via `get_pending_verifications` RPC
  - `SessionWatcher`: Monitors auth state changes
  - `OfflineIndicator`: Shows banner when offline
  - `HelpButton`: Floating help button (opens `IssueReportDialog` or `SuggestionDialog`)
  - `DoubleSlashRedirect`: Fixes double-slash URL issues

### Section 6: Page-by-Page Specification

For each page below, I will document: Purpose, URL, Supabase tables read/written, every button/action, dialogs opened, navigation links, and any reports generated.

#### 6.1 Dashboard (`/dashboard`) (~80 lines)
- **Purpose**: Admin overview of all operations and compliance
- **Tables read**: `clients` (count), `sites` (count), `subsections` (id, coc_status, is_coc_required), `inspections` (id, status), `snags` (id, status, risk_level, subsection_id, subsections(name, site_id, sites(name, client_id))), `activity_logs` (last 5), `calendar_events` (upcoming 5), `coc_validations` (subsection_id, status)
- **KPI Cards (row 1)**: Total Sites, Total Subsections, Total Clients, Active Inspections
- **KPI Cards (row 2)**: Inspections Completed, COC Compliance %, Open Snags, Snag Resolution %
- **COC Validation Summary widget**: Total/Passed/Failed/Pending counts + pass rate progress bar
- **Buttons**: "Clients" (navigates `/clients`), "Sites" (navigates `/sites`), "QR Codes" (navigates `/qr-codes`)
- **Widgets**: `VerificationDashboardWidget`, `RecentAssignmentsWidget`
- **Tables displayed**: Activity log (last 5), Upcoming events (next 5), High-risk snags (top 10, risk_level in [High, Critical])
- **Navigation**: Activity items link nowhere; upcoming events show details; snag rows navigable

#### 6.2 Clients (`/clients`) (~60 lines)
- **Purpose**: CRUD for client organizations
- **Tables**: `clients` (select with `sites(id)` for count), `client-logos` bucket
- **Buttons**: "Add Client" (dashed card at end of grid, opens create dialog)
- **Card grid**: Each card shows logo (from `client-logos` bucket public URL) or Building2 icon, name, site count. Click navigates to `/clients/:clientId/sites`
- **Card dropdown** (three-dot menu): "Edit Client" (opens edit dialog), "Delete Client" (confirm prompt)
- **Create dialog fields**: Client Name (required, validated via `clientSchema`), Company Name, Contact Person, Primary Contact Email, Email, Phone, Logo upload (to `client-logos` bucket)
- **Edit dialog**: Same fields pre-populated, plus "Delete Logo" option with AlertDialog confirmation
- **Validation**: Uses `clientSchema` from `validation-schemas.ts` with Zod

#### 6.3 Client Detail (`/clients/:clientId`) (~60 lines)
- **Purpose**: View client info, logo management, and nested site structure
- **Tables**: `clients` (with `sites(*, subsections(*, subsection_documents(*)), inspections(*))`)
- **Layout**: Breadcrumbs, client logo + name header, 3-column grid (Contact Info card, Client Logo card, Overview stats card)
- **Client Logo card**: Shows current logo or "No logo uploaded", "Upload Logo" button (uses `useCamera` hook for Capacitor camera support), delete logo button (hover reveal)
- **Legacy URL detection**: If logo URL contains `firebasestorage.googleapis.com`, shows warning with "Clear & Upload New" button
- **Sites & Structure card**: Expandable site cards, each with tabs (Subsections, Inspections). Site header click navigates to `/clients/:clientId/sites/:siteId`

#### 6.4 Sites (`/sites` or `/clients/:clientId/sites`) (~50 lines)
- **Purpose**: List and create sites, optionally filtered by client
- **Tables**: `sites` (with `clients(name)`), `clients` (for dropdown)
- **Buttons**: "Add Site" (opens dialog). Disabled if no clients exist
- **Create dialog fields**: Client (dropdown, pre-filled if clientId in URL), Site Name (required), Site Type (dropdown: Commercial/Industrial/Residential/Mall/Office), Address
- **Card grid**: Each card shows site image (uses signed URLs via `createSignedUrl` for `site-images` bucket) or Building2 icon, name, client name, type, address. Three-dot menu with "Delete Site"
- **Navigation**: Card click -> `/clients/:clientId/sites/:siteId`

#### 6.5 Site Detail (`/clients/:clientId/sites/:siteId`) (~200 lines)
- **Purpose**: Central hub for all site management
- **Tables read**: `sites`, `subsections`, `inspections`, `snags`, `coc_validations`, `document_categories`, `site_documents`, `subsection_documents`, `inspection_templates`, `settings`
- **Tabs** (9 total):
  1. **Overview** (`SiteOverview`): Site image, address, type, status, supply authority, nominated max demand. "Edit" button opens `SiteEditDialog`
  2. **Schematic** (`SchematicDiagram`): Visual block diagram of electrical distribution. Blocks linked to subsections show tenant meter/CT/breaker photos
  3. **Asset Verification** (`AssetVerification`): Excel import, comparison table, meter register, PDF report generation
  4. **Compliance** (`ComplianceDashboard`): COC compliance stats, validation log, inline violation overrides
  5. **Documents** (`SiteDocuments`): Site-level + subsection-level documents organized by category. Upload, preview (DocumentPreviewDialog), download, delete. Category CRUD
  6. **Subsections** (`SubsectionList`): Filterable/groupable list of subsections with COC status, compliance, snag counts
  7. **QR Analytics** (`QRAnalytics`): Generate/download/bulk ZIP QR codes for all subsections
  8. **Fortress Checklist** (`FortressMarkingChecklist`): Electrical marking compliance checklist
  9. **Reports** (`SiteReports`): Site summary report, bulk inspection report generation, Generate Final Report button
- **Dialogs**: SiteEditDialog, DocumentDialogs (upload/category create), InspectionDialogs (create inspection with template selection)
- **Reports generated from this page**:
  - Site Summary Report (pdfmake, saved to `documents` bucket + `site_documents` table)
  - Asset Verification Report (pdfmake)
  - Bulk Inspection Reports
  - Final Site Report (comprehensive, saved to `documents` bucket)

#### 6.6 Subsection Detail (`/.../subsections/:subsectionId`) (~200 lines)
- **Purpose**: Manage a single tenant/area: COC compliance, documents, inspections, floor plan
- **Tables**: `subsections`, `sites`, `clients`, `subsection_documents`, `document_categories`, `coc_validations`, `coc_extractions`, `snags`, `inspections`, `subsection_floor_plans`, `floor_plan_pins`, `settings`
- **Realtime subscriptions**: `subsections`, `subsection_documents`, `coc_validations` tables
- **Tabs** (5):
  1. **Overview**: Tenant info, COC details (number, type, issue date, status), metering details (serial, status), compliance alert (if failed validation). Edit buttons for each section
  2. **Inspections**: List of inspections for this subsection. "Create Inspection" button (with template selection). Status update dropdown. Delete inspection. "Generate Report" button per inspection
  3. **Floor Plan**: `InteractiveFloorPlan` component. Upload floor plan image, place pins (snag/note/electrical), pin CRUD
  4. **Documents**: Categorized document management. Default categories created on first visit. Upload dialog (select category, choose file). COC document pipeline: Upload -> AI Extraction (Gemini) -> Human Review (COCPreviewDialog) -> Validation (validate-coc Edge Function) -> Status update
  5. **COC & Metering**: COC compliance details, metering details, validation history, extraction data
- **COC Pipeline flow**:
  1. Upload COC document to `documents` bucket -> insert into `subsection_documents`
  2. "Extract" button -> calls `extract-coc` Edge Function (Gemini AI) -> stores in `coc_extractions`
  3. "Review" button -> opens `COCPreviewDialog` showing extracted data for human review
  4. "Approve & Verify" -> calls `validate-coc` Edge Function -> stores result in `coc_validations` -> updates `subsections.coc_status`

#### 6.7 Inspection Detail (`/.../inspections/:inspectionId`) (~120 lines)
- **Purpose**: Fill out template-driven inspection form, capture photos, manage tenants/snags/signatures, generate report
- **Tables**: `inspections` (json_data JSONB), `inspection_templates`, `sites`, `subsections`, `inspection_signatures`, `snags`, `settings`
- **Tabs**: General (inspector info, date, status), Template Sections (dynamic from template), Tenants (add/edit tenant cards with meter/CT/breaker photo capture), Snags (create/manage snag list with photos), Signatures (capture digital signatures via `SignatureCapture`)
- **Photo capture**: Uses `useImageUpload` hook -> uploads to `inspection-photos` bucket -> stores public URL in `json_data`
- **Save**: Updates `inspections.json_data` JSONB column
- **Report generation**: "Generate Report" button -> renders `ComprehensiveInspectionReport` React component -> captures with html2canvas at 2x scale -> assembles with jsPDF -> uploads to `documents` bucket -> inserts into `subsection_documents`
- **Offline support**: `useOfflineInspectionDetail` hook caches data in IndexedDB, queues mutations via `useOfflineSync`
- **QR Code**: Generated for each inspection via `qrCodeGenerator`

#### 6.8 Inspection Templates (`/inspection-templates`) (~60 lines)
- **Purpose**: Manage reusable inspection form templates
- **Tables**: `inspection_templates`
- **Views**: Grid view with template cards showing name, category, section/page counts
- **Buttons**: "Create Template" (navigates to `/inspection-templates/new`), "Validate Templates" (navigates to `/inspection-templates/validate`)
- **Card actions**: Preview (opens `TemplatePreviewRenderer` dialog), Edit (navigates to `/:templateId/edit`), Duplicate, Delete, Export PDF (`useUnifiedPdfGeneration`), Import PDF (`PDFTemplateUploader`)
- **Template categories**: Electrical, Solar, Metering, HVAC, Fire, General (each with icon)

#### 6.9 Template Builder (`/inspection-templates/new` or `/:templateId/edit`) (~40 lines)
- **Purpose**: Create/edit template structure
- **Component**: `TemplateBuilder.tsx`
- **Features**: Add sections, add items to sections (text/select/checkbox/photo/number types), reorder via drag, set required fields, define select options, add tenant fields
- **Save**: Inserts/updates `inspection_templates` row with sections as JSONB array

#### 6.10 Template Validator (`/inspection-templates/validate`) (~30 lines)
- **Purpose**: Run database-level validation on all templates
- **RPC**: `validate_inspection_templates()` (checks: null sections, missing names, duplicate IDs, non-array format)
- **UI**: Table of issues with "Edit Template" links

#### 6.11 Users (`/users`) (~80 lines)
- **Purpose**: User management, invitations, role assignment
- **Tables**: `profiles`, `user_roles`, `user_clients`, `user_sites`, `pending_user_invites`
- **Edge Functions**: `invite-user`, `delete-user`, `send-password-reset`
- **Buttons**: "Invite User" (opens dialog with email, full_name, role, optional temp password, optional client/site assignment)
- **Pending invites table**: Resend invite, delete invite
- **Active users table**: Edit (profile fields + avatar upload to `profile-images` bucket), Change Role, Reset Password, Edit Site Assignments, View RLS Policies (`UserRLSPolicies` component calls `get_rls_policies_for_role` RPC), Delete User
- **Roles**: Admin, User, Client, Contractor (enum `app_role`)

#### 6.12 Calendar (`/calendar`) (~50 lines)
- **Purpose**: Annual calendar view with event management
- **Tables**: `calendar_events`
- **UI**: 12-month grid (4 columns), events shown as colored bars. Schedule table below
- **Buttons**: "Add New Event" (dialog: title, site_name, start_date, end_date, status, priority, event_type), "Export PDF" (uses `useUnifiedPdfGeneration`)
- **Event actions**: Edit, Delete
- **Color coding**: Site-based consistent hashing for bar colors

#### 6.13 Settings (`/settings`) (~60 lines)
- **Purpose**: App configuration
- **Tables**: `settings`
- **Tabs**:
  1. **General**: Branding (company logo upload to `company-logos`, login hero image upload to `company-logos`, company name, QR base URL), Integrations (Google Drive - placeholder), Auto-Logout settings
  2. **Images**: `ImageCompressionManager` - batch compress images in `inspection-photos` bucket via `compress-image` and `batch-compress-images` Edge Functions
  3. **Users**: Embeds the full `Users` page component
  4. **Portals**: Embeds the full `PortalManagement` page component

#### 6.14 Portal Management (`/portal-management`) (~40 lines)
- **Purpose**: Manage client/contractor portal access
- **Tabs**: Access Links (`AccessLinkGenerator` - creates `client_access_links` entries), Client Simulator, Contractor Simulator, Site Assignments (`SiteAssignments` - manages `user_sites` table)

#### 6.15 QR Codes (`/qr-codes`) (~40 lines)
- **Purpose**: Global QR code database with search
- **Tables**: `subsections` (with `sites(name, client_id, clients(name, company_name))`) filtered by `qr_code_url IS NOT NULL`
- **Search**: Filters by client name, company name, site name, subsection name
- **Card actions**: "Download QR" (opens dialog with `LabeledQRCode` component using `window.location.origin`), "View Details" (navigates to subsection detail)

#### 6.16 Feedback Management (`/feedback-management`) (~40 lines)
- **Purpose**: Consolidated issue reports, suggestions, and fix verifications
- **Tables**: `issue_reports`, `suggestions`
- **Tabs**: Overview (stats: tested/untested/confidence), Issues (`IssueReports` page), Suggestions (`Suggestions` page), Verifications (`VerificationManagement` page)

#### 6.17 My Profile (`/profile`) (~40 lines)
- **Purpose**: User's own profile editing
- **Tables**: `profiles`
- **Fields**: Full name, phone, job title, department, company, address, city, country, postal code, bio
- **Avatar**: Upload to `profile-images` bucket
- **Password change**: Uses `supabase.auth.updateUser({ password })`

#### 6.18 Offline Review (`/offline-review`) (~20 lines)
- **Purpose**: Paste offline code for AI review
- **Edge Function**: `offline-review` (sends code to AI for analysis)

#### 6.19 Development Skills (`/development-skills`) (~20 lines)
- **Purpose**: Reference library for SANS compliance, inspection procedures, documentation standards, technical guidelines, safety protocols
- **Tables**: `development_skills` (if exists, or hardcoded `BASE_SKILLS`)

#### 6.20 Install (`/install`) (~15 lines)
- **Purpose**: PWA installation instructions
- **Features**: Detects installability, handles iOS vs Android instructions, "Install" button triggers `beforeinstallprompt`

#### 6.21-6.24 Client Portal Pages (~60 lines)
- **Protection**: `ClientProtectedRoute` (checks `user_roles.role === 'Client'`, gets `client_id` from `user_clients`)
- **Layout**: `ClientPortalLayout` (sidebar with limited menu)
- `/client-portal`: Dashboard with site count, subsection count, compliance stats, open snags, `ComplianceHealthWidget`, `SiteOverviewCard` per site
- `/client-portal/sites`: Read-only site list filtered by client
- `/client-portal/sites/:siteId`: Read-only site detail with tabs
- `/client-portal/subsections/:subsectionId`: Read-only subsection detail
- `/client-portal/calendar`: Read-only calendar

#### 6.25-6.27 Contractor Portal Pages (~40 lines)
- **Protection**: `ContractorProtectedRoute` (checks `user_roles.role === 'Contractor'`)
- `/contractor`: Dashboard showing assigned sites (from `user_sites`), pending/completed inspection counts, site cards with subsection lists
- `/contractor/subsections/:subsectionId`: Subsection detail (limited write access per RLS)
- `/contractor/inspections/:inspectionId`: Full inspection detail (can create/update inspections for assigned sites)

#### 6.28-6.31 Public Pages (~60 lines)
- `/public/subsections/:subsectionId` (`PublicSubsection`): QR code landing page. Shows subsection details, compliance status (using `FAILED_VALIDATION_STATUSES`), documents by category, snags. No auth required (public RLS policies)
- `/review/:token` (`PublicSiteReview`): Magic-link site review. Validates token via `validate_access_link` RPC. `VisitorRegistrationGate` collects visitor info (name, email, phone, role) before showing content. Shows full site with tabs (Overview, Subsections, Schematic, Compliance, Documents, Reports). Read-only
- `/review/:token/subsection/:subsectionId` (`PublicSubsectionReview`): Subsection detail within review context
- `/portfolio/:token` (`PublicClientPortfolio`): Client portfolio showing all sites with compliance stats. Token validation + visitor gate

### Section 7: Reports Inventory (~150 lines)
For each report: trigger location, button text, content sources, PDF engine, storage destination, filename pattern.

1. **Site Summary Report**: SiteDetail > Reports tab > "Generate Site Summary". Engine: pdfmake (`siteSummaryRenderSpec.ts`). Content: site info, subsection stats, compliance summary, snag summary. Storage: `documents` bucket, `site_documents` table (category: "Site Summary Reports"). Filename: `Site_Summary_{siteName}_{date}.pdf`
2. **Inspection Report (WYSIWYG)**: InspectionDetail > "Generate Report". Engine: html2canvas + jsPDF (`wysiwygPdfGenerator.ts`). Content: cover page, quality dashboard, section items with photos, tenants, snags, signatures. Storage: `documents` bucket, `subsection_documents` table (category: "Inspection Reports")
3. **Inspection Report (pdfmake)**: InspectionDetail > alternate path via `pdfmakeInspectionReport.ts`. Engine: pdfmake. Same content as WYSIWYG but styled differently
4. **Asset Verification Report**: SiteDetail > Asset Verification tab > "Generate Report". Engine: pdfmake (`assetVerificationReportGenerator.ts`). Content: KPI dashboard, comparison table, meter register. Storage: `documents` bucket, `site_documents` table
5. **Compliance Report**: SiteDetail > Compliance tab > export. Engine: pdfmake (`complianceReportGenerator.ts`). Content: compliance stats, validation results
6. **Floor Plan Report**: SubsectionDetail > Floor Plan tab > export. Engine: pdfmake (`floorPlanReportGenerator.ts`). Content: floor plan image with pin overlay, pin details table
7. **Calendar Report**: Calendar > "Export PDF". Engine: pdfmake via `useUnifiedPdfGeneration`. Content: year events, stats
8. **Template Export**: InspectionTemplates > card > "Export PDF". Engine: pdfmake via `useUnifiedPdfGeneration`. Content: template structure, sections, items
9. **Bulk Inspection Reports**: SiteDetail > Reports tab > `BulkInspectionReportGenerator`. Generates reports for all inspections in a site
10. **Final Site Report**: SiteDetail > Reports tab > `GenerateFinalReportButton`. Comprehensive multi-section report saved to storage
11. **DOCX Report**: Via `generate-docx-report` Edge Function (server-side)

### Section 8: Supabase Integration Map (~200 lines)

#### 8.1 Tables and their consumers
Full table-to-page mapping for all 30+ tables. For each: which pages read, which pages write, key columns, RLS policy summary.

#### 8.2 Storage Buckets
- `company-logos` (public): Company logo, login hero image. Written by Settings. Read by AppSidebar, Auth, PDF generators
- `client-logos` (public): Client logos. Written by Clients, ClientDetail. Read by client cards, PDF branding
- `inspection-photos` (public): Inspection photos, QR code PNGs, tenant images. Written by InspectionDetail, qrCodeGenerator. Read by SchematicDiagram, inspection reports, QR download
- `site-images` (public): Site photos. Written by SiteDetail overview. Read by Sites list (via signed URLs despite public bucket)
- `profile-images` (public): User avatars. Written by MyProfile, Users. Read by AppSidebar, profile displays
- `documents` (public): COC documents, generated PDFs, uploaded docs. Written by SubsectionDetail, report generators. Read by document preview/download
- `issue-screenshots` (public): Issue report screenshots. Written by IssueReportDialog
- `suggestion-screenshots` (public): Suggestion screenshots. Written by SuggestionDialog
- `coc-photos` (public): COC compliance photos. Written by COC photo capture

#### 8.3 Edge Functions (16 total)
For each: purpose, JWT requirement, trigger location, secrets used.

#### 8.4 Database Functions (12 total)
For each: purpose, security model, which pages/triggers call it.

### Section 9: Data Flow Diagrams (~100 lines)
ASCII diagrams for:
1. Auth flow (login -> role check -> redirect)
2. Inspection lifecycle (create -> fill form -> capture photos -> sign -> generate report)
3. COC validation pipeline (upload -> extract -> review -> validate -> status update)
4. Offline sync flow (capture offline -> IndexedDB -> come online -> process queue -> Supabase)
5. Document upload/preview/download flow
6. QR code lifecycle (generate -> store -> scan -> resolve)

### Section 10: Compliance Rules (~50 lines)
- Subsection pass/fail rules (4 independent checks)
- `sync_coc_compliance_status()` trigger logic
- `FAILED_VALIDATION_STATUSES` constant
- `hasValidCocStatus()` function
- Metering status check
- Open snag check

### Section 11: Offline Architecture (~60 lines)
- IndexedDB schema (offlineDB, offlineDBExtensions, offlineFloorPlanDB, offlineInspectionDB)
- Sync queue (`offline_mutation_queue` in localStorage)
- Hooks: `useOfflineSync`, `useOfflineInspections`, `useOfflineSubsections`, `useOfflinePhotos`, `useOfflineFloorPlanAnnotations`, `useOfflineInspectionDetail`
- Workbox caching strategy
- Service worker registration (`registerServiceWorker.ts`)

---

## Implementation Approach

1. Read every remaining file I haven't fully read (approximately 15 more component/page files) to extract exact button labels, dialog fields, and Supabase queries
2. Write the complete document section by section, using exact component names, function names, table names, column names, and bucket names from the codebase
3. Include ASCII diagrams for all data flows
4. Cross-reference every button to its handler function and the Supabase call it makes
5. Output to `docs/APPLICATION_SPEC.md`

## Estimated Size
3,500-4,500 lines of structured markdown.

