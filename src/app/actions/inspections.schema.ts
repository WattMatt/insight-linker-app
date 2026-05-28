/**
 * Pure-Zod schemas + helpers for the inspections Server Actions.
 *
 * Isolated from the `'use server'` action module so Vitest can import
 * + test the validation rules without pulling in next/headers (which
 * doesn't load cleanly in a forked test worker).
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 3.
 */

import { z } from 'zod'

export const createSiteInspectionSchema = z.object({
  siteId: z.string().uuid(),
  templateId: z.string().uuid(),
  title: z.string().min(1).max(200),
  inspectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'inspectionDate must be ISO date (yyyy-mm-dd)',
  }),
  shopName: z.string().min(1).max(200).optional(),
})

export type CreateSiteInspectionInput = z.input<typeof createSiteInspectionSchema>

/**
 * "Site-wide: <template name>" — fallback shop_name when the caller
 * doesn't supply one. Matches the SiteDetail.tsx wording for backwards
 * compatibility with existing inspection rows.
 */
export function siteWideShopName(templateName: string | null | undefined): string {
  return `Site-wide: ${templateName || 'Inspection'}`
}

/**
 * Build the row that will be INSERTed into `inspections` for a
 * site-level inspection. Caller passes parsed input + the auth user's
 * id (server-derived, NOT client-supplied — closes finding (f)).
 */
export function buildSiteInspectionInsertRow(args: {
  input: CreateSiteInspectionInput
  inspectorId: string
  templateName: string | null | undefined
}) {
  return {
    site_id: args.input.siteId,
    template_id: args.input.templateId,
    title: args.input.title,
    shop_name: args.input.shopName ?? siteWideShopName(args.templateName),
    inspection_date: args.input.inspectionDate,
    status: 'Pending',
    inspector_id: args.inspectorId,
  }
}
