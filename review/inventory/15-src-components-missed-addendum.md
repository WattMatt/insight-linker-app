# Slice 15 (addendum) — src/components single-file subdirs missed by slices 07/08/09

Date: 2026-07-29. Orchestrator addendum: the slice partition of `src/components` (ui / eight named domain subdirs / root-level files) missed four files living in single-file subdirectories. Discovery command and real output:

```
$ git ls-files 'src/components/*' | grep -vE '^src/components/(ui|site|pdf-editor|client-portal|auth|settings|public|fortress|floor-plan)/' | awk -F/ 'NF>3'
src/components/coc/CocCertificateList.tsx
src/components/dashboard/SitesNeedingAttention.tsx
src/components/pdf-preview/SubsectionCard.tsx
src/components/templates/TemplatePreviewRenderer.tsx
```

Reconciliation: 932 (slices 01–14) + 4 (this addendum) = 936 = `git ls-files | wc -l`.

### src/components/coc/CocCertificateList.tsx
- Type: source
- LOC: 110
- Public surface: `CocCertificateList(p: Props)` (src/components/coc/CocCertificateList.tsx:93)
- Notes: no direct supabase import detected by grep.

### src/components/dashboard/SitesNeedingAttention.tsx
- Type: source
- LOC: 62
- Public surface: `SitesNeedingAttention({ rows, onSelectSite, limit = 6 }: Props)` (src/components/dashboard/SitesNeedingAttention.tsx:18)
- Notes: presentational dashboard widget; no direct supabase import detected by grep.

### src/components/pdf-preview/SubsectionCard.tsx
- Type: source
- LOC: 311
- Public surface: `SubsectionCard({ data, accentColor, logoUrl })` (src/components/pdf-preview/SubsectionCard.tsx:27), `SubsectionGrid({ subsections, accentColor, logoUrl })` (src/components/pdf-preview/SubsectionCard.tsx:298)
- Notes: no direct supabase import detected by grep.

### src/components/templates/TemplatePreviewRenderer.tsx
- Type: source
- LOC: 593
- Public surface: `TemplatePreviewRenderer: React.FC<TemplatePreviewRendererProps>` (src/components/templates/TemplatePreviewRenderer.tsx:407), also default export (src/components/templates/TemplatePreviewRenderer.tsx:593)
- Notes: no direct supabase import detected by grep.

## ASSUMED
- Surfaces above were extracted by grep (`grep -n 'export '`) plus LOC via `wc -l`; files were not read end-to-end. Internal helpers before the export lines are not documented here.
