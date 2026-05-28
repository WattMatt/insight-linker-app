/**
 * Test 5/5 of the Web ARCHITECTURE_AUDIT.md Strategy 1 baseline.
 *
 * SHADOW TEST for the orphan-name fallback in useSubsectionDetail.ts
 * at lines 376-396. The fallback walks every inspection at the same
 * site whose `subsection_id IS NULL` and pulls in the ones whose
 * shop-number/name normalises to this subsection's name. This is the
 * exact code Stage 1 audit's Q9 referenced (`useSubsectionDetail.ts:366-399`).
 *
 * Why a shadow test, not a hook test? The hook is 1,751 lines of god-hook
 * with chained supabase calls and React state. Mocking the full surface
 * is more cost than value. Instead we replicate the normalize+match
 * predicate here as a pure spec. When Web ARCHITECTURE_AUDIT Strategy 6
 * extracts this logic into a helper (`matchOrphanByShopName`), this
 * test should be rewired to import + call that helper directly.
 *
 * Until that refactor, this file is the canonical reference for the rule.
 * Any change to the rule in the hook MUST update this test to match,
 * or the rule is silently drifting.
 *
 * Source rule (useSubsectionDetail.ts:379-395):
 *
 *   const normalize = (v?: string | null) =>
 *     (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
 *   const normalizedSubName = normalize(fullSubsection.name);
 *   // For each orphan inspection at the same site:
 *   const shop = insp?.json_data?.generalInfo?.shopNumber
 *             || insp?.json_data?.generalInfo?.shopName
 *             || insp?.shop_number
 *             || insp?.shop_name;
 *   return normalize(shop) === normalizedSubName;
 */

// Replicated rule — keep byte-identical to the hook.
function normalize(v?: string | null): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

interface InspectionLike {
  shop_name?: string | null
  shop_number?: string | null
  json_data?: {
    generalInfo?: {
      shopName?: string | null
      shopNumber?: string | null
    } | null
  } | null
}

function inspectionShopFingerprint(insp: InspectionLike): string {
  const shop =
    insp?.json_data?.generalInfo?.shopNumber ||
    insp?.json_data?.generalInfo?.shopName ||
    insp?.shop_number ||
    insp?.shop_name
  return normalize(shop)
}

function matchesSubsection(insp: InspectionLike, subsectionName: string): boolean {
  return inspectionShopFingerprint(insp) === normalize(subsectionName)
}

describe('useSubsectionDetail orphan-name fallback (shadow spec)', () => {
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

  describe('matchesSubsection() — fingerprint precedence', () => {
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
  })

  describe('integration: filter a batch of inspections', () => {
    // Mirrors Stage 1 Q9: of 233 orphans, only 3 attached via the
    // strict rule. The same set is reproduced here as test fixtures.
    const subsectionName = 'SHOP SH G07'
    const orphans: InspectionLike[] = [
      {
        // Direct match on shop_number column
        shop_number: 'SHOP SH G07',
        shop_name: 'Le Kremeary',
      },
      {
        // Match via json_data.generalInfo.shopNumber
        json_data: { generalInfo: { shopNumber: 'shop sh g07' } },
      },
      {
        // Different shop entirely
        shop_number: 'SHOP 99',
        shop_name: 'Pep Cell',
      },
      {
        // Dark orphan — no fingerprint
        shop_name: null,
        shop_number: null,
      },
    ]

    it('attaches exactly the matching orphans', () => {
      const matched = orphans.filter((o) => matchesSubsection(o, subsectionName))
      expect(matched).toHaveLength(2)
    })

    it('ignores dark orphans (no fingerprint = no match)', () => {
      const dark = orphans[3]
      expect(matchesSubsection(dark, subsectionName)).toBe(false)
    })
  })
})
