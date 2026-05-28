/**
 * Tests for the orphan-name fallback helper used by `useSubsectionDetail`.
 *
 * Originally Web ARCHITECTURE_AUDIT.md Strategy 1 deliverable #5 —
 * the rule was shadowed here as a pure spec because the hook was a
 * 1,751-line god-hook. Strategy 6 has now extracted the rule into
 * `./orphanFallback.ts`, so this test imports + exercises the real
 * helper directly. Any drift between the production rule and the test
 * is now impossible — they share code.
 *
 * The fixtures still mirror Stage 1 Q9: of 233 historical orphans,
 * only 3 attached via the strict rule (see
 * `docs/integrity-audit/root-causes.md`).
 */

import {
  normalize,
  inspectionShopFingerprint,
  matchesSubsection,
  selectOrphansForSubsection,
  type InspectionLike,
} from './orphanFallback'

describe('orphanFallback helper', () => {
  describe('normalize()', () => {
    it('uppercases and strips non-alphanumerics', () => {
      expect(normalize('Shop 31/32')).toBe('SHOP3132')
      expect(normalize('shop-7')).toBe('SHOP7')
      expect(normalize('  spaces  ')).toBe('SPACES')
    })

    it('handles null and undefined gracefully', () => {
      expect(normalize(null)).toBe('')
      expect(normalize(undefined)).toBe('')
      expect(normalize('')).toBe('')
    })

    it('treats different punctuation around the same digits as equivalent', () => {
      // Stage 1 audit's exact case: orphan typed "SHOP 31-32",
      // subsection is "Shop 31/32" — different punctuation, same digits.
      expect(normalize('SHOP 31-32')).toBe(normalize('Shop 31/32'))
    })
  })

  describe('inspectionShopFingerprint() — precedence', () => {
    it('prefers json_data.generalInfo.shopNumber over every other field', () => {
      expect(
        inspectionShopFingerprint({
          json_data: { generalInfo: { shopNumber: 'SHOP A', shopName: 'B' } },
          shop_number: 'C',
          shop_name: 'D',
        }),
      ).toBe('SHOPA')
    })

    it('falls through to json_data.generalInfo.shopName next', () => {
      expect(
        inspectionShopFingerprint({
          json_data: { generalInfo: { shopNumber: null, shopName: 'B' } },
          shop_number: 'C',
          shop_name: 'D',
        }),
      ).toBe('B')
    })

    it('falls through to columnar shop_number when json_data is empty', () => {
      expect(
        inspectionShopFingerprint({
          json_data: { generalInfo: { shopNumber: null, shopName: null } },
          shop_number: 'C',
          shop_name: 'D',
        }),
      ).toBe('C')
    })

    it('falls through to columnar shop_name as last resort', () => {
      expect(
        inspectionShopFingerprint({ shop_number: null, shop_name: 'D' }),
      ).toBe('D')
    })

    it('returns empty string when all four sources are null/empty', () => {
      expect(
        inspectionShopFingerprint({
          json_data: { generalInfo: { shopNumber: null, shopName: null } },
          shop_number: null,
          shop_name: null,
        }),
      ).toBe('')
    })
  })

  describe('matchesSubsection()', () => {
    const subName = 'Shop 7'

    it('matches when json_data.generalInfo.shopNumber matches', () => {
      const insp = {
        json_data: { generalInfo: { shopNumber: 'SHOP 7' } },
        shop_number: 'irrelevant',
        shop_name: 'irrelevant',
      }
      expect(matchesSubsection(insp, subName)).toBe(true)
    })

    it('falls back to json_data.generalInfo.shopName when shopNumber is empty', () => {
      const insp = {
        json_data: { generalInfo: { shopNumber: null, shopName: 'Shop 7' } },
        shop_number: 'wrong',
      }
      expect(matchesSubsection(insp, subName)).toBe(true)
    })

    it('falls back to columnar shop_number when both json_data fields are empty', () => {
      const insp = {
        json_data: { generalInfo: { shopNumber: null, shopName: null } },
        shop_number: 'Shop 7',
        shop_name: 'tenant trading name',
      }
      expect(matchesSubsection(insp, subName)).toBe(true)
    })

    it('falls back to columnar shop_name as last resort', () => {
      const insp = {
        shop_name: 'shop  7',
        shop_number: null,
      }
      expect(matchesSubsection(insp, subName)).toBe(true)
    })

    it('does NOT match when none of the four fingerprints align', () => {
      const insp = {
        json_data: { generalInfo: { shopNumber: 'Shop 99' } },
        shop_name: 'completely unrelated',
      }
      expect(matchesSubsection(insp, subName)).toBe(false)
    })

    it('returns no match when all fingerprint sources are null/empty', () => {
      // The 173 "dark" orphans from Stage 1 — no fingerprint anywhere.
      const insp = {
        json_data: { generalInfo: { shopNumber: null, shopName: null } },
        shop_number: null,
        shop_name: null,
      }
      expect(matchesSubsection(insp, subName)).toBe(false)
    })

    it('returns no match for an empty/null subsection name', () => {
      // Guards against accidentally pulling every dark orphan when a
      // subsection has an unset name.
      const fingerprinted: InspectionLike = { shop_name: 'something' }
      expect(matchesSubsection(fingerprinted, '')).toBe(false)
      expect(matchesSubsection(fingerprinted, null)).toBe(false)
      expect(matchesSubsection(fingerprinted, undefined)).toBe(false)
    })
  })

  describe('selectOrphansForSubsection()', () => {
    // Mirrors Stage 1 Q9: of 233 orphans, only 3 attached via the
    // strict rule. The same set is reproduced here as fixtures.
    const subsectionName = 'SHOP SH G07'
    const orphans: InspectionLike[] = [
      {
        // Direct match on shop_number column.
        shop_number: 'SHOP SH G07',
        shop_name: 'Le Kremeary',
      },
      {
        // Match via json_data.generalInfo.shopNumber.
        json_data: { generalInfo: { shopNumber: 'shop sh g07' } },
      },
      {
        // Different shop entirely.
        shop_number: 'SHOP 99',
        shop_name: 'Pep Cell',
      },
      {
        // Dark orphan — no fingerprint.
        shop_name: null,
        shop_number: null,
      },
    ]

    it('attaches exactly the matching orphans', () => {
      const matched = selectOrphansForSubsection(orphans, subsectionName)
      expect(matched).toHaveLength(2)
    })

    it('ignores dark orphans (no fingerprint = no match)', () => {
      const matched = selectOrphansForSubsection(orphans, subsectionName)
      expect(matched.find(m => m.shop_name === null && m.shop_number === null)).toBeUndefined()
    })

    it('returns an empty list when the subsection name is empty', () => {
      expect(selectOrphansForSubsection(orphans, '')).toEqual([])
      expect(selectOrphansForSubsection(orphans, null)).toEqual([])
    })
  })
})
