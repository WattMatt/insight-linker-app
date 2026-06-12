# APPLICATION_SPEC.md — WM Compliance (Insight Linker)

> ⚠️ **COC section superseded 2026-06-12.** The automated COC validation engine described in this spec was removed; COC is now a manual Pass/Fail verdict per subsection (+ failure report) that gates `is_compliant`. See `docs/system-reference/00-INDEX.md` → "Post-review changes" and `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md`. (This spec predates the 2026-05 Vite→Next migration and is otherwise partly stale — see `docs/system-reference/08-existing-docs-audit/`.)

> **Exhaustive Application Specification**
> Generated from codebase analysis. Last updated: 2026-04-06.
> Every page, button, dialog, Supabase table reference, report, branding asset, and data flow is documented.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Branding & Asset Locations](#2-branding--asset-locations)
3. [Authentication & Session Management](#3-authentication--session-management)
4. [Route Table](#4-route-table)
5. [Global Chrome](#5-global-chrome)
6. [Page-by-Page Specification](#6-page-by-page-specification)
7. [Reports Inventory](#7-reports-inventory)
8. [Supabase Integration Map](#8-supabase-integration-map)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Compliance Rules](#10-compliance-rules)
11. [Offline Architecture](#11-offline-architecture)

---

## 1. Application Overview

### 1.1 Purpose

WM Compliance (branded "Insight Linker") is a South African electrical compliance management system built for managing inspections, Certificates of Compliance (COC), and asset verification under **SANS 10142-1** regulations. It serves consulting engineers, contractors, and clients managing commercial/industrial electrical installations.

### 1.2 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 18.3.x |
| Build Tool | Vite | 5.4.x |
| Language | TypeScript | 5.8.x |
| Styling | Tailwind CSS + shadcn/ui | 3.4.x |
| State/Data | TanStack Query | 5.83.x |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | 2.75.x |
| Mobile | Capacitor | 7.4.x (Android + iOS) |
| PDF | pdfmake (primary), html2canvas + jsPDF (WYSIWYG fallback) | 0.3.x / 4.0.x |
| Offline | Workbox (via vite-plugin-pwa) + IndexedDB | 7.3.x |
| QR Codes | qrcode (npm) | 1.5.x |
| Charts | Recharts | 2.15.x |

### 1.3 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT APPLICATION                          │
│  React 18 + Vite 5 + Tailwind CSS + Capacitor (Android/iOS)    │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────┐ │
│  │ Dashboard │  │ Site Detail   │  │ Inspections│  │ Portals    │ │
│  │ Clients   │  │ Subsections  │  │ Templates  │  │ (Client/   │ │
│  │ Settings  │  │ Compliance   │  │ Reports    │  │ Contractor)│ │
│  └─────┬─────┘  └──────┬───────┘  └─────┬──────┘  └─────┬──────┘ │
│        │               │                │                │        │
│  ┌─────┴───────────────┴────────────────┴────────────────┴─────┐ │
│  │              Supabase JS Client (supabase-js v2)            │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                              │                                    │
│  ┌──────────────────────────┴──────────────────────────────────┐ │
│  │ Offline Layer: IndexedDB (wm_compliance_offline) + Workbox  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
┌──────────────────────────────┴──────────────────────────────────┐
│                    SUPABASE PROJECT                              │
│                  (oltzgidkjxwsukvkomof)                          │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │ Auth     │  │ Postgres │  │ Storage  │  │ Edge Functions │  │
│  │ (GoTrue) │  │ (30+     │  │ (9       │  │ (16 functions) │  │
│  │          │  │  tables)  │  │  buckets) │  │                │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────┬────────┘  │
└──────────────────────────────────────────────────────┬──────────┘
                                                       │
                              ┌─────────────────────────┴──────┐
                              │ External Services              │
                              │ • Resend (email)               │
                              │ • Google Gemini AI (COC OCR)   │
                              │ • PdfShift (HTML→PDF)          │
                              │ • Browserless (headless Chrome)│
                              │ • Abacus AI (code review)      │
                              └────────────────────────────────┘
```

### 1.4 Supabase Project Details

- **Project Ref**: `oltzgidkjxwsukvkomof`
- **Published URL**: `https://wm-compliance.lovable.app`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (in `.env` as `VITE_SUPABASE_PUBLISHABLE_KEY`)

---

## 2. Branding & Asset Locations

Every branding asset in the system, where it is stored, how it is uploaded, and every location where it is rendered.

### 2.1 Company Logo

| Property | Value |
|----------|-------|
| **Database column** | `settings.company_logo_url` |
| **Storage bucket** | `company-logos` (public) |
| **Upload location** | Settings page > General tab > "Company Logo (for sidebar)" section > "Choose File" button |
| **Upload handler** | `Settings.tsx` > `handleLogoUpload()` > `uploadImage(file, 'company-logos', 'logo')` |
| **File naming** | `logo-{timestamp}.{extension}` |

**Rendered in:**
1. **AppSidebar header** (`AppSidebar.tsx` line ~130): `<img src={settings.company_logo_url}>` with `max-h-8` constraint. Fallback: `<Zap>` icon
2. **PDF cover pages** (`pdfBranding.ts` > `createCoverLogo()`): Converted to base64 data URL, rendered at 60mm × 30mm (~170pt × 85pt)
3. **PDF page headers** (`pdfBranding.ts` > `createHeaderLogo()`): Rendered at 25mm × 12mm (~71pt × 34pt)
4. **QR code overlays** (`qrCodeGenerator.ts` line ~90): Overlaid at 30% of QR code size in center with white border
5. **Auth page fallback** (`Auth.tsx`): Not directly rendered; shows `<Zap>` icon if no logo

### 2.2 Login Hero Image

| Property | Value |
|----------|-------|
| **Database column** | `settings.login_hero_image_url` |
| **Storage bucket** | `company-logos` (public, same bucket as company logo) |
| **Upload location** | Settings page > General tab > "Login Page Hero Image" section > "Choose File" button |
| **Upload handler** | `Settings.tsx` > `handleHeroUpload()` > `uploadImage(file, 'company-logos', 'hero')` |
| **File naming** | `hero-{timestamp}.{extension}` |

**Rendered in:**
1. **Auth page right panel** (`Auth.tsx` line ~738-751): `<img src={settings.login_hero_image_url} className="absolute inset-0 w-full h-full object-cover">`. Only visible on `lg:` breakpoint and above. Fallback: gradient background with "Electrical Compliance Management" text

### 2.3 Company Name

| Property | Value |
|----------|-------|
| **Database column** | `settings.company_name` |
| **Update location** | Settings page > General tab > "Company Name" input + "Update" button |
| **Update handler** | `Settings.tsx` > `handleCompanyNameUpdate()` > updates `settings.company_name` |

**Rendered in:**
1. **AppSidebar header** (`AppSidebar.tsx` line ~135): Text next to logo. Fallback: "Compliance Pro"
2. **PDF branding** (`pdfBranding.ts`): Used as `organizationName` fallback when no logo image is available
3. **DashboardLayout header**: Hardcoded as "Electrical Compliance" — does NOT read from settings

### 2.4 Client Logos

| Property | Value |
|----------|-------|
| **Database column** | `clients.logo_url` |
| **Storage bucket** | `client-logos` (public) |
| **Upload locations** | Clients page (create/edit dialog), ClientDetail page ("Upload Logo" button) |
| **Upload handler** | Clients: dialog form upload. ClientDetail: `useCamera` hook (supports Capacitor camera) |

**Rendered in:**
1. **Clients page card grid** (`Clients.tsx`): `<img>` in card with `max-h-12` or `Building2` icon fallback
2. **ClientDetail header** (`ClientDetail.tsx`): Logo image with `max-h-24` or "No logo uploaded" text
3. **PDF reports** (`pdfBranding.ts` > `loadClientBranding()`): Fetched from `clients.logo_url`, converted to base64
4. **QR code overlays**: Optional secondary logo overlay

### 2.5 Site Images

| Property | Value |
|----------|-------|
| **Database column** | `sites.site_image_url` |
| **Storage bucket** | `site-images` (public) |
| **Upload location** | SiteDetail > Overview tab > SiteEditDialog |

**Rendered in:**
1. **Sites page card grid** (`Sites.tsx`): Uses **signed URLs** via `supabase.storage.from('site-images').createSignedUrl()` despite bucket being public. Fallback: `Building2` icon
2. **SiteDetail overview tab** (`SiteOverview.tsx`): Site image display
3. **PDF site reports**: Cover page background/thumbnail

### 2.6 Profile Avatars

| Property | Value |
|----------|-------|
| **Database column** | `profiles.avatar_url` |
| **Storage bucket** | `profile-images` (public) |
| **Upload locations** | MyProfile page, Users page (admin editing a user) |

**Rendered in:**
1. **AppSidebar footer** (`AppSidebar.tsx`): `<Avatar>` component with fallback initials
2. **MyProfile page** (`MyProfile.tsx`): Large avatar display with upload button
3. **Users page** (`Users.tsx`): Avatar in user table rows

### 2.7 QR Code Base URL

| Property | Value |
|----------|-------|
| **Database column** | `settings.qr_base_url` |
| **Default value** | `https://wm-compliance.lovable.app` |
| **Update location** | Settings page > General tab > "QR Code Base URL" input + "Update" button |
| **Update handler** | `Settings.tsx` > `handleQrBaseUrlUpdate()` |

**Used by:**
1. **QR code generator** (`qrCodeGenerator.ts` line ~27): Constructs URL as `{qr_base_url}/public/subsections/{subsectionId}`
2. **QR Codes page** (`QRCodes.tsx`): Uses `window.location.origin` for the `LabeledQRCode` component (note: different from generator)

---

## 3. Authentication & Session Management

### 3.1 Auth Page (`/auth`)

**Component**: `src/pages/Auth.tsx` (757 lines)
**Protection**: None (public page)
**Layout**: Two-column layout. Left: auth forms. Right: hero image (desktop only, `lg:` breakpoint)

#### 3.1.1 Login Mode (Default)

**Form fields:**
| Field | Input Type | Name Attr | Placeholder | Validation |
|-------|-----------|-----------|-------------|------------|
| Email | email | `email` | `admin@wmeng.co.za` | Required, HTML email validation |
| Password | password | `password` | (none) | Required |

**Buttons:**
- "Login" (`type="submit"`) — calls `handleSignIn()`:
  1. `supabase.auth.signInWithPassword({ email, password })`
  2. On success → redirected by `onAuthStateChange` listener (see §3.1.6)
  3. On error → toast with error message
- "Forgot your password?" (text link) — switches to Forgot Password mode
- "Sign up" (text link) — switches to Sign Up mode

#### 3.1.2 Sign Up Mode

**Form fields:**
| Field | Input Type | Name Attr | Placeholder | Validation |
|-------|-----------|-----------|-------------|------------|
| Full Name | text | `fullName` | `John Smith` | Required |
| Email | email | `email` | `admin@wmeng.co.za` | Required |
| Password | password | `password` | `Minimum 6 characters` | Required, minLength=6 |

**Buttons:**
- "Sign up" (`type="submit"`) — calls `handleSignUp()`:
  1. `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
  2. On success → toast "Check your email to verify your account!"
  3. `handle_new_user()` trigger automatically creates `profiles` row and `user_roles` row (Admin if first user, otherwise User)
- "Sign in" (text link) — switches back to Login mode

#### 3.1.3 Forgot Password Mode

**Form fields:**
| Field | Input Type | Name Attr | Placeholder | Validation |
|-------|-----------|-----------|-------------|------------|
| Email | email | `resetEmail` | `your@email.com` | Required |

**Buttons:**
- "Send Reset Link" (`type="submit"`) — calls `handleForgotPassword()`:
  1. Calls `send-password-reset` Edge Function with `{ email }`
  2. Edge Function sends branded HTML email via Resend with recovery link
  3. On success → shows "Reset email sent!" confirmation UI
- "Back to Login" — returns to Login mode

**Post-reset confirmation UI:** Shows check icon + "Reset email sent!" + instructions + "Back to Login" button

#### 3.1.4 Invite Password Setup Mode

**Trigger**: URL contains `?type=invite` with `#access_token=...` in hash
**Handler**: `handleInviteToken()` at line 172:
1. Extracts access token from URL hash
2. Calls `supabase.auth.setSession({ access_token, refresh_token: token })`
3. Sets `isInvite=true`, `inviteEmail` from session user
4. Shows password setup form

**Form fields:**
| Field | Input Type | Name Attr | Placeholder | Validation |
|-------|-----------|-----------|-------------|------------|
| Create Password | password | `newPassword` | `Minimum 6 characters` | Required, minLength=6 |
| Confirm Password | password | `confirmPassword` | `Re-enter your password` | Required, minLength=6 |

**Buttons:**
- "Set Password & Continue" — calls `handleSetPassword()`:
  1. Validates passwords match
  2. Validates password has letters AND numbers
  3. `supabase.auth.updateUser({ password, data: { requires_password_change: false } })`
  4. On success → navigates to `/dashboard`

#### 3.1.5 Recovery Password Reset Mode

**Trigger**: URL contains `?type=recovery&token=...`
**Handler**: `handleRecoveryToken()` at line 138:
1. Calls `supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' })`
2. If valid → sets `requiresPasswordChange=true`, shows password change form (same as §3.1.4)
3. If invalid → toast error, switches to Forgot Password mode

#### 3.1.6 Post-Login Redirect Logic

Defined in `onAuthStateChange` callback (line 57-97):
1. On `SIGNED_IN` event (and not invite, not requires_password_change):
2. Fetches `user_roles.role` for `session.user.id` via `supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle()`
3. Redirect table:

| Role | Redirect Target |
|------|----------------|
| `Client` | `/client-portal` |
| `Contractor` | `/contractor` |
| `Admin` / `User` / null | `/dashboard` |

### 3.2 Session Watcher

**Component**: `src/components/SessionWatcher.tsx` (145 lines)
**Mounted in**: DashboardLayout (always active for authenticated users)
**Purpose**: Auto-logout at a configured time each day

**Behavior:**
1. Fetches `settings.auto_logout_enabled` and `settings.auto_logout_time` (HH:MM:SS format)
2. Every 60 seconds, checks if current time matches configured logout time
3. If match AND not already logged out today (`localStorage` key `wm_last_auto_logout_date`):
   - Shows 5-minute warning toast
   - After 5 minutes: calls `clearAllCaches()` (clears IndexedDB, localStorage, sessionStorage) → `supabase.auth.signOut()` → navigates to `/auth`
4. Stores last auto-logout date in `localStorage` to prevent repeated logouts

### 3.3 Onboarding Wizard

**Component**: `src/components/OnboardingWizard.tsx`
**Trigger**: `ProtectedRoute.tsx` checks `profiles.onboarding_completed` — if `false`, renders `<OnboardingWizard open={true}>`
**Dismiss**: Sets `onboarding_completed=true` in `profiles` table, or user dismisses

### 3.4 Protected Route Wrappers

| Wrapper | File | Behavior |
|---------|------|----------|
| `ProtectedRoute` | `src/components/ProtectedRoute.tsx` | Requires auth. If role=Client → redirect `/client-portal`. If role=Contractor → redirect `/contractor`. Shows onboarding wizard if needed. |
| `ClientProtectedRoute` | `src/components/ClientProtectedRoute.tsx` | Requires auth + role=Client (or Admin with `?preview=` param). Shows onboarding wizard. |
| `ContractorProtectedRoute` | `src/components/ContractorProtectedRoute.tsx` | Requires auth + role=Contractor (or Admin with `?preview=` param). |
| `AuthOnlyRoute` | `src/components/AuthOnlyRoute.tsx` | Requires auth only, no role check. Used for `/profile`. |

---

## 4. Route Table

Every route in the application, extracted from `src/App.tsx`:

```
Route                                                          | Protection           | Layout             | Component                | File
---------------------------------------------------------------|----------------------|--------------------|--------------------------|----------------------------------
/                                                              | None                 | None               | Index (redirect only)    | src/pages/Index.tsx
/auth                                                          | None                 | None               | Auth                     | src/pages/Auth.tsx
/install                                                       | None                 | None               | Install                  | src/pages/Install.tsx
/public/subsections/:subsectionId                              | None                 | None               | PublicSubsection         | src/pages/PublicSubsection.tsx
/public/clients/:clientId/sites/:siteId/subsections/:id        | None                 | None               | PublicSubsection         | src/pages/PublicSubsection.tsx
/review/:token                                                 | None (visitor gate)  | None               | PublicSiteReview         | src/pages/PublicSiteReview.tsx
/review/:token/subsection/:subsectionId                        | None (visitor gate)  | None               | PublicSubsectionReview   | src/pages/PublicSubsectionReview.tsx
/portfolio/:token                                              | None (visitor gate)  | None               | PublicClientPortfolio    | src/pages/PublicClientPortfolio.tsx
/portfolio/:token/site/:siteId                                 | None (visitor gate)  | None               | PublicSiteReview         | src/pages/PublicSiteReview.tsx
/dashboard                                                     | ProtectedRoute       | DashboardLayout    | Dashboard                | src/pages/Dashboard.tsx
/clients                                                       | ProtectedRoute       | DashboardLayout    | Clients                  | src/pages/Clients.tsx
/clients/:clientId                                             | ProtectedRoute       | DashboardLayout    | ClientDetail             | src/pages/ClientDetail.tsx
/clients/:clientId/sites                                       | ProtectedRoute       | DashboardLayout    | Sites                    | src/pages/Sites.tsx
/clients/:clientId/sites/:siteId                               | ProtectedRoute       | DashboardLayout    | SiteDetail               | src/pages/SiteDetail.tsx
/clients/:cId/sites/:sId/subsections/:subId                    | ProtectedRoute       | DashboardLayout    | SubsectionDetail         | src/pages/SubsectionDetail.tsx
/clients/:cId/sites/:sId/subsections/:subId/inspections/:iId   | ProtectedRoute       | DashboardLayout    | InspectionDetail         | src/pages/InspectionDetail.tsx
/sites                                                         | ProtectedRoute       | DashboardLayout    | Sites                    | src/pages/Sites.tsx
/sites/:siteId                                                 | ProtectedRoute       | DashboardLayout    | SiteDetail               | src/pages/SiteDetail.tsx
/sites/:siteId/subsections/:subsectionId                       | ProtectedRoute       | DashboardLayout    | SubsectionDetail         | src/pages/SubsectionDetail.tsx
/sites/:sId/subsections/:subId/inspections/:iId                | ProtectedRoute       | DashboardLayout    | InspectionDetail         | src/pages/InspectionDetail.tsx
/inspections                                                   | ProtectedRoute       | DashboardLayout    | Inspections              | src/pages/Inspections.tsx
/inspection-templates                                          | ProtectedRoute       | DashboardLayout    | InspectionTemplates      | src/pages/InspectionTemplates.tsx
/inspection-templates/new                                      | ProtectedRoute       | DashboardLayout    | TemplateBuilderPage      | src/pages/TemplateBuilderPage.tsx
/inspection-templates/:templateId/edit                         | ProtectedRoute       | DashboardLayout    | TemplateBuilderPage      | src/pages/TemplateBuilderPage.tsx
/inspection-templates/validate                                 | ProtectedRoute       | DashboardLayout    | TemplateValidator        | src/pages/TemplateValidator.tsx
/users                                                         | ProtectedRoute       | DashboardLayout    | Users                    | src/pages/Users.tsx
/calendar                                                      | ProtectedRoute       | DashboardLayout    | Calendar                 | src/pages/Calendar.tsx
/settings                                                      | ProtectedRoute       | DashboardLayout    | Settings                 | src/pages/Settings.tsx
/site-assignments                                              | ProtectedRoute       | DashboardLayout    | SiteAssignments          | src/pages/SiteAssignments.tsx
/offline-review                                                | ProtectedRoute       | DashboardLayout    | OfflineReview            | src/pages/OfflineReview.tsx
/offline-sync-test                                             | ProtectedRoute       | DashboardLayout    | OfflineSyncTest          | src/pages/OfflineSyncTest.tsx
/validation-feedback                                           | ProtectedRoute       | DashboardLayout    | ValidationFeedback       | src/pages/ValidationFeedback.tsx
/feedback-management                                           | ProtectedRoute       | DashboardLayout    | FeedbackManagement       | src/pages/FeedbackManagement.tsx
/qr-codes                                                      | ProtectedRoute       | DashboardLayout    | QRCodes                  | src/pages/QRCodes.tsx
/portal-management                                             | ProtectedRoute       | DashboardLayout    | PortalManagement         | src/pages/PortalManagement.tsx
/development-skills                                            | ProtectedRoute       | DashboardLayout    | DevelopmentSkills        | src/pages/DevelopmentSkills.tsx
/pdf-template-tests                                            | ProtectedRoute       | DashboardLayout    | PDFTemplateTestDashboard | src/pages/PDFTemplateTestDashboard.tsx
/api-clients                                                   | ProtectedRoute       | DashboardLayout    | APIClients               | src/pages/APIClients.tsx
/profile                                                       | AuthOnlyRoute        | DashboardLayout    | MyProfile                | src/pages/MyProfile.tsx
/client-portal                                                 | ClientProtected      | ClientPortalLayout | ClientPortalDashboard    | src/pages/ClientPortalDashboard.tsx
/client-portal/sites                                           | ClientProtected      | ClientPortalLayout | ClientPortalSites        | src/pages/ClientPortalSites.tsx
/client-portal/sites/:siteId                                   | ClientProtected      | ClientPortalLayout | ClientPortalSiteDetail   | src/pages/ClientPortalSiteDetail.tsx
/client-portal/subsections/:subsectionId                       | ClientProtected      | ClientPortalLayout | ClientPortalSubsectionDetail | src/pages/ClientPortalSubsectionDetail.tsx
/client-portal/calendar                                        | ClientProtected      | ClientPortalLayout | ClientPortalCalendar     | src/pages/ClientPortalCalendar.tsx
/contractor                                                    | ContractorProtected  | ContractorPortalLayout | ContractorPortal     | src/pages/ContractorPortal.tsx
/contractor/sites/:siteId                                      | ContractorProtected  | None               | ContractorSiteDetail     | src/pages/ContractorSiteDetail.tsx
/contractor/subsections/:subsectionId                          | ContractorProtected  | None               | ContractorSubsectionDetail | src/pages/ContractorSubsectionDetail.tsx
/contractor/inspections/:inspectionId                          | ContractorProtected  | ContractorPortalLayout | InspectionDetail   | src/pages/InspectionDetail.tsx
```

**Redirect aliases** (routes that render the same component):
- `/issue-reports` → `FeedbackManagement`
- `/suggestions` → `FeedbackManagement`
- `/verification-management` → `FeedbackManagement`
- `/admin-client-preview` → `AdminClientPreview` (→ redirects to `PortalManagement`)
- `/admin-contractor-preview` → `AdminContractorPreview` (→ redirects to `PortalManagement`)
- `/client-access-simulator` → `ClientAccessSimulator` (→ redirects to `PortalManagement`)
- `/contractor-access-simulator` → `ContractorAccessSimulator` (→ redirects to `PortalManagement`)

---

## 5. Global Chrome

Components that appear on every authenticated admin page via `DashboardLayout`.

### 5.1 DashboardLayout Structure

```
┌─────────────────────────────────────────────────┐
│ SidebarProvider                                  │
│ ┌───────────────┬───────────────────────────────┐│
│ │ AppSidebar    │ Main Content Area              ││
│ │               │ ┌────────────────────────────┐ ││
│ │ [Logo]        │ │ Sticky Header              │ ││
│ │ [Company Name]│ │ [≡] "Electrical Compliance"│ ││
│ │               │ │              [🔍 Search]    │ ││
│ │ [Dashboard]   │ ├────────────────────────────┤ ││
│ │ [Calendar]    │ │                            │ ││
│ │ [Clients]     │ │ Scrollable Content         │ ││
│ │ [QR Codes]    │ │ (page component rendered)  │ ││
│ │ [Templates]   │ │                            │ ││
│ │ [Validation]  │ │                            │ ││
│ │ [Dev Skills]  │ │                            │ ││
│ │ [Platform]  * │ │                            │ ││
│ │ [Feedback]  * │ │                            │ ││
│ │ [Settings]  * │ │                            │ ││
│ │               │ │                            │ ││
│ │ ─────────────── │                            │ ││
│ │ [Avatar]      │ │                            │ ││
│ │ [Name/Email]  │ │                            │ ││
│ │ [My Profile]  │ │                            │ ││
│ │ [Logout]      │ │                            │ ││
│ └───────────────┴────────────────────────────────┘│
│ [Background Listeners: SessionWatcher,            │
│  NotificationListener, VerificationListener,      │
│  OfflineIndicator, HelpButton, DoubleSlashRedirect]│
└───────────────────────────────────────────────────┘
* = Admin-only items (gated by useUserRole() === 'Admin')
```

### 5.2 AppSidebar Menu Items

Defined in `AppSidebar.tsx` line 44-55:

| Title | URL | Icon | Admin Only |
|-------|-----|------|------------|
| Dashboard | `/dashboard` | `Home` | No |
| Calendar | `/calendar` | `CalendarDays` | No |
| Clients | `/clients` | `Users` | No |
| QR Codes | `/qr-codes` | `QrCode` | No |
| Inspection Templates | `/inspection-templates` | `FileText` | No |
| Validation Feedback | `/validation-feedback` | `MessageSquarePlus` | No |
| Development Skills | `/development-skills` | `BookOpen` | No |
| Platform Testing | `/offline-sync-test` | `Smartphone` | **Yes** |
| Feedback Management | `/feedback-management` | `AlertCircle` | **Yes** |
| Settings | `/settings` | `SettingsIcon` | **Yes** |

### 5.3 AppSidebar Header

- **Logo**: Fetched via `useQuery(['company-settings'])` → `settings.company_logo_url`. If present, renders `<img>` with `max-h-8`. If absent, renders `<Zap>` icon with gradient background.
- **Company Name**: `settings.company_name` or fallback "Compliance Pro"

### 5.4 AppSidebar Footer

- **Avatar**: `<Avatar>` with `profiles.avatar_url` or initials fallback
- **Name**: `profiles.full_name`
- **Email**: `profiles.email`
- **"My Profile" link**: Navigates to `/profile`
- **"Logout" button**: Calls `supabase.auth.signOut()` → toast "Logged out" → navigates to `/auth`

### 5.5 GlobalSearch (`Cmd+K` / `Ctrl+K`)

**Component**: `src/components/GlobalSearch.tsx` (367 lines)
**Hook**: `src/hooks/useGlobalSearch.ts`
**Trigger**: Click search button in header OR keyboard shortcut `Cmd+K` / `Ctrl+K`

**Searches across:**
- `clients` table: name, company_name
- `sites` table: name, address (with `clients(name)` join)
- `subsections` table: name, tenant_name (with `sites(name, client_id, clients(name))` join)
- `inspections` table: title, project_name (with `sites(name, client_id)` join)

**Filters available** (via `useSearchFilterOptions`):
- Client (dropdown)
- Site Type (Commercial/Industrial/Residential/Mall/Office)
- COC Status (Approved/Pending/Failed/Missing)
- Inspection Status (Scheduled/In Progress/Completed)
- Date Range (calendar picker)

**Result navigation**: Each result has a URL that navigates to the detail page for that entity.

### 5.6 Background Listeners

| Component | File | Purpose | Supabase Interaction |
|-----------|------|---------|---------------------|
| `SessionWatcher` | `SessionWatcher.tsx` | Auto-logout at configured time | Reads `settings.auto_logout_enabled`, `settings.auto_logout_time` |
| `NotificationListener` | `NotificationListener.tsx` | Realtime notification toasts | Subscribes to `notifications` table changes via Supabase Realtime |
| `VerificationListener` | `VerificationListener.tsx` | Pending fix verification alerts | Calls `get_pending_verifications` RPC periodically |
| `OfflineIndicator` | `OfflineIndicator.tsx` | Shows offline banner | Monitors `navigator.onLine` / `online`/`offline` events |
| `HelpButton` | `HelpButton.tsx` | Floating action button for feedback | Opens `IssueReportDialog` or `SuggestionDialog` |
| `DoubleSlashRedirect` | `DoubleSlashRedirect.tsx` | Fixes `//` in URLs | Monitors `window.location.pathname` |

---

## 6. Page-by-Page Specification

### 6.1 Dashboard (`/dashboard`)

**Component**: `src/pages/Dashboard.tsx` (610 lines)
**Purpose**: Admin overview of all operations and compliance metrics

#### Tables Read

| Table | Query | Columns Used |
|-------|-------|-------------|
| `clients` | `select("id", { count: "exact", head: true })` | count only |
| `sites` | `select("id", { count: "exact", head: true })` | count only |
| `subsections` | `select("id, coc_status, is_coc_required", { count: "exact" })` | id, coc_status, is_coc_required |
| `inspections` | `select("id, status", { count: "exact" })` | id, status |
| `snags` | `select("id, status", { count: "exact" })` | id, status |
| `activity_logs` | `select("*").order("created_at", desc).limit(5)` | all columns |
| `calendar_events` | `select("*").gte("start_date", today).order("start_date").limit(5)` | all columns |
| `snags` (high-risk) | `select("id, title, risk_level, status, created_at, updated_at, subsection_id, subsections(name, site_id, sites(name, client_id))").in("risk_level", ["High", "Critical"]).limit(10)` | nested join |
| `coc_validations` | `select("subsection_id, status")` | subsection_id, status |

#### KPI Cards — Row 1 (Primary)

| Card | Value Source | Subtitle | Icon |
|------|-------------|----------|------|
| Total Sites | `stats.totalSites` | "Under management" | `Building2` (blue) |
| Total Subsections | `stats.totalSubsections` | "Across all sites" | `Layers` (purple) |
| Total Clients | `stats.totalClients` | "Active clients" | `Users` (green) |
| Active Inspections | `stats.activeInspections` (status "In Progress" or "Scheduled") | "In progress or scheduled" | `Activity` (orange) |

#### KPI Cards — Row 2 (Secondary)

| Card | Value Source | Subtitle | Icon |
|------|-------------|----------|------|
| Inspections Completed | `stats.completedInspections` | "of {total} total inspections" | `ClipboardCheck` (green) |
| COC Compliance | `cocComplianceRate`% (cocCompliantCount / cocRequiredCount × 100) | Progress bar + "{n} of {m} compliant" | `Shield` (blue) |
| Open Snags | `stats.openSnags` (status 'Open' or 'In Progress') | "{closed} resolved of {total} total" | `AlertCircle` (red) |
| Snag Resolution | `snagResolutionRate`% (closedSnags / totalSnags × 100) | Progress bar + "Resolution rate" | `CheckCircle` (green) |

#### COC Validation Summary Widget

Displays 4 metric boxes:
- **Total Validations** (`stats.totalCocValidations`)
- **Passed** (`stats.passedValidations`) — status in ['Pass', 'Passed', 'Valid', 'Approved']
- **Failed** (`stats.failedValidations`) — status in ['Fail', 'Failed']
- **Pending** (`stats.pendingValidations`) — status in ['Pending', 'In Review', null]
- **Pass Rate Progress Bar**: Stacked bar showing pass (green) / fail (red) / pending (yellow) proportions

#### Action Buttons (Header)

| Button | Text | Variant | Navigates To |
|--------|------|---------|-------------|
| Clients | "Clients" | default | `/clients` |
| Sites | "Sites" | outline | `/sites` |
| QR Codes | "QR Codes" | outline | `/qr-codes` |

#### Widgets

- **High-Risk Snags Tracker**: Table of up to 10 snags with risk_level "High" or "Critical". Each row shows title, risk badge, status badge, subsection name, site name, days since logged, days since cleared. Click navigates to subsection detail.
- **Upcoming Schedule**: List of next 5 `calendar_events`. Shows title, site_name, start_date, status badge.
- **Recent Activity**: Last 5 `activity_logs`. Shows user_email, action, details, relative time.
- **VerificationDashboardWidget**: Shows pending fix verifications count and links.
- **RecentAssignmentsWidget**: Shows recent site assignments from `user_sites_history`.

---

### 6.2 Clients (`/clients`)

**Component**: `src/pages/Clients.tsx`
**Purpose**: CRUD management for client organizations

#### Tables Read/Written

| Table | Operation | Details |
|-------|-----------|---------|
| `clients` | SELECT | `select("*, sites(id)")` — includes site count via join |
| `clients` | INSERT | Create new client with name, company_name, contact_person, email, phone, primary_contact_email, logo_url |
| `clients` | UPDATE | Edit existing client fields |
| `clients` | DELETE | Delete client by ID |
| `client-logos` bucket | UPLOAD | Logo upload in create/edit dialog |
| `client-logos` bucket | DELETE | Logo deletion via "Delete Logo" button |

#### UI Elements

- **Page header**: "Clients" title + "Manage your client organizations" subtitle
- **Card grid**: One card per client + "Add Client" card (dashed border, `+` icon)
- **Client card contents**: Logo image (from `clients.logo_url`) or `Building2` icon, client name (bold), site count badge ("{n} Sites"), three-dot dropdown menu
- **Card click**: Navigates to `/clients/{clientId}/sites`
- **Dropdown menu items**: "Edit Client" (opens edit dialog), "Delete Client" (confirmation dialog)

#### Create Client Dialog

**Trigger**: Click "Add Client" card
**Validation**: `clientSchema` from `src/lib/validation-schemas.ts` (Zod)
**Fields:**

| Field | Type | Required | Supabase Column |
|-------|------|----------|----------------|
| Client Name | text | **Yes** | `name` |
| Company Name | text | No | `company_name` |
| Contact Person | text | No | `contact_person` |
| Primary Contact Email | email | No | `primary_contact_email` |
| Email | email | No | `email` |
| Phone | text | No | `phone` |
| Logo | file upload | No | Uploaded to `client-logos` bucket → `logo_url` |

#### Edit Client Dialog

Same fields as Create, pre-populated. Additional feature:
- **"Delete Logo" button**: Appears if `logo_url` is set. Opens `AlertDialog` confirmation → removes file from `client-logos` bucket → sets `logo_url = null`

---

### 6.3 Client Detail (`/clients/:clientId`)

**Component**: `src/pages/ClientDetail.tsx`
**Purpose**: View client info, manage logo, view nested site/subsection/inspection structure

#### Tables Read

| Table | Query |
|-------|-------|
| `clients` | `select("*, sites(*, subsections(*, subsection_documents(*)), inspections(*))")` |

#### Layout

- **Breadcrumbs**: Home > Clients > {Client Name}
- **Header**: Client logo (large) + name + "Back to Clients" button
- **3-column grid**:
  1. **Contact Info card**: contact_person, email, phone, primary_contact_email, company_name
  2. **Client Logo card**: Current logo or "No logo uploaded". "Upload Logo" button (uses `useCamera` hook). Delete button on hover. **Legacy detection**: If `logo_url` contains `firebasestorage.googleapis.com` → shows warning Alert with "Clear & Upload New" button
  3. **Overview card**: Total sites count, total subsections count, total inspections count

#### Sites & Structure Section

- Expandable cards per site
- Each site card: site name header (click navigates to site detail), tabs:
  - **Subsections tab**: Table of subsections with name, category, COC status badge, compliance badge
  - **Inspections tab**: Table of inspections with title, date, status badge

---

### 6.4 Sites (`/sites` or `/clients/:clientId/sites`)

**Component**: `src/pages/Sites.tsx`
**Purpose**: List and create sites

#### Tables Read/Written

| Table | Operation | Details |
|-------|-----------|---------|
| `sites` | SELECT | `select("*, clients(name)")` optionally filtered by `client_id` |
| `sites` | INSERT | Create new site |
| `sites` | DELETE | Delete site |
| `clients` | SELECT | For client dropdown in create dialog |
| `site-images` bucket | READ | Signed URLs for site images |

#### UI Elements

- **Header**: "Sites" title + "Add Site" button (disabled if no clients exist, tooltip "Create a client first")
- **Card grid**: Site cards with image (signed URL), name, client name, type badge, address
- **Card click**: Navigates to `/clients/{site.clients.id}/sites/{site.id}` (resolves client from join)
- **Card dropdown**: "Delete Site" with confirmation

#### Create Site Dialog

| Field | Type | Required | Supabase Column |
|-------|------|----------|----------------|
| Client | Select dropdown | **Yes** | `client_id` (pre-filled if `clientId` in URL) |
| Site Name | text | **Yes** | `name` |
| Site Type | Select (Commercial/Industrial/Residential/Mall/Office) | No | `site_type` |
| Address | text | No | `address` |

---

### 6.5 Site Detail (`/clients/:clientId/sites/:siteId`)

**Component**: `src/pages/SiteDetail.tsx` (744 lines)
**Purpose**: Central hub for all site management — the most complex page

#### Tables Read

| Table | Query |
|-------|-------|
| `sites` | `select("*, clients(*)")` with `.eq("id", siteId)` |
| `subsections` | `select("*").eq("site_id", siteId)` |
| `snags` | `select("id, subsection_id, status, title").in("subsection_id", subsectionIds)` |
| `inspections` | `select("id, subsection_id, inspection_date, json_data").eq("site_id", siteId)` |
| `site_documents` | `select("*").eq("site_id", siteId)` |
| `subsection_documents` | `select("*, document_categories(name)").in("subsection_id", subsectionIds)` |
| `document_categories` | `select("*").in("subsection_id", subsectionIds)` |
| `inspection_templates` | `select("id, name, category")` |
| `settings` | `select("company_logo_url")` |

#### Tab Structure (9 Tabs)

| # | Tab Name | Icon | Component | Key Features |
|---|----------|------|-----------|-------------|
| 1 | Overview | `Building` | `SiteOverview` | Site KPIs, image, address, supply authority. "Edit" opens `SiteEditDialog` |
| 2 | Schematic | `Workflow` | `SchematicDiagram` | Visual block diagram of electrical distribution. Drag-and-drop blocks, connections, PDF upload for floor plans, link blocks to subsections, view tenant meter/CT/breaker photos |
| 3 | Asset Verification | `ShieldCheck` | `AssetVerification` | Excel import, comparison table, meter register, PDF report |
| 4 | Compliance | `Shield` | `ComplianceDashboard` | COC compliance stats, pie/line charts, validation log, inline violation overrides, re-validation |
| 5 | Documents | `FileText` | `SiteDocuments` | Site + subsection documents by category. Upload, preview, download, delete. Category CRUD. Two view modes: by-site-category and unified-all |
| 6 | Inspections | `ClipboardCheck` | `SiteLevelInspections` | All inspections for this site. Create inspection dialog (with template selection) |
| 7 | Subsections | `Layers` | `SubsectionList` | Filterable table/grid of subsections. Filters: search, COC status, compliance, snags, metering, category. Group by: none/category/status/compliance. Delete subsection |
| 8 | QR Codes | `QrCode` | `QRAnalytics` | Generate QR for each subsection, download individual, bulk ZIP download |
| 9 | Reports | `FileBarChart` | `SiteReports` | Saved reports list, search, preview, download, delete. Generate: Site Summary, Bulk Inspection, Final Report. `ReportSettingsDialog` for section customization |

#### SiteEditDialog Fields

| Field | Column |
|-------|--------|
| Site Name | `name` |
| Address | `address` |
| Site Type | `site_type` |
| Supply Authority | `supply_authority` |
| Nominated Max Demand | `nominated_max_demand` |
| Consultant Name | `consultant_name` |
| Consultant Company | `consultant_company` |
| Consultant Contact | `consultant_contact` |
| Site Image | `site_image_url` (upload to `site-images` bucket) |

---

### 6.6 Subsection Detail (`/.../subsections/:subsectionId`)

**Component**: `src/pages/SubsectionDetail.tsx` (3900 lines — largest file)
**Purpose**: Manage a single tenant/area: COC compliance, documents, inspections, floor plan

#### Tables Read/Written

| Table | Operations |
|-------|-----------|
| `subsections` | SELECT, UPDATE |
| `sites` | SELECT (for breadcrumbs and context) |
| `clients` | SELECT (for breadcrumbs) |
| `subsection_documents` | SELECT, INSERT, DELETE |
| `document_categories` | SELECT, INSERT, DELETE |
| `coc_validations` | SELECT (realtime subscription) |
| `coc_extractions` | SELECT, INSERT, UPDATE |
| `snags` | SELECT, INSERT, UPDATE, DELETE |
| `inspections` | SELECT, INSERT, UPDATE, DELETE |
| `inspection_templates` | SELECT |
| `subsection_floor_plans` | SELECT |
| `floor_plan_pins` | SELECT |
| `settings` | SELECT (for company logo) |

**Realtime subscriptions**: `subsections`, `subsection_documents`, `coc_validations` tables (auto-refresh on changes)

#### Tab Structure (5 Tabs)

**Tab 1: Overview**
- **Tenant Info**: Name, category (with icon/color from `subsectionCategories.ts`)
- **COC Details card**: COC number, COC type (dropdown), issue date (calendar picker), status (badge). "Edit" button toggles inline editing per field
- **Metering Details card**: Meter serial number, CT ratio, metering status (dropdown). Inline editing
- **Compliance Alert**: If latest `coc_validations` entry has status in `FAILED_VALIDATION_STATUSES`, shows red alert with "View Violations" button. `InlineViolationOverrides` component allows overriding individual violations
- **QR Code section**: Generate QR button → calls `generateAndUploadQRCode()` → stores URL in `subsections.qr_code_url` and PNG in `inspection-photos` bucket

**Tab 2: Inspections**
- **List**: All inspections where `subsection_id = subsectionId` or `site_id = siteId`
- **"Create Inspection" button**: Opens dialog with:
  - Template selection dropdown (from `inspection_templates`)
  - Inspection date picker
  - Creates inspection record + links to template
- **Per-inspection actions**: Status dropdown (Scheduled/In Progress/Completed), Delete (with confirmation), "View" navigates to InspectionDetail, "Generate Report" renders and saves PDF
- **Report generation**: Uses `ComprehensiveInspectionReport` React component → `html2canvas` at 2x scale → `jsPDF` assembly → upload to `documents` bucket → insert into `subsection_documents`

**Tab 3: Floor Plan**
- **`InteractiveFloorPlan` component**: Upload floor plan image → place pins (snag/note/electrical types) → pin CRUD with photos, descriptions, priority, assigned contractor
- **Pin types**: `snag`, `note`, `electrical`, `fire`, `hvac`

**Tab 4: Documents**
- **Default categories created on first visit**: "Certificates of Compliance", "Electrical Schematics", "Test Results", "Inspection Reports", "General Documents"
- **Upload flow**: Select category → choose file → upload to `documents` bucket → insert into `subsection_documents`
- **COC Pipeline** (triggered by document type detection):
  1. Upload COC document → inserts into `subsection_documents`
  2. **"Extract" button** → calls `extract-coc` Edge Function (sends document to Google Gemini AI for OCR/extraction) → stores extracted data in `coc_extractions` table
  3. **"Review" button** → opens `COCPreviewDialog` showing extracted data fields for human review/correction
  4. **"Approve & Verify" button** (in `COCPreviewApproval`) → calls `validate-coc` Edge Function → stores validation result in `coc_validations` → updates `subsections.coc_status` via trigger
- **Document preview**: `DocumentPreviewDialog` renders PDFs, images, DOCX inline
- **Document actions**: Preview, Download (`downloadFile()` from `fileDownload.ts`), Delete

**Tab 5: COC & Metering** (merged view)
- COC validation history table
- Extraction data display
- Metering details

#### Subsection Edit Dialog

| Field | Column | Type |
|-------|--------|------|
| Name | `name` | text |
| Tenant Name | `tenant_name` | text |
| Category | `category` | select (from `SUBSECTION_CATEGORIES`) |
| COC Required | `is_coc_required` | checkbox |
| COC Number | `coc_number` | text |
| COC Status | `coc_status` | select |
| Meter Serial | `meter_serial_number` | text |
| CT Ratio | `ct_ratio` | text |
| Metering Status | `metering_status` | select |

---

### 6.7 Inspection Detail (`/.../inspections/:inspectionId`)

**Component**: `src/pages/InspectionDetail.tsx` (2850 lines)
**Purpose**: Fill out template-driven inspection form, capture photos, manage tenants/snags/signatures, generate report

#### Tables Read/Written

| Table | Operations |
|-------|-----------|
| `inspections` | SELECT, UPDATE (json_data JSONB) |
| `inspection_templates` | SELECT (for form structure) |
| `sites` | SELECT |
| `subsections` | SELECT |
| `inspection_signatures` | SELECT, INSERT, DELETE |
| `snags` | SELECT, INSERT, UPDATE, DELETE |
| `settings` | SELECT (company logo for report) |

#### Tab Structure

**Tab 1: General**
- Inspector name, inspection date, status dropdown, project name, shop number/name
- Client rep, consultant, contractor, testing party fields
- Quality rating (1-5 star rating)

**Tab 2: Template Sections** (dynamic)
- Rendered from `inspection_templates.sections` JSONB array
- Each section has items with types: `text`, `select`, `checkbox`, `photo`, `number`
- Photo items: "Capture" button → `useImageUpload` hook → uploads to `inspection-photos` bucket → stores public URL in `inspections.json_data[sectionKey][itemKey].photos[]`
- Image galleries: Multiple photos per item, with `FullscreenImageViewer`
- Status per item: Pass/Fail/N-A/Pending

**Tab 3: Tenants**
- Add/edit tenant cards
- Each tenant has: Shop Number, Shop Name, Breaker Size, Breaker Image (photo capture), CT Size & Ratio, CT Ratio Image, Control Status 48V, Meter Serial Number, Meter Image
- All tenant data stored in `inspections.json_data.tenants[]` array
- Photo capture: `useImageUpload` → `inspection-photos` bucket → URL in json_data
- Image naming: `generateTenantImagePath()` from `imageNaming.ts`

**Tab 4: Snags**
- Create snag: title, description, risk_level (Low/Medium/High/Critical), photo
- Snag table: title, risk level badge, status badge, photo thumbnail
- Status updates: Open → In Progress → Rectified → Closed
- Stored in `snags` table with `inspection_id` and `subsection_id`

**Tab 5: Signatures**
- `InspectionSignatures` component
- Add signature: `SignatureCapture` component (canvas-based drawing)
- Signer types: Inspector, Client, Contractor, Witness
- Signer fields: name, email, type
- Signature data stored as base64 data URL in `inspection_signatures.signature_data`
- Optional upload to storage as PNG → `inspection_signatures.signature_url`

#### Save Behavior

- "Save" button: Updates `inspections` row with all form data serialized into `json_data` JSONB column
- Auto-save: Debounced save on field changes (inspection detail fields)
- Offline: `useOfflineInspectionDetail` hook caches in IndexedDB, queues mutations

#### Report Generation

- "Generate Report" button
- Renders `ComprehensiveInspectionReport` React component off-screen
- `html2canvas` captures at 2x devicePixelRatio
- `jsPDF` assembles pages from captured canvases
- Upload to `documents` bucket
- Insert record into `subsection_documents` table

---

### 6.8 Inspection Templates (`/inspection-templates`)

**Component**: `src/pages/InspectionTemplates.tsx`
**Purpose**: Manage reusable inspection form templates

#### Tables Read/Written

| Table | Operations |
|-------|-----------|
| `inspection_templates` | SELECT, INSERT (duplicate), DELETE |

#### UI Elements

- **Header**: "Inspection Templates" + "Validate Templates" button + "Create Template" button
- **Card grid**: One card per template with name, category icon/badge, section count, page count
- **Card actions** (dropdown):
  - **Preview**: Opens `TemplatePreviewRenderer` dialog
  - **Edit**: Navigates to `/inspection-templates/{id}/edit`
  - **Duplicate**: Copies template with " (Copy)" suffix
  - **Delete**: Confirmation dialog → deletes from `inspection_templates`
  - **Export PDF**: `useUnifiedPdfGeneration` hook → pdfmake → download
  - **Import PDF**: `PDFTemplateUploader` component → parses PDF → creates template

#### Template Categories

| Category | Icon |
|----------|------|
| Electrical | `Zap` |
| Solar | `Sun` |
| Metering | `Gauge` |
| HVAC | `Thermometer` |
| Fire | `Flame` |
| General | `FileText` |

---

### 6.9 Template Builder (`/inspection-templates/new` or `/:templateId/edit`)

**Component**: `src/pages/TemplateBuilderPage.tsx` → `src/components/TemplateBuilder.tsx`
**Purpose**: Create/edit inspection template structure

**Features:**
- Add sections with name and description
- Add items to sections with configurable types:
  - `text`: Free text input
  - `select`: Dropdown with configurable options
  - `checkbox`: Boolean toggle
  - `photo`: Photo capture field
  - `number`: Numeric input
- Reorder sections and items via drag handles
- Set items as required
- Define select options per item
- Configure cover page fields
- Add tenant section template
- Save: INSERT or UPDATE `inspection_templates` row with `sections` as JSONB array

---

### 6.10 Template Validator (`/inspection-templates/validate`)

**Component**: `src/pages/TemplateValidator.tsx`
**Purpose**: Run database-level validation on all templates

**RPC call**: `validate_inspection_templates()` — checks:
- Null sections
- Sections not in array format
- Empty sections array
- Sections missing names
- Duplicate section IDs

**UI**: Table of validation issues with template name, issue type, description, and "Edit Template" link

---

### 6.11 Users (`/users`)

**Component**: `src/pages/Users.tsx` (1496 lines)
**Purpose**: User management, invitations, role assignment

#### Tables Read/Written

| Table | Operations |
|-------|-----------|
| `profiles` | SELECT (with `user_roles(role)`), UPDATE |
| `user_roles` | SELECT, UPDATE, INSERT |
| `user_clients` | SELECT, INSERT, DELETE |
| `user_sites` | SELECT, INSERT, DELETE |
| `pending_user_invites` | SELECT, INSERT, DELETE |
| `sites` | SELECT (for assignment dropdown) |
| `clients` | SELECT (for client assignment dropdown) |
| `profile-images` bucket | UPLOAD (avatar) |

#### Edge Functions Used

| Function | Purpose | JWT |
|----------|---------|-----|
| `invite-user` | Send invitation email with temporary credentials | Required |
| `delete-user` | Delete user from auth.users and cascade | Required |
| `send-password-reset` | Send branded password reset email | Required |

#### UI Sections

**1. Invite User Dialog**

| Field | Type | Required |
|-------|------|----------|
| Email | email | **Yes** |
| Full Name | text | No |
| Role | select (Admin/User/Contractor/Client) | **Yes** (default: User) |
| Temporary Password | text | No (auto-generated if empty) |
| Client Assignment | select | Only shown if role=Client |
| Site Assignments | multi-select checkboxes | Only shown if role=Contractor |

**2. Pending Invites Table**
- Columns: Email, Full Name, Invited At, Actions
- Actions: "Resend Invite" (calls `invite-user` again), "Delete" (removes from `pending_user_invites`)

**3. Active Users Table**
- Columns: Avatar, Name, Email, Role (badge), Status (badge), Actions (dropdown)
- **Dropdown actions**:
  - **Edit Profile**: Opens dialog with profile fields (full_name, phone, job_title, department, company, address, city, country, postal_code, bio) + avatar upload
  - **Change Role**: Select new role → UPDATE `user_roles.role`
  - **Reset Password**: Calls `send-password-reset` Edge Function
  - **Edit Site Assignments**: Multi-select dialog for `user_sites` associations
  - **View RLS Policies**: Opens `UserRLSPolicies` component → calls `get_rls_policies_for_role` RPC → displays applicable RLS policies
  - **Delete User**: Confirmation → calls `delete-user` Edge Function

#### User Roles (Enum `app_role`)

| Role | Dashboard Access | Portal Access | Can Manage Users | Can See Settings |
|------|-----------------|---------------|-----------------|-----------------|
| Admin | `/dashboard` | Can preview all portals | Yes | Yes |
| User | `/dashboard` | No | No | No |
| Client | Redirected to `/client-portal` | `/client-portal/*` | No | No |
| Contractor | Redirected to `/contractor` | `/contractor/*` | No | No |

---

### 6.12 Calendar (`/calendar`)

**Component**: `src/pages/Calendar.tsx`
**Purpose**: Annual calendar view with event management

#### Tables Read/Written

| Table | Operations |
|-------|-----------|
| `calendar_events` | SELECT, INSERT, UPDATE, DELETE |

#### UI Elements

- **Header**: Year selector, "Export PDF" button, "Add New Event" button
- **12-month grid** (4 columns × 3 rows): Each month shows event bars color-coded by site name (consistent hash-based coloring)
- **Schedule table**: Below calendar grid. Columns: Title, Site, Start Date, End Date, Status, Priority, Actions

#### Create/Edit Event Dialog

| Field | Column | Type |
|-------|--------|------|
| Title | `title` | text (required) |
| Site Name | `site_name` | text (required) |
| Start Date | `start_date` | date picker (required) |
| End Date | `end_date` | date picker |
| Status | `status` | select (Scheduled/In Progress/Completed/Cancelled) |
| Priority | `priority` | select (Low/Medium/High/Critical) |
| Event Type | `event_type` | text |

#### Export PDF

Button: "Export PDF" → `useUnifiedPdfGeneration` hook → pdfmake calendar report → downloads as PDF

---

### 6.13 Settings (`/settings`)

**Component**: `src/pages/Settings.tsx` (349 lines)
**Purpose**: Application configuration

#### Tab Structure (4 Tabs)

| Tab | Icon | Component | Content |
|-----|------|-----------|---------|
| General | `Settings2` | Inline | Branding, Integrations, Auto-Logout |
| Images | `ImageIcon` | `ImageCompressionManager` | Batch image compression |
| Users | `UserCog` | `Users` page (embedded) | Full user management |
| Portals | `Eye` | `PortalManagement` page (embedded) | Portal access management |

#### General Tab Details

**Branding Section:**
- Company Logo upload (see §2.1)
- Login Hero Image upload (see §2.2)
- Company Name input + "Update" button (see §2.3)
- QR Code Base URL input + "Update" button (see §2.7)

**Integrations Section:**
- Google Drive: "Link Google Drive" button → toast "Google Drive integration coming soon" (placeholder)

**Auto-Logout Section:**
- `AutoLogoutSettings` component
- Toggle: Enable/disable auto-logout
- Time picker: Set daily logout time (HH:MM format)
- Stored in `settings.auto_logout_enabled` and `settings.auto_logout_time`

#### Images Tab

- `ImageCompressionManager`: Lists images in `inspection-photos` bucket with file sizes
- "Compress" button per image → calls `compress-image` Edge Function
- "Batch Compress" button → calls `batch-compress-images` Edge Function
- Shows before/after file sizes

---

### 6.14 Portal Management (`/portal-management`)

**Component**: `src/pages/PortalManagement.tsx`
**Purpose**: Manage client/contractor portal access links and simulate portal views

#### Tabs

1. **Access Links** (`AccessLinkGenerator`):
   - Create access links for clients to review sites
   - Fields: Label, Link Type (site/subsection/portfolio), Client, Site, Subsection, Expiry Date
   - Table of existing links with access count, last accessed, deactivate/delete actions
   - Copy link to clipboard

2. **Client Simulator** (`ClientAccessSimulator`):
   - Select a client → preview their portal as if logged in as them
   - Opens `AdminClientPreview` with `?preview=clientId`

3. **Contractor Simulator** (`ContractorAccessSimulator`):
   - Select a contractor user → preview their portal
   - Opens `AdminContractorPreview` with `?preview=siteId`

4. **Site Assignments** (`SiteAssignments`):
   - Manage which contractors/users are assigned to which sites
   - `user_sites` table CRUD
   - History tracked in `user_sites_history` via `log_user_site_assignment()` trigger

---

### 6.15 QR Codes (`/qr-codes`)

**Component**: `src/pages/QRCodes.tsx`
**Purpose**: Global QR code database with search and download

#### Tables Read

| Table | Query |
|-------|-------|
| `subsections` | `select("*, sites(name, client_id, clients(name, company_name))").not("qr_code_url", "is", null)` |

#### UI Elements

- **Search bar**: Filters by client name, company name, site name, subsection name (case-insensitive)
- **Card grid**: Each card shows subsection name, site name, client info, QR code thumbnail
- **Card actions**:
  - "Download QR": Opens dialog with `LabeledQRCode` component (renders QR code with site/subsection labels) → download as PNG
  - "View Details": Navigates to subsection detail page

---

### 6.16 Feedback Management (`/feedback-management`)

**Component**: `src/pages/FeedbackManagement.tsx`
**Purpose**: Consolidated management of issue reports, suggestions, and fix verifications

#### Tabs

1. **Overview**: Stats cards showing tested vs untested issues, average confidence scores, pending verifications count
2. **Issues**: Embeds `IssueReports` page — table of `issue_reports` with status, severity, category, admin notes, fix description, verification status
3. **Suggestions**: Embeds `Suggestions` page — table of `suggestions` with title, description, status, votes
4. **Verifications**: Embeds `VerificationManagement` page — pending fix verifications awaiting user confirmation

---

### 6.17 My Profile (`/profile`)

**Component**: `src/pages/MyProfile.tsx`
**Purpose**: User's own profile editing

#### Tables Written

| Table | Operation |
|-------|-----------|
| `profiles` | UPDATE (own profile) |
| `profile-images` bucket | UPLOAD (avatar) |

#### Form Fields

| Field | Column | Type |
|-------|--------|------|
| Full Name | `full_name` | text |
| Phone | `phone` | text |
| Job Title | `job_title` | text |
| Department | `department` | text |
| Company | `company` | text |
| Address | `address` | text |
| City | `city` | text |
| Country | `country` | text |
| Postal Code | `postal_code` | text |
| Bio | `bio` | textarea |
| Avatar | `avatar_url` | file upload → `profile-images` bucket |

#### Password Change Section

- Current Password: not required (Supabase handles via session)
- New Password + Confirm Password
- Calls `supabase.auth.updateUser({ password: newPassword })`

---

### 6.18 Offline Review (`/offline-review`)

**Component**: `src/pages/OfflineReview.tsx`
**Purpose**: Paste code for AI review

- Textarea for pasting code
- "Submit for Review" button → calls `offline-review` Edge Function
- Edge Function sends code to AI (Anthropic) for analysis
- Results displayed in markdown

---

### 6.19 Development Skills (`/development-skills`)

**Component**: `src/pages/DevelopmentSkills.tsx`
**Purpose**: Reference library for SANS compliance, inspection procedures, documentation standards

- Categories: SANS Compliance, Inspection Procedures, Documentation Standards, Technical Guidelines, Safety Protocols
- Expandable accordion items with title, description, content
- Data source: Hardcoded `BASE_SKILLS` array or `development_skills` table (if exists)

---

### 6.20 Install (`/install`)

**Component**: `src/pages/Install.tsx`
**Purpose**: PWA installation instructions

- Detects if PWA is installable via `beforeinstallprompt` event
- Shows platform-specific instructions (iOS: "Add to Home Screen", Android: "Install" button)
- "Install" button triggers native install prompt

---

### 6.21-6.24 Client Portal Pages

**Protection**: `ClientProtectedRoute` — checks `user_roles.role === 'Client'`. Gets `client_id` from `user_clients` table via `useClientInfo()` hook. Admin users can preview with `?preview=clientId` param.

**Layout**: `ClientPortalLayout` — simplified sidebar with limited menu items (Dashboard, Sites, Calendar)

#### `/client-portal` (ClientPortalDashboard)

**Tables**: `sites`, `subsections`, `inspections`, `snags` (all filtered by client's sites)
**KPI Cards**: Sites count, Subsections count, Total Inspections, Upcoming Inspections, Open Snags
**Widgets**: `ComplianceHealthWidget` (compliance breakdown pie chart), `SiteOverviewCard` per site (site name, subsection count, compliance stats)

#### `/client-portal/sites` (ClientPortalSites)

Read-only site list filtered by client_id

#### `/client-portal/sites/:siteId` (ClientPortalSiteDetail)

Read-only version of SiteDetail with `readOnly={true}` props passed to child components

#### `/client-portal/subsections/:subsectionId` (ClientPortalSubsectionDetail)

Read-only subsection detail

#### `/client-portal/calendar` (ClientPortalCalendar)

Read-only calendar view

---

### 6.25-6.27 Contractor Portal Pages

**Protection**: `ContractorProtectedRoute` — checks `user_roles.role === 'Contractor'`. Gets assigned sites from `user_sites` table via `useContractorSites()` hook.

**Layout**: `ContractorPortalLayout`

#### `/contractor` (ContractorPortal)

**Component**: `src/pages/ContractorPortal.tsx` (292 lines)
**Tables**: `subsections` (filtered by assigned site), `inspections` (filtered by site), `subsection_documents`

**KPI Cards**: Total Subsections, Pending Inspections, Completed Inspections, Total Documents
**Content**: Search bar + subsection list with name, COC status, compliance status. Click navigates to `/contractor/subsections/{id}`

#### `/contractor/subsections/:subsectionId` (ContractorSubsectionDetail)

Subsection detail with limited write access (per RLS policies). Can view documents, create inspections, manage snags for assigned sites.

#### `/contractor/inspections/:inspectionId`

Full InspectionDetail page — contractors can create and update inspections for their assigned sites.

---

### 6.28-6.31 Public Pages (No Auth)

#### `/public/subsections/:subsectionId` (PublicSubsection)

**Component**: `src/pages/PublicSubsection.tsx`
**Purpose**: QR code landing page — scanned by anyone

**Tables** (public RLS): `subsections` (with `sites(name, clients(name, company_name))`), `subsection_documents`, `snags`, `coc_validations`

**Content**:
- Site/client info header
- Compliance status badge (uses `FAILED_VALIDATION_STATUSES` to determine pass/fail)
- Documents grouped by category (from `document_categories` + `subsection_documents`)
- Snag list with status badges
- COC validation summary

#### `/review/:token` (PublicSiteReview)

**Component**: `src/pages/PublicSiteReview.tsx`
**Purpose**: Magic-link site review for clients/stakeholders

**Flow**:
1. Validates token via `validate_access_link` RPC function
2. If invalid → shows "Invalid or expired link" error
3. If valid → shows `VisitorRegistrationGate`:
   - Collects: First Name, Last Name, Email, Phone, Role
   - Stores in `access_link_visitors` table
4. After registration → shows full site review with tabs (Overview, Subsections, Schematic, Compliance, Documents, Reports)
5. All content is read-only

#### `/review/:token/subsection/:subsectionId` (PublicSubsectionReview)

Subsection detail within review context. Uses same token validation.

#### `/portfolio/:token` (PublicClientPortfolio)

**Component**: `src/pages/PublicClientPortfolio.tsx`
**Purpose**: Client portfolio view showing all sites with compliance stats

**Flow**: Same as review (token validation → visitor gate → content). Shows all sites for the client with compliance summary, site cards, and navigation to individual site reviews.

---

## 7. Reports Inventory

### 7.1 Site Summary Report

| Property | Value |
|----------|-------|
| **Trigger location** | SiteDetail > Reports tab > `SiteSummaryReport` component |
| **Button text** | "Generate Site Summary" |
| **Engine** | pdfmake (via `siteSummaryRenderSpec.ts`) |
| **Content sources** | `sites`, `subsections`, `snags`, `inspections`, `coc_validations`, `settings` |
| **Content sections** | Cover page, site info, subsection inventory table, compliance summary, snag summary, inspection summary |
| **Storage** | `documents` bucket |
| **Database record** | `site_documents` table (category: "Site Summary Reports") |
| **Filename pattern** | `Site_Summary_{siteName}_{YYYY-MM-DD}.pdf` |
| **Branding** | Company logo via `pdfBranding.ts`, client logo if available |

### 7.2 Inspection Report (WYSIWYG)

| Property | Value |
|----------|-------|
| **Trigger location** | InspectionDetail > "Generate Report" button; SubsectionDetail > Inspections tab > per-inspection "Generate Report" |
| **Engine** | html2canvas (2x scale) + jsPDF (`wysiwygPdfGenerator.ts`) |
| **Content** | `ComprehensiveInspectionReport` React component: cover page, quality dashboard, template sections with photos, tenants table with images, snags with photos, signatures |
| **Storage** | `documents` bucket |
| **Database record** | `subsection_documents` table (category: "Inspection Reports") |
| **Filename** | `Inspection_Report_{title}_{date}.pdf` |

### 7.3 Inspection Report (pdfmake)

| Property | Value |
|----------|-------|
| **Trigger** | Alternate generation path via `pdfmakeInspectionReport.ts` |
| **Engine** | pdfmake |
| **Content** | Same data as WYSIWYG but with pdfmake-native styling |

### 7.4 Asset Verification Report

| Property | Value |
|----------|-------|
| **Trigger location** | SiteDetail > Asset Verification tab > "Generate Report" button |
| **Engine** | pdfmake (`assetVerificationReportGenerator.ts`) |
| **Content** | KPI dashboard (total assets, verified %, CT match %, breaker match %), comparison table, meter register |
| **Storage** | `documents` bucket |
| **Database record** | `site_documents` table (category: "Asset Verification Reports") |

### 7.5 Compliance Report

| Property | Value |
|----------|-------|
| **Trigger** | SiteDetail > Compliance tab > export button |
| **Engine** | pdfmake (`complianceReportGenerator.ts`) |
| **Content** | Compliance stats, COC validation results, violation overrides |

### 7.6 Floor Plan Report

| Property | Value |
|----------|-------|
| **Trigger** | SubsectionDetail > Floor Plan tab > export |
| **Engine** | pdfmake (`floorPlanReportGenerator.ts`) |
| **Content** | Floor plan image with pin overlay, pin details table (number, type, status, priority, notes) |

### 7.7 Calendar Report

| Property | Value |
|----------|-------|
| **Trigger** | Calendar page > "Export PDF" button |
| **Engine** | pdfmake via `useUnifiedPdfGeneration` |
| **Content** | Year events summary, event table |

### 7.8 Template Export

| Property | Value |
|----------|-------|
| **Trigger** | InspectionTemplates > card dropdown > "Export PDF" |
| **Engine** | pdfmake via `useUnifiedPdfGeneration` |
| **Content** | Template structure, sections, items |

### 7.9 Bulk Inspection Reports

| Property | Value |
|----------|-------|
| **Trigger** | SiteDetail > Reports tab > `BulkInspectionReportGenerator` |
| **Purpose** | Generate reports for all inspections in a site at once |

### 7.10 Final Site Report

| Property | Value |
|----------|-------|
| **Trigger** | SiteDetail > Reports tab > `GenerateFinalReportButton` |
| **Purpose** | Comprehensive multi-section report combining all site data |
| **Storage** | `documents` bucket |

### 7.11 DOCX Report

| Property | Value |
|----------|-------|
| **Trigger** | Via API or direct Edge Function call |
| **Engine** | `generate-docx-report` Edge Function (server-side DOCX generation) |

---

## 8. Supabase Integration Map

### 8.1 Storage Buckets

| Bucket | Public | Written By | Read By |
|--------|--------|-----------|---------|
| `company-logos` | Yes | Settings page (logo + hero uploads) | AppSidebar, Auth page, PDF generators |
| `client-logos` | Yes | Clients page, ClientDetail page | Client cards, PDF branding |
| `inspection-photos` | Yes | InspectionDetail (photos, QR PNGs), qrCodeGenerator, SubsectionDetail (QR) | SchematicDiagram (tenant photos), inspection reports, QR download, ImageCompressionManager |
| `site-images` | Yes | SiteEditDialog | Sites card grid (via signed URLs), SiteOverview |
| `profile-images` | Yes | MyProfile, Users page | AppSidebar footer, profile displays |
| `documents` | Yes | SubsectionDetail (doc upload), report generators (PDF save) | Document preview/download throughout app |
| `issue-screenshots` | Yes | IssueReportDialog | FeedbackManagement issue display |
| `suggestion-screenshots` | Yes | SuggestionDialog | FeedbackManagement suggestion display |
| `coc-photos` | Yes | COC compliance photo capture | COC compliance display |

### 8.2 Edge Functions (16 total)

| Function | JWT Required | Purpose | Secrets Used | Triggered From |
|----------|-------------|---------|-------------|---------------|
| `invite-user` | Yes | Send invitation email with temp credentials | `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Users page > Invite dialog |
| `delete-user` | Yes | Delete user from auth.users + cascade | `SUPABASE_SERVICE_ROLE_KEY` | Users page > Delete action |
| `send-password-reset` | Yes | Send branded password reset email | `RESEND_API_KEY` | Auth page > Forgot Password, Users page > Reset Password |
| `validate-coc` | Yes | Validate COC document against SANS rules | `ABACUS_AI_API_KEY` or Gemini | SubsectionDetail > COC pipeline |
| `extract-coc` | No | OCR/extract data from COC PDF using AI | `ABACUS_AI_API_KEY` or Gemini | SubsectionDetail > Extract button |
| `send-email` | Yes | Generic email sending | `RESEND_API_KEY` | Various notification triggers |
| `offline-review` | No | AI code review | `ANTHROPIC_API_KEY` | OfflineReview page |
| `verify-fix` | Yes | Verify a fix was applied correctly | `LOVABLE_API_KEY` | VerificationManagement |
| `templates` | No | Template CRUD API | — | Template sync |
| `save-template` | No | Save template data | — | TemplateBuilder |
| `template-sync` | No | Sync templates between environments | `DOCBUILDER_SYNC_KEY` | Admin action |
| `fix-tenant-images` | Yes | Repair broken tenant image URLs | `SUPABASE_SERVICE_ROLE_KEY` | Admin action |
| `fix-inspection-photos` | No | Repair inspection photo URLs | `SUPABASE_SERVICE_ROLE_KEY` | Admin action |
| `api-reports` | No | REST API for external report access | — | External API clients |
| `generate-pdf` | No | Server-side PDF generation | `PDFSHIFT_API_KEY` | Report generation |
| `generate-pdf-browserless` | No | PDF via headless Chrome | `BROWSERLESS_API_KEY` | Report generation |
| `generate-pdf-pdfmake` | No | Server-side pdfmake | — | Report generation |
| `generate-pdf-google` | No | PDF via Google Docs API | `GOOGLE_SERVICE_ACCOUNT_JSON` | Report generation |
| `generate-inspection-pdf` | No | Inspection-specific PDF | — | Report generation |
| `generate-docx-report` | No | DOCX report generation | — | Report generation |
| `detect-schematic-regions` | No | AI-based schematic diagram region detection | — | SchematicDiagram |
| `compress-image` | Yes | Compress a single image | `SUPABASE_SERVICE_ROLE_KEY` | ImageCompressionManager |
| `batch-compress-images` | Yes | Compress multiple images | `SUPABASE_SERVICE_ROLE_KEY` | ImageCompressionManager |
| `oauth-token` | No | OAuth token exchange for API clients | — | API authentication |
| `qr-redirect` | No | QR code URL redirection | — | QR code scanning |

### 8.3 Database Functions (12 total)

| Function | Security | Purpose | Called By |
|----------|----------|---------|----------|
| `handle_new_user()` | DEFINER | Auto-create `profiles` + `user_roles` on signup | `auth.users` INSERT trigger |
| `has_role(_user_id, _role)` | DEFINER | Check if user has a specific role | RLS policies throughout |
| `get_user_client_id()` | DEFINER | Get client_id for current user | Client portal RLS policies |
| `contractor_has_site_access(_user_id, _site_id)` | DEFINER | Check contractor site assignment | Contractor RLS policies |
| `validate_access_link(token)` | DEFINER | Validate and track access link usage | PublicSiteReview, PublicClientPortfolio |
| `validate_api_token(token)` | DEFINER | Validate API access token | api-reports Edge Function |
| `validate_inspection_templates()` | DEFINER | Check template data integrity | TemplateValidator page |
| `get_rls_policies_for_role(role_name)` | DEFINER | Get applicable RLS policies for a role | UserRLSPolicies component |
| `get_pending_verifications(user_uuid)` | DEFINER | Get pending fix verifications | VerificationListener |
| `sync_coc_compliance_status()` | DEFINER | Auto-update `is_compliant` on COC changes | `subsections` UPDATE trigger |
| `cleanup_activity_logs()` | DEFINER | Keep only 20 most recent logs | `activity_logs` INSERT trigger |
| `log_user_site_assignment()` | DEFINER | Track site assignment changes | `user_sites` INSERT/DELETE trigger |
| `track_floor_plan_pin_changes()` | DEFINER | Track pin edit history | `floor_plan_pins` UPDATE trigger |
| `update_updated_at_column()` | DEFINER | Auto-update `updated_at` timestamps | Various table triggers |
| `cleanup_old_pending_invites()` | DEFINER | Delete invites older than 30 days | Periodic call |

### 8.4 Key Tables and Their Page Consumers

| Table | Pages That READ | Pages That WRITE |
|-------|----------------|-----------------|
| `clients` | Dashboard, Clients, ClientDetail, Sites, SiteDetail, GlobalSearch, QRCodes, ClientPortal | Clients (CRUD) |
| `sites` | Dashboard, Sites, SiteDetail, SubsectionDetail, InspectionDetail, ClientPortal, ContractorPortal | Sites (create/delete), SiteDetail (edit) |
| `subsections` | Dashboard, SiteDetail, SubsectionDetail, QRCodes, GlobalSearch, ClientPortal, ContractorPortal, PublicSubsection | SubsectionDetail (update fields), SiteDetail (delete) |
| `inspections` | Dashboard, SiteDetail, SubsectionDetail, InspectionDetail, Inspections, ClientPortal, ContractorPortal | SubsectionDetail (create), InspectionDetail (update json_data) |
| `snags` | Dashboard, SiteDetail, SubsectionDetail, InspectionDetail, ClientPortal | InspectionDetail (CRUD), SubsectionDetail |
| `inspection_templates` | SiteDetail, SubsectionDetail, InspectionDetail, InspectionTemplates | TemplateBuilder (CRUD), InspectionTemplates (duplicate/delete) |
| `settings` | Auth, AppSidebar, SiteDetail, SubsectionDetail, InspectionDetail, Settings, PDF generators, QR generator | Settings (update) |
| `profiles` | AppSidebar, Users, MyProfile, ProtectedRoute | Users (update), MyProfile (update) |
| `user_roles` | Auth (redirect), ProtectedRoute, AppSidebar, all portal routes | Users (update/insert) |
| `user_sites` | ContractorPortal, RLS policies | PortalManagement, Users |
| `user_clients` | ClientPortal (get_user_client_id), RLS policies | Users (client assignment) |
| `coc_validations` | Dashboard, SiteDetail, SubsectionDetail, ComplianceDashboard, PublicSubsection | SubsectionDetail (via Edge Function) |
| `coc_extractions` | SubsectionDetail | SubsectionDetail (via Edge Function) |
| `subsection_documents` | SiteDetail, SubsectionDetail, ContractorPortal | SubsectionDetail (upload/delete) |
| `site_documents` | SiteDetail | SiteDetail (via report generators) |
| `document_categories` | SiteDetail, SubsectionDetail | SubsectionDetail (create/delete) |
| `calendar_events` | Dashboard, Calendar, ClientPortalCalendar | Calendar (CRUD) |
| `activity_logs` | Dashboard | Auto-inserted on user actions |
| `notifications` | NotificationListener | Various (INSERT) |
| `issue_reports` | FeedbackManagement | IssueReportDialog (INSERT), FeedbackManagement (UPDATE) |
| `suggestions` | FeedbackManagement | SuggestionDialog (INSERT), FeedbackManagement (UPDATE) |
| `client_access_links` | PortalManagement | PortalManagement (CRUD) |
| `access_link_visitors` | PortalManagement | PublicSiteReview (INSERT on registration) |
| `inspection_signatures` | InspectionDetail | InspectionDetail (INSERT/DELETE) |
| `floor_plan_pins` | SubsectionDetail | SubsectionDetail (CRUD) |
| `subsection_floor_plans` | SubsectionDetail | SubsectionDetail (upload) |
| `site_assets` | AssetVerification | AssetVerification (bulk INSERT from Excel) |
| `pending_user_invites` | Users | Users (INSERT/DELETE) |
| `api_clients` | APIClients | APIClients (CRUD) |
| `api_access_tokens` | APIClients | OAuth token flow |
| `coc_validation_settings` | validate-coc Edge Function | Settings (if COC settings tab exists) |
| `coc_local_validations` | COC validation flow | COC validation flow |
| `pdf_report_templates` | PDFTemplateManager, reports | PDFTemplateManager |

---

## 9. Data Flow Diagrams

### 9.1 Authentication Flow

```
User lands on /auth
        │
        ├─── Has ?type=invite&access_token ──► handleInviteToken()
        │                                        ├─► setSession()
        │                                        └─► Show password setup form
        │
        ├─── Has ?type=recovery&token ──► handleRecoveryToken()
        │                                   ├─► verifyOtp()
        │                                   └─► Show password change form
        │
        ├─── Has active session ──► Check user_roles.role
        │                            ├─► Client → /client-portal
        │                            ├─► Contractor → /contractor
        │                            └─► Admin/User → /dashboard
        │
        └─── No session ──► Show login form
                              ├─► signInWithPassword()
                              │     └─► onAuthStateChange(SIGNED_IN)
                              │           └─► Check role → redirect
                              │
                              └─► signUp()
                                    └─► "Check email to verify"
```

### 9.2 Inspection Lifecycle

```
1. CREATE INSPECTION
   SiteDetail/SubsectionDetail → "Create Inspection" button
   → Select template from inspection_templates
   → Set inspection date
   → INSERT into inspections table (json_data = {})
   → Navigate to InspectionDetail

2. FILL FORM
   InspectionDetail → Template sections rendered dynamically
   → User fills text/select/checkbox/number/photo fields
   → Photo capture: useImageUpload → upload to inspection-photos bucket
   → All data stored in inspections.json_data (JSONB)
   → Save button: UPDATE inspections SET json_data = {...}

3. ADD TENANTS
   InspectionDetail → Tenants tab
   → Add tenant card: shopNumber, shopName, breakerSize, ctRatio, meterSerial
   → Capture photos: breakerImage, ctRatioImage, meterImage
   → Photos uploaded to inspection-photos bucket
   → Tenant array stored in json_data.tenants[]

4. MANAGE SNAGS
   InspectionDetail → Snags tab
   → Create snag: title, description, risk_level, photo
   → INSERT into snags table
   → Status updates: Open → In Progress → Rectified → Closed

5. CAPTURE SIGNATURES
   InspectionDetail → Signatures tab
   → SignatureCapture canvas component
   → Signer: name, email, type (Inspector/Client/Contractor/Witness)
   → INSERT into inspection_signatures (signature_data = base64)

6. GENERATE REPORT
   InspectionDetail → "Generate Report" button
   → Render ComprehensiveInspectionReport (React component)
   → html2canvas at 2x scale → canvas images
   → jsPDF assembles pages from canvases
   → Upload PDF to documents bucket
   → INSERT into subsection_documents (category: "Inspection Reports")
```

### 9.3 COC Validation Pipeline

```
1. UPLOAD COC DOCUMENT
   SubsectionDetail → Documents tab → Select "Certificates of Compliance" category
   → Choose PDF file → Upload to documents bucket
   → INSERT into subsection_documents

2. EXTRACT DATA (AI)
   SubsectionDetail → "Extract" button on COC document
   → POST to extract-coc Edge Function
   → Edge Function sends PDF to Google Gemini AI
   → AI extracts: certificate_type, registration_number, registered_person_name,
     installation_address, date_of_issue, phase_configuration, supply_voltage,
     rcd_rated_current, earth_loop_impedance, insulation_resistance, etc.
   → INSERT into coc_extractions table (extracted_data JSONB)

3. HUMAN REVIEW
   SubsectionDetail → "Review" button → COCPreviewDialog opens
   → Shows extracted fields in editable form
   → User can correct AI extraction errors
   → UPDATE coc_extractions with corrected data

4. VALIDATE (AI + Rules)
   SubsectionDetail → "Approve & Verify" button (COCPreviewApproval)
   → POST to validate-coc Edge Function
   → Edge Function applies validation rules:
     - SANS 10142-1 compliance checks
     - Earth continuity ≤ 5Ω (configurable via coc_validation_settings)
     - Insulation resistance ≥ 0.25MΩ
     - RCD trip time ≤ 40ms
     - Signature present
     - Certificate date not future-dated
     - Registration number valid
   → INSERT into coc_validations (status: Pass/Fail/Incomplete, violations JSONB)

5. STATUS UPDATE
   sync_coc_compliance_status() trigger fires on subsections UPDATE
   → Checks latest coc_validations status
   → Updates subsections.is_compliant accordingly
   → If coc_status in ['Approved', 'Valid', 'Pass'] AND no failed validations → compliant
   → Otherwise → not compliant
```

### 9.4 Offline Sync Flow

```
1. DETECT OFFLINE
   navigator.onLine === false OR online/offline events
   → OfflineIndicator shows banner

2. CACHE DATA (Proactive)
   useOfflineSubsections/useOfflineInspections hooks
   → On successful Supabase fetch → store in IndexedDB (wm_compliance_offline)
   → Stores: inspections, images (as Blobs), subsections, documents, floor plans

3. WORK OFFLINE
   User makes changes (edit subsection, update inspection, capture photos)
   → Changes applied to IndexedDB immediately (optimistic UI)
   → Mutation queued in offline_mutation_queue (localStorage)
   → Queue entry: { type, table, data, timestamp }

4. COME ONLINE
   online event fires → useOfflineSync hook activates
   → Process queue sequentially:
     a. For each mutation: POST to Supabase
     b. If success: remove from queue, mark as synced in IndexedDB
     c. If conflict: attempt merge or flag for manual resolution
   → Upload queued photos from IndexedDB Blobs to storage bucket
   → Clear synced data from IndexedDB

5. INDEXEDDB STORES
   Database: wm_compliance_offline (version 3)
   Object stores:
   - inspections: { id, title, status, site_id, synced, ... }
   - images: { id, inspection_id, blob, file_name, synced }
   - subsections: { id, name, site_id, coc_status, synced, ... }
   - documents: { id, subsection_id, file_name, blob, synced }
   - floorPlans: { id, subsection_id, blob, synced }
   - floorPlanAnnotations: { id, floor_plan_id, x, y, type, synced }
```

### 9.5 Document Upload/Preview/Download Flow

```
UPLOAD:
  User selects file → Upload to documents bucket
  → Path: {subsectionId}/{categoryId}/{timestamp}_{filename}
  → Get public URL from bucket
  → INSERT into subsection_documents (file_name, file_url, subsection_id, category_id)

PREVIEW:
  User clicks "Preview" → DocumentPreviewDialog opens
  → Detects file type by extension:
    - PDF: renders with react-pdf (pdfjs-dist worker)
    - Images (jpg/png/gif/webp): renders with <img> tag
    - DOCX: renders with docx-preview library
    - Other: shows download link

DOWNLOAD:
  User clicks "Download" → downloadFile(url, filename) from fileDownload.ts
  → fetch(url) → blob → createObjectURL → <a download> click → revoke URL
```

### 9.6 QR Code Lifecycle

```
1. GENERATE
   SubsectionDetail → "Generate QR Code" button
   → generateAndUploadQRCode() from qrCodeGenerator.ts
   → Fetch settings.qr_base_url (default: https://wm-compliance.lovable.app)
   → Construct URL: {base_url}/public/subsections/{subsectionId}
   → Generate QR code on canvas (500x500 with padding)
   → Add text labels: site name, subsection name
   → Optional: overlay company logo at 30% size
   → Convert canvas to PNG blob
   → Upload PNG to inspection-photos bucket
   → Get public URL → UPDATE subsections.qr_code_url

2. DISPLAY
   QRCodes page: shows all subsections with qr_code_url IS NOT NULL
   SiteDetail > QR Analytics tab: shows QR codes for all subsections
   SubsectionDetail > Overview tab: shows QR code image

3. SCAN
   User scans QR code with phone camera
   → Opens URL: {base_url}/public/subsections/{subsectionId}
   → PublicSubsection page loads (no auth required)
   → Shows subsection compliance info, documents, snags
```

---

## 10. Compliance Rules

### 10.1 Subsection Compliance Determination

A subsection's `is_compliant` field is determined by the `sync_coc_compliance_status()` database trigger, which fires on INSERT/UPDATE of the `subsections` table.

**Logic (from the trigger function):**

```
IF coc_is_required = false:
  → is_compliant = true (always)

IF coc_is_required = true:
  1. Check latest coc_validations entry for this subsection
     IF latest validation status IN ('Fail', 'Failed', 'Incomplete'):
       → is_compliant = false

  2. Check coc_status field
     IF coc_status IN ('Approved', 'Valid', 'Pass'):
       → is_compliant = true
     ELSE:
       → is_compliant = false
```

### 10.2 Client-Side Compliance Calculations

File: `src/lib/complianceCalculations.ts` (single source of truth)

**Constants:**
- `VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass']`
- `FAILED_VALIDATION_STATUSES = ['Fail', 'Failed', 'Incomplete']`

**Functions:**
- `hasValidCocStatus(status)`: Returns true if status is in VALID_COC_STATUSES
- `isSubsectionCocCompliant(subsection, failedSet)`: Returns true if not required, or required AND valid status AND not in failed set
- `calculateCocComplianceStats(subsections, failedSet)`: Returns aggregate stats (total, required, approved, metering installed, rates)
- `fetchFailedValidationsBySubsection(ids)`: Queries `coc_validations`, gets most recent per subsection, returns Set of IDs with failed status

### 10.3 Compliance Rate Calculations

**COC Compliance Rate** (shown on Dashboard and SiteOverview):
```
rate = (cocApprovedCount / cocRequiredCount) × 100
```
Where `cocApprovedCount` = subsections where `is_coc_required=true` AND `coc_status` in VALID_COC_STATUSES AND no failed validation.

**Metering Compliance Rate**:
```
rate = (meteringInstalledCount / cocRequiredCount) × 100
```
Where `meteringInstalledCount` = subsections where `metering_status='Installed'` OR `meter_serial_number` is not null.

**Snag Resolution Rate** (Dashboard):
```
rate = (closedSnags / totalSnags) × 100
```
Where `closedSnags` = snags with status 'Closed' or 'Resolved'.

---

## 11. Offline Architecture

### 11.1 IndexedDB Schema

**Database name**: `wm_compliance_offline`
**Version**: 3

**Object stores** (from `src/lib/offlineDB.ts`):

| Store | Key | Columns | Purpose |
|-------|-----|---------|---------|
| `inspections` | `id` | id, title, description, status, inspection_date, site_id, inspector_id, created_at, synced | Cached inspection records |
| `images` | `id` | id, inspection_id, blob (Blob), file_name, created_at, synced | Offline-captured photos as binary blobs |
| `subsections` | `id` | id, name, tenant_name, category, site_id, coc_number, coc_type, coc_status, coc_issue_date, meter_serial_number, metering_status, ct_ratio, is_coc_required, updated_at, synced | Cached subsection data |
| `documents` | `id` | id, subsection_id, file_name, blob (Blob), category_id, uploaded_at, synced | Offline-uploaded documents |
| `floorPlans` | `id` | id, subsection_id, file_name, blob (Blob), uploaded_at, synced | Cached floor plan images |

Additional stores from `offlineDBExtensions.ts`, `offlineFloorPlanDB.ts`, `offlineInspectionDB.ts`:
- Floor plan annotations (pins)
- Inspection detail cache (full json_data)

### 11.2 Sync Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useOfflineSync` | `hooks/useOfflineSync.ts` | Core sync engine: detects online/offline, processes mutation queue |
| `useOfflineInspections` | `hooks/useOfflineInspections.ts` | Cache and retrieve inspections from IndexedDB |
| `useOfflineSubsections` | `hooks/useOfflineSubsections.ts` | Cache and retrieve subsections from IndexedDB |
| `useOfflinePhotos` | `hooks/useOfflinePhotos.ts` | Manage offline photo capture and sync |
| `useOfflineFloorPlanAnnotations` | `hooks/useOfflineFloorPlanAnnotations.ts` | Cache floor plan pins offline |
| `useOfflineInspectionDetail` | `hooks/useOfflineInspectionDetail.ts` | Cache full inspection detail (json_data) for offline editing |

### 11.3 Service Worker

**Registration**: `src/registerServiceWorker.ts`
**Strategy**: VitePWA plugin auto-registers in production
**Behavior**:
- Checks for updates every 60 seconds via `registration.update()`
- Listens for `controllerchange` event (new SW activated)
- Disabled in development mode

**Manifest**: `public/manifest.json` — defines PWA metadata (name, icons, theme color, start_url)

### 11.4 Workbox Caching

Configured via `vite-plugin-pwa` in `vite.config.ts`:
- Pre-caches built assets (JS, CSS, HTML)
- Runtime caching for API requests (network-first with fallback)
- Cache cleanup on new service worker activation

---

## Appendix A: File Size Reference

| File | Lines | Purpose |
|------|-------|---------|
| `SubsectionDetail.tsx` | 3,900 | Largest page — subsection management |
| `InspectionDetail.tsx` | 2,850 | Inspection form + report generation |
| `SchematicDiagram.tsx` | 2,108 | Visual electrical distribution diagram |
| `Users.tsx` | 1,496 | User management + invitations |
| `ComplianceDashboard.tsx` | 978 | COC compliance charts + validation log |
| `Auth.tsx` | 757 | Authentication (5 modes) |
| `SiteDetail.tsx` | 744 | Site hub (9 tabs) |
| `Dashboard.tsx` | 610 | Admin dashboard |
| `SubsectionList.tsx` | 574 | Filterable subsection list |
| `AssetVerification.tsx` | 555 | Excel import + verification |
| `offlineDB.ts` | 509 | IndexedDB wrapper |
| `SiteOverview.tsx` | 466 | Site KPI dashboard |
| `SiteReports.tsx` | 390 | Report management |
| `SiteDocuments.tsx` | 372 | Document management |
| `GlobalSearch.tsx` | 367 | Search across all entities |
| `pdfBranding.ts` | 367 | Logo loading + PDF branding |
| `Settings.tsx` | 349 | App configuration |
| `ContractorPortal.tsx` | 292 | Contractor dashboard |
| `AppSidebar.tsx` | 233 | Navigation sidebar |

---

*End of APPLICATION_SPEC.md*
