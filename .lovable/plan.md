
# Remove PDF Templates Tab from Settings

## Overview

Remove the "PDF Templates" tab from the Settings page to simplify the interface.

## Changes Required

### File: `src/pages/Settings.tsx`

1. **Remove the import** for `PDFTemplateManager` (line 10)
2. **Remove the FileText icon** from imports (line 9) - only if not used elsewhere
3. **Remove the TabsTrigger** for "pdf-templates" (lines 169-172)
4. **Remove the TabsContent** for "pdf-templates" (lines 336-338)

## Technical Details

```text
Before (6 tabs):
┌─────────┬───────────────┬────────────────┬────────┬───────┬─────────┐
│ General │ PDF Templates │ COC Validation │ Images │ Users │ Portals │
└─────────┴───────────────┴────────────────┴────────┴───────┴─────────┘

After (5 tabs):
┌─────────┬────────────────┬────────┬───────┬─────────┐
│ General │ COC Validation │ Images │ Users │ Portals │
└─────────┴────────────────┴────────┴───────┴─────────┘
```

## Impact

- The `PDFTemplateManager` component file will remain in the codebase but will no longer be accessible from Settings
- No database changes required
- No other files reference this tab directly
