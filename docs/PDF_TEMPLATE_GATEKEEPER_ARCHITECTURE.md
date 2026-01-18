# PDF Template Gatekeeper Architecture

## Core Principle
**Every PDF report MUST fetch its configuration from `pdf_report_templates` before generation.**

The Template Manager is the single source of truth for:
- Cover page layout and branding
- Section order and visibility
- Accent colors and styling
- Table column visibility
- KPI display configuration

---

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         1. TEMPLATE MANAGER (Settings Page)                  │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │ Site Summary │    │  Inspection  │    │  Floor Plan  │  ...             │
│  │   Template   │    │   Template   │    │   Template   │                  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│         │                    │                    │                         │
│         └────────────────────┼────────────────────┘                         │
│                              ↓                                              │
│                    ┌──────────────────┐                                     │
│                    │ WYSIWYG Preview  │  ← Real data from reference site   │
│                    │ (Exactly matches │                                     │
│                    │  PDF output)     │                                     │
│                    └──────────────────┘                                     │
│                              ↓                                              │
│                    ┌──────────────────┐                                     │
│                    │     SAVE TO      │                                     │
│                    │   DATABASE       │                                     │
│                    └──────────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
                    pdf_report_templates table
                    ├── report_type: 'site_summary' | 'inspection' | ...
                    ├── is_default: boolean
                    ├── customization: JSON {
                    │     coverTitle, coverSubtitle, accentColor,
                    │     includeDate, includePageNumbers, logoUrl...
                    │   }
                    └── sections: JSON[] [
                          { id, title, type, enabled, order, columns, kpiItems }
                        ]
                               ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         2. usePDFTemplate Hook                               │
│                                                                             │
│  • Called by EVERY report generator component                               │
│  • Fetches template by report_type                                          │
│  • Returns: { customization, sections, loading }                            │
│  • Provides: getCustomization() for merging runtime overrides               │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         3. REPORT GENERATOR COMPONENT                        │
│                         (e.g., SiteSummaryReport.tsx)                        │
│                                                                             │
│  async function generateReport() {                                          │
│    // Step 1: Get template configuration (THE GATEKEEPER)                   │
│    const { customization, sections } = usePDFTemplate('site_summary');      │
│                                                                             │
│    // Step 2: Fetch real data from database                                 │
│    const siteData = await fetchSiteData(siteId);                            │
│    const subsections = await fetchSubsections(siteId);                      │
│                                                                             │
│    // Step 3: Filter sections based on template (enabled only)              │
│    const enabledSections = sections                                         │
│      .filter(s => s.enabled)                                                │
│      .sort((a, b) => a.order - b.order);                                    │
│                                                                             │
│    // Step 4: Build content using pdfEngine utilities                       │
│    const content = [];                                                      │
│    for (const section of enabledSections) {                                 │
│      content.push(renderSection(section, realData));                        │
│    }                                                                        │
│                                                                             │
│    // Step 5: Generate via unified engine with template config              │
│    return pdfEngine.generateReport({                                        │
│      type: 'site-summary',                                                  │
│      content,                                                               │
│      coverPage: {                                                           │
│        title: customization.coverTitle,                                     │
│        subtitle: customization.coverSubtitle,                               │
│        siteName: siteData.name,                                             │
│        clientName: siteData.clientName,                                     │
│        logoDataUrl: customization.logoUrl || branding.logo,                 │
│      },                                                                     │
│      options: {                                                             │
│        accentColor: customization.accentColor,                              │
│        includePageNumbers: customization.includePageNumbers,                │
│        organizationName: customization.organizationName,                    │
│      }                                                                      │
│    });                                                                      │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         4. pdfEngine.ts                                      │
│                                                                             │
│  • Applies accent color to all elements                                     │
│  • Creates cover page using pdfMakeUtils.createCoverPage()                  │
│  • Creates headers/footers with page numbers                                │
│  • Ensures SANS compliance where applicable                                 │
│  • Returns { blob, filename }                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                               ↓
                          PDF OUTPUT
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure ✅
- [x] `pdf_report_templates` database table
- [x] `usePDFTemplate` hook for fetching templates
- [x] `PDFTemplateManager` component in Settings
- [x] `PDFWYSIWYGEditor` for visual editing
- [x] `pdfEngine.ts` unified generation
- [x] `pdfMakeUtils.ts` building blocks

### Phase 2: Full Preview Alignment ✅
- [x] `SiteSummaryFullPreview` matches actual PDF output
- [x] Preview uses real data from reference site
- [ ] Other report type previews match output

### Phase 3: Generator Integration (TODO)
For each report type, update generator to:

1. **Import and use `usePDFTemplate` hook**
2. **Filter sections by `enabled` flag**
3. **Respect `order` property for section sequence**
4. **Apply `customization.accentColor` to all colored elements**
5. **Use `customization.coverTitle/coverSubtitle` for cover page**
6. **Pass template config to `pdfEngine.generateReport()`**

| Report Type | Generator File | Status |
|-------------|----------------|--------|
| Site Summary | `SiteSummaryReport.tsx` | ✅ Integrated |
| Inspection | `inspectionReportGenerator.ts` | 🔴 Not integrated |
| Floor Plan | `floorPlanReportGenerator.ts` | 🔴 Not integrated |
| Asset Verification | `assetVerificationReportGenerator.ts` | 🔴 Not integrated |
| COC Validation | `cocValidationPdfGenerator.ts` | 🔴 Not integrated |
| Compliance | N/A | 🔴 Not created |

---

## Section Rendering Pattern

Each section in the template maps to a render function:

```typescript
function renderSection(section: ReportSection, data: ReportData): Content[] {
  switch (section.id) {
    case 'health-metrics':
      return createKpiRow([
        { label: 'Overall Health', value: data.overallHealth, color: getKpiColor(section, 'health') },
        { label: 'COC Compliance', value: data.cocCompliance, color: getKpiColor(section, 'coc') },
        // Only visible KPIs from section.kpiItems
      ].filter(kpi => section.kpiItems?.find(k => k.id === kpi.id)?.visible));
    
    case 'subsection-details':
      return createDataTable(
        section.title,
        // Only visible columns from section.columns
        section.columns?.filter(c => c.visible).map(c => ({ header: c.label, key: c.field })),
        data.subsections
      );
    
    default:
      return [];
  }
}
```

---

## Accent Color Application

The template's `accentColor` must be applied consistently:

```typescript
// pdfMakeUtils.ts enhancement
export function getAccentColorHex(colorName: string): string {
  const ACCENT_COLORS = {
    blue: '#2563eb',
    green: '#16a34a', 
    orange: '#ea580c',
    red: '#dc2626',
    purple: '#9333ea',
  };
  return ACCENT_COLORS[colorName] || ACCENT_COLORS.blue;
}

// In report generators:
const accentHex = getAccentColorHex(customization.accentColor);
// Use accentHex for:
// - Cover page accent bar
// - Section headers
// - KPI card backgrounds
// - Table header backgrounds
// - Status badge colors
```

---

## Template Schema Reference

```typescript
interface ReportCustomization {
  // Cover Page
  coverTitle: string;           // e.g., "Site Summary Report"
  coverSubtitle: string;        // e.g., "Comprehensive Site Analysis"
  includeDate: boolean;         // Show date on cover
  includeReference: boolean;    // Show reference number
  
  // Styling
  accentColor: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  
  // Header/Footer
  organizationName?: string;
  includePageNumbers: boolean;
  includeTableOfContents: boolean;
  
  // Branding (optional override)
  logoUrl?: string;
}

interface ReportSection {
  id: string;                   // Unique identifier: 'health-metrics', 'subsection-details'
  title: string;                // Display name in PDF
  type: 'kpi' | 'table' | 'text' | 'chart';
  enabled: boolean;             // Whether to include in PDF
  order: number;                // Sort order
  editable: boolean;            // Can user rename this section?
  
  // Table sections
  columns?: TableColumn[];      // { id, label, field, visible }
  
  // KPI sections
  kpiItems?: KPIItem[];         // { id, label, field, visible, color }
  
  // Text sections
  textContent?: string;
}
```

---

## Migration Strategy

For each generator that needs integration:

1. **Add template fetch at start**
   ```typescript
   const { data: template } = await supabase
     .from('pdf_report_templates')
     .select('*')
     .eq('report_type', 'inspection')
     .eq('is_default', true)
     .single();
   ```

2. **Parse customization and sections**
   ```typescript
   const customization = template?.customization || DEFAULT_CUSTOMIZATION;
   const sections = (template?.sections || []).filter(s => s.enabled);
   ```

3. **Replace hardcoded colors with accent color**
   ```typescript
   // Before: COLORS.blue, '#2563eb'
   // After:  getAccentColorHex(customization.accentColor)
   ```

4. **Filter content based on enabled sections**
   ```typescript
   const content = [];
   for (const section of sections.sort((a,b) => a.order - b.order)) {
     if (shouldRenderSection(section)) {
       content.push(...renderSection(section, data));
     }
   }
   ```

5. **Pass customization to cover page**
   ```typescript
   createCoverPage({
     title: customization.coverTitle,
     subtitle: customization.coverSubtitle,
     // ...
   });
   ```

---

## Benefits of This Architecture

1. **Single Source of Truth**: All formatting comes from the template
2. **WYSIWYG Accuracy**: Preview exactly matches generated PDF
3. **User Control**: Non-technical users can customize reports
4. **Consistency**: All reports follow the same design system
5. **SANS Compliance**: Template enforces compliance requirements
6. **Maintainability**: Changes in one place affect all reports
