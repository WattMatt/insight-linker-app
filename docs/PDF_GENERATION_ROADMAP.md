# PDF Generation System - Template Gatekeeper Architecture

## Executive Summary

The PDF Template Manager is the **SINGLE SOURCE OF TRUTH** for all PDF report formatting. Every report generator MUST fetch its configuration from the template before generating any content.

### Core Principle
```
Template Manager → pdf_report_templates DB → usePDFTemplateGateway Hook → Report Generator → pdfEngine → PDF
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              PDF TEMPLATE MANAGER (Settings Page)                │
│                    THE GATEKEEPER                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  • Site Summary  • Inspection  • Floor Plan  • Assets    │  │
│  │  • Compliance    • COC Validation                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↓                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  WYSIWYG Editor + Full Preview                            │  │
│  │  • Edit cover page, sections, colors                      │  │
│  │  • Preview shows EXACTLY what PDF will look like          │  │
│  │  • Real data from reference site selection                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               ↓ SAVES TO
┌─────────────────────────────────────────────────────────────────┐
│                    pdf_report_templates TABLE                    │
│  ├── report_type: 'site_summary' | 'inspection' | ...           │
│  ├── customization: { coverTitle, accentColor, ... }            │
│  └── sections: [ { id, title, enabled, order, columns } ]       │
└─────────────────────────────────────────────────────────────────┘
                               ↓ FETCHED BY
┌─────────────────────────────────────────────────────────────────┐
│               usePDFTemplateGateway Hook                         │
│  src/hooks/usePDFTemplateGateway.ts                             │
│                                                                 │
│  Returns:                                                        │
│  • customization - Cover page, styling, branding                │
│  • enabledSections - Only sections marked enabled, sorted       │
│  • accentColors - { primary, light, dark } hex values           │
│  • isSectionEnabled(id) - Check if section should render        │
│  • getSectionTitle(id) - Get user-configured title              │
└─────────────────────────────────────────────────────────────────┘
                               ↓ USED BY
┌─────────────────────────────────────────────────────────────────┐
│                    REPORT GENERATORS                             │
│                                                                 │
│  SiteSummaryReport.tsx ─────────────────────────┐               │
│  inspectionReportGenerator.ts ──────────────────┤               │
│  floorPlanReportGenerator.ts ───────────────────┤→ pdfEngine.ts │
│  assetVerificationReportGenerator.ts ───────────┤               │
│  cocValidationPdfGenerator.ts ──────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                               ↓ PRODUCES
                         ┌──────────────┐
                         │  PDF OUTPUT  │
                         │  (Matches    │
                         │   Preview)   │
                         └──────────────┘
```

---

## ✅ Completed Infrastructure

| Component | File | Status |
|-----------|------|--------|
| pdfMake Configuration | `src/lib/pdfMakeConfig.ts` | ✅ Complete |
| pdfMake Utilities | `src/lib/pdfMakeUtils.ts` | ✅ Complete |
| Unified PDF Engine | `src/lib/pdfEngine.ts` | ✅ Complete |
| Document Design Standards | `src/lib/documentDesignStandards.ts` | ✅ Complete |
| Template Types | `src/components/pdf-editor/types.ts` | ✅ Complete |
| WYSIWYG Editor | `src/components/settings/PDFWYSIWYGEditor.tsx` | ✅ Complete |
| Template Manager | `src/components/settings/PDFTemplateManager.tsx` | ✅ Complete |
| **Template Gateway Hook** | `src/hooks/usePDFTemplateGateway.ts` | ✅ Complete |
| **Full Preview Components** | `src/components/settings/preview-renderers/` | ✅ Complete |
| Database Table | `pdf_report_templates` | ✅ Complete |

### Report Generator Integration Status

| Report Type | File(s) | Uses Templates | Status |
|-------------|---------|----------------|--------|
| **Site Summary** | `SiteSummaryReport.tsx` | ✅ Yes | ✅ Integrated |
| **COC Validation** | `cocValidationPdfGenerator.ts` | ❌ No | 🔴 Needs integration |
| **Inspection** | `inspectionReportGenerator.ts` | ❌ No | 🔴 Needs integration |
| **Comprehensive Inspection** | `ComprehensiveInspectionReport.tsx` | ❌ No | 🔴 Needs integration |
| **Floor Plan** | `floorPlanReportGenerator.ts` | ❌ No | 🟡 Needs integration |
| **Asset Verification** | `assetVerificationReportGenerator.ts` | ❌ No | 🟡 Needs integration |
| **Compliance** | N/A | ❌ No | 🟡 Needs creation |

---

## Architecture: Unified PDF Generation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDF TEMPLATE MANAGER (Settings)                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  WYSIWYG Editor                                                          │ │
│  │  • Editable fields (blue border + pencil) → Saved to template           │ │
│  │  • Placeholder data (dashed amber border) → Replaced at generation      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                    ↓                                         │
│                    pdf_report_templates (Database)                           │
│                    ├── report_type: string                                   │
│                    ├── customization: JSON                                   │
│                    └── sections: JSON[]                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REPORT GENERATOR COMPONENT                           │
│  1. Fetch template from pdf_report_templates                                │
│  2. Fetch real data from database (sites, subsections, inspections, etc.)  │
│  3. Merge template config with real data                                    │
│  4. Build pdfMake document definition                                       │
│  5. Generate PDF blob                                                       │
│  6. Preview / Download / Save to Documents                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              pdfMakeUtils.ts                                 │
│  • createCoverPage()           • createKpiRow()                             │
│  • createDataTable()           • createStatusBadge()                        │
│  • createInfoTable()           • createSectionHeader()                      │
│  • generatePdfBlob()           • logComplianceCheck()                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                              pdfMakeConfig.ts                                │
│  • Font configuration (Roboto)                                              │
│  • Color palette (COLORS)                                                   │
│  • Page dimensions (A4)                                                     │
│  • Table layouts                                                            │
│  • Base document definition                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                            ┌──────────────────┐
                            │  PDF OUTPUT      │
                            │  • Preview       │
                            │  • Download      │
                            │  • Save to DB    │
                            └──────────────────┘
```

---

## Phase 1: High Priority Reports (Week 1-2)

### 1.1 COC Validation Report

**Current State:** Uses `cocValidationPdfGenerator.ts` directly without template integration.

**Actions:**
- [ ] Add `coc_validation` template type to `PDFTemplateManager`
- [ ] Define default sections:
  - Validation Status (KPI)
  - Administrative Details (Info Table)
  - Technical Evaluation (Data Table)
  - Check Results (Data Table with status badges)
  - Critical Failures (Highlighted table)
  - Recommendations (Text section)
- [ ] Update `COCValidationReport.tsx` to fetch template config
- [ ] Update `cocValidationPdfGenerator.ts` to accept template config
- [ ] Update WYSIWYG editor to render COC-specific preview pages

### 1.2 Inspection Report

**Current State:** `inspectionReportGenerator.ts` generates directly, no template integration.

**Actions:**
- [ ] Ensure `inspection` template exists in `PDFTemplateManager` (already defined)
- [ ] Define default sections:
  - Cover Page
  - Inspection Summary (KPI)
  - Section Items (Data Table per section)
  - Images (Grid layout)
  - Signatures (Signature block)
  - Notes
- [ ] Update `inspectionReportGenerator.ts` to fetch/use template
- [ ] Add section toggle support (enable/disable sections dynamically)

### 1.3 Comprehensive Inspection Report

**Current State:** `ComprehensiveInspectionReport.tsx` is a superset of inspection report.

**Actions:**
- [ ] Add `comprehensive_inspection` template type
- [ ] Extend inspection sections with:
  - Snag Summary
  - Before/After Photos
  - Compliance Checklist
  - Sign-off Section
- [ ] Update generator to consume template
- [ ] Consider merging with inspection template using "comprehensive mode" toggle

---

## Phase 2: Medium Priority Reports (Week 3-4)

### 2.1 Floor Plan Report

**Current State:** `floorPlanReportGenerator.ts` generates pin annotations report.

**Actions:**
- [ ] Add `floor_plan` template type (already in REPORT_TYPES)
- [ ] Define sections:
  - Cover Page
  - Floor Plan Image (full page)
  - Pin Summary (Data Table)
  - Pin Details (Cards with photos)
  - Statistics (KPI)
- [ ] Update generator to use template
- [ ] Add pin filtering options to template (by status, priority, etc.)

### 2.2 Site Drawing Report

**Current State:** `SiteDrawingReport.tsx` renders annotated PDFs.

**Actions:**
- [ ] Add `site_drawing` template type
- [ ] Define sections:
  - Cover Page
  - Drawing Render (Image)
  - Annotations List
  - Notes
- [ ] Update component to fetch template
- [ ] Add annotation style options (colors, sizes) to template

### 2.3 Fortress Marking Checklist

**Current State:** `FortressMarkingChecklist.tsx` generates checklist report.

**Actions:**
- [ ] Add `checklist` template type
- [ ] Define sections:
  - Cover Page
  - Checklist Items (grouped by category)
  - Progress Summary (KPI)
  - Sign-off
- [ ] Update component to use template
- [ ] Add checklist item grouping options

### 2.4 Asset Verification Report

**Current State:** `assetVerificationReportGenerator.ts` generates asset reports.

**Actions:**
- [ ] Ensure `asset_verification` template type exists
- [ ] Define sections:
  - Cover Page
  - Asset Summary (KPI: total, verified, pending)
  - Asset Table (with verification status)
  - Discrepancies
  - Notes
- [ ] Update generator to consume template

---

## Phase 3: Low Priority Reports (Week 5)

### 3.1 Calendar Export

**Current State:** `Calendar.tsx` has inline PDF generation.

**Actions:**
- [ ] Add `calendar` template type
- [ ] Define sections:
  - Cover Page
  - Event Summary (KPI)
  - Events Table
  - Monthly/Weekly View (optional)
- [ ] Extract PDF logic to `calendarReportGenerator.ts`
- [ ] Update Calendar page to use template

### 3.2 QR Sheet Generator

**Current State:** `QRAnalytics.tsx` generates QR code sheets.

**Actions:**
- [ ] Add `qr_sheet` template type
- [ ] Define sections:
  - Header with site info
  - QR Grid (configurable columns)
  - Labels
- [ ] Update component to use template
- [ ] Add grid layout options (2x2, 3x3, etc.)

---

## Phase 4: WYSIWYG Editor Enhancement (Week 6)

### 4.1 Report-Specific Preview Pages

**Current State:** Editor shows generic pages, not specific to each report type.

**Actions:**
- [ ] Create report-specific page renderers:
  - `renderCOCValidationPages()`
  - `renderInspectionPages()`
  - `renderFloorPlanPages()`
  - etc.
- [ ] Switch renderer based on `reportType` prop
- [ ] Add mock data specific to each report type

### 4.2 Section Toggle Sync

**Actions:**
- [ ] Ensure section enable/disable in editor correctly hides pages
- [ ] Add section reordering (drag and drop)
- [ ] Preview hidden sections as grayed out thumbnails

### 4.3 Column/KPI Customization

**Actions:**
- [ ] Allow adding/removing columns per table section
- [ ] Allow adding/removing KPIs per KPI section
- [ ] Persist column widths in template
- [ ] Add column visibility toggles

---

## Phase 5: Advanced Features (Week 7-8)

### 5.1 Template Versioning

**Actions:**
- [ ] Add `version` column to `pdf_report_templates`
- [ ] Track template changes history
- [ ] Allow rollback to previous versions

### 5.2 Template Duplication

**Actions:**
- [ ] Allow creating custom templates from defaults
- [ ] Support multiple templates per report type
- [ ] Add "Use Template" selector in report generators

### 5.3 Conditional Sections

**Actions:**
- [ ] Add section conditions (e.g., show only if > 0 snags)
- [ ] Add data-driven section visibility
- [ ] Add "if empty, hide section" option

### 5.4 Branding Customization

**Actions:**
- [ ] Per-client template overrides
- [ ] Logo placement options
- [ ] Color scheme per client
- [ ] Footer customization

---

## Implementation Checklist

### Database Changes

- [ ] Ensure all report types have default templates in `pdf_report_templates`
- [ ] Add migration to create default templates for new types
- [ ] Add `version` column for template versioning (future)

### Code Changes Per Report

For each report, follow this pattern:

```typescript
// 1. Define report type constant
const REPORT_TYPE = 'my_report_type';

// 2. Define default sections
const DEFAULT_SECTIONS: ReportSection[] = [...];

// 3. Define default customization
const DEFAULT_CUSTOMIZATION: Partial<ReportCustomization> = {...};

// 4. Fetch template function
const fetchTemplateConfig = async (): Promise<TemplateConfig> => {
  const { data: template } = await supabase
    .from("pdf_report_templates")
    .select("customization, sections")
    .eq("report_type", REPORT_TYPE)
    .eq("is_default", true)
    .single();
  
  if (template) {
    return {
      customization: { ...DEFAULT_CUSTOMIZATION, ...template.customization },
      sections: template.sections || DEFAULT_SECTIONS,
    };
  }
  return { customization: DEFAULT_CUSTOMIZATION, sections: DEFAULT_SECTIONS };
};

// 5. Use template in generation
const generateReport = async () => {
  const { customization, sections } = await fetchTemplateConfig();
  
  // Build content based on enabled sections
  for (const section of sections.filter(s => s.enabled).sort((a,b) => a.order - b.order)) {
    switch (section.id) {
      case 'cover': content.push(createCoverPage({...})); break;
      case 'summary': content.push(createSummarySection({...})); break;
      // ... etc
    }
  }
  
  // Generate PDF
  const blob = await generatePdfBlob(docDefinition);
};
```

---

## Success Criteria

1. **100% Template Coverage**: All reports fetch configuration from `pdf_report_templates`
2. **WYSIWYG Parity**: Editor preview matches actual PDF output for each report type
3. **Section Flexibility**: Users can enable/disable/reorder sections via Settings
4. **Column Customization**: Users can show/hide table columns via template
5. **Consistent Branding**: All reports use shared `pdfMakeUtils` functions
6. **SANS Compliance**: All electrical compliance reports follow SANS 10142-1 standards

---

## Files to Create/Modify

### New Files
- [ ] `src/lib/reportTemplateLoader.ts` - Shared template loading utility
- [ ] `src/hooks/useReportTemplate.ts` - React hook for template fetching

### Modified Files (per report type)
- [ ] `src/lib/cocValidationPdfGenerator.ts`
- [ ] `src/lib/inspectionReportGenerator.ts`
- [ ] `src/lib/floorPlanReportGenerator.ts`
- [ ] `src/lib/assetVerificationReportGenerator.ts`
- [ ] `src/components/ComprehensiveInspectionReport.tsx`
- [ ] `src/components/SiteDrawingReport.tsx`
- [ ] `src/components/FortressMarkingChecklist.tsx`
- [ ] `src/pages/Calendar.tsx` (extract to lib)
- [ ] `src/components/site/QRAnalytics.tsx`

### Template Manager Updates
- [ ] `src/components/settings/PDFTemplateManager.tsx` - Add all report types
- [ ] `src/components/settings/PDFWYSIWYGEditor.tsx` - Report-specific renderers

---

## Timeline Summary

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | Week 1-2 | COC Validation, Inspection, Comprehensive Inspection |
| Phase 2 | Week 3-4 | Floor Plan, Site Drawing, Checklist, Asset Verification |
| Phase 3 | Week 5 | Calendar, QR Sheet |
| Phase 4 | Week 6 | WYSIWYG Editor Enhancements |
| Phase 5 | Week 7-8 | Versioning, Duplication, Conditional Sections |

---

## Notes for Development

1. **Backward Compatibility**: Always include DEFAULT_SECTIONS and DEFAULT_CUSTOMIZATION fallbacks
2. **Error Handling**: If template fetch fails, use defaults silently (no user-facing errors)
3. **Performance**: Cache templates in React Query or localStorage
4. **Testing**: Create test PDFs for each report type to verify template integration
5. **SANS Compliance**: Ensure COC reports include required electrical safety fields per SANS 10142-1

---

*Document Version: 1.0*
*Last Updated: 2026-01-17*
*Author: Lovable AI*
