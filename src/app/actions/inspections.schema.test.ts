/**
 * Tests for the pure-Zod validation rules of the inspection Server
 * Actions. The action wrapper itself can't be loaded in a Vitest
 * worker (it imports next/headers via the server supabase client),
 * so we test the validation in isolation.
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 3.
 */

import {
  createSiteInspectionSchema,
  siteWideShopName,
  buildSiteInspectionInsertRow,
} from './inspections.schema'

const validInput = {
  siteId: '11111111-1111-1111-1111-111111111111',
  templateId: '22222222-2222-2222-2222-222222222222',
  title: 'Generator Inspection',
  inspectionDate: '2026-05-28',
}

describe('createSiteInspectionSchema', () => {
  it('accepts a well-formed payload', () => {
    const result = createSiteInspectionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID siteId', () => {
    const result = createSiteInspectionSchema.safeParse({
      ...validInput,
      siteId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID templateId', () => {
    const result = createSiteInspectionSchema.safeParse({
      ...validInput,
      templateId: 'also-not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-ISO inspectionDate', () => {
    const result = createSiteInspectionSchema.safeParse({
      ...validInput,
      inspectionDate: '28/05/2026',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/iso date/i)
    }
  })

  it('rejects an empty title', () => {
    const result = createSiteInspectionSchema.safeParse({ ...validInput, title: '' })
    expect(result.success).toBe(false)
  })

  it('rejects an overlong title (>200 chars)', () => {
    const result = createSiteInspectionSchema.safeParse({
      ...validInput,
      title: 'x'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional shopName when supplied', () => {
    const result = createSiteInspectionSchema.safeParse({
      ...validInput,
      shopName: 'Custom shop name',
    })
    expect(result.success).toBe(true)
  })

  it('accepts the payload when shopName is omitted', () => {
    const result = createSiteInspectionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.shopName).toBeUndefined()
    }
  })
})

describe('siteWideShopName()', () => {
  it('formats as "Site-wide: <name>"', () => {
    expect(siteWideShopName('Generator')).toBe('Site-wide: Generator')
  })

  it('falls back to "Site-wide: Inspection" when template name is null', () => {
    expect(siteWideShopName(null)).toBe('Site-wide: Inspection')
    expect(siteWideShopName(undefined)).toBe('Site-wide: Inspection')
    expect(siteWideShopName('')).toBe('Site-wide: Inspection')
  })
})

describe('buildSiteInspectionInsertRow()', () => {
  const inspectorId = '33333333-3333-3333-3333-333333333333'

  it('sources inspector_id from the auth arg, NOT from input — closes finding (f)', () => {
    const row = buildSiteInspectionInsertRow({
      input: validInput,
      inspectorId,
      templateName: 'tmpl',
    })

    expect(row.inspector_id).toBe(inspectorId)
  })

  it('uses the explicit shopName when input.shopName is provided', () => {
    const row = buildSiteInspectionInsertRow({
      input: { ...validInput, shopName: 'Custom shop' },
      inspectorId,
      templateName: 'tmpl',
    })

    expect(row.shop_name).toBe('Custom shop')
  })

  it('falls back to Site-wide: <template name> when input.shopName is missing', () => {
    const row = buildSiteInspectionInsertRow({
      input: validInput,
      inspectorId,
      templateName: 'Site Drawing',
    })

    expect(row.shop_name).toBe('Site-wide: Site Drawing')
  })

  it('sets status to Pending by default', () => {
    const row = buildSiteInspectionInsertRow({
      input: validInput,
      inspectorId,
      templateName: 'tmpl',
    })

    expect(row.status).toBe('Pending')
  })

  it('passes through site_id, template_id, title, inspection_date verbatim', () => {
    const row = buildSiteInspectionInsertRow({
      input: validInput,
      inspectorId,
      templateName: 'tmpl',
    })

    expect(row.site_id).toBe(validInput.siteId)
    expect(row.template_id).toBe(validInput.templateId)
    expect(row.title).toBe(validInput.title)
    expect(row.inspection_date).toBe(validInput.inspectionDate)
  })
})
