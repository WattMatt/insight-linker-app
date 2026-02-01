
# COC Validation System - Comprehensive Review & Testing Plan

## System Overview

The COC (Certificate of Compliance) validation system is a multi-layered architecture that validates electrical certificates against SANS 10142-1:2020 standards.

---

## Architecture Components Reviewed

### 1. Edge Function: `validate-coc/index.ts`
**Purpose:** AI-powered document analysis and validation

**Key Features:**
- Uses Anthropic Claude API to analyze COC document images/PDFs
- Implements comprehensive SANS 10142-1:2020 rule sets
- Includes anti-hallucination guardrails
- Supports COC Type hierarchy validation (Initial/Supplementary/Temporary)

**Validation Checks Implemented:**
| Check ID | Clause | Description | Type |
|----------|--------|-------------|------|
| COC-TYPE-001 | Hierarchy | COC Type Checkbox Marked | Critical |
| COC-INIT-001 | Hierarchy | Initial COC Validation | Critical |
| COC-SUPP-001 | Hierarchy | Supplementary COC Reference | Critical |
| COC-TEMP-001 | Hierarchy | Temporary COC Validity | Critical |
| EARTH-001 | 8.4 | Earth Resistance | Safety-Critical |
| LOOP-001 | 8.5 | Earth Loop Impedance | Safety-Critical |
| INSUL-001 | 8.6 | Insulation Resistance | Safety-Critical |
| RCD-001 | 8.8 | RCD Protection | Safety-Critical |
| POL-001 | 8.7 | Polarity & Continuity | Mandatory |
| COND-001 | 7.2 | Conductor Sizing | Mandatory |
| OCP-001 | 8.3 | Overcurrent Protection | Mandatory |
| DOC-001 | 22 | Documentation | Administrative |

---

### 2. Compliance Calculations: `complianceCalculations.ts`
**Purpose:** Single source of truth for compliance rate calculations

**Key Logic:**
```typescript
VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass']
FAILED_VALIDATION_STATUSES = ['Fail', 'Failed', 'Incomplete']
```

**Compliance Determination:**
1. Fetch MOST RECENT validation per subsection
2. If latest validation is Failed/Fail/Incomplete: subsection is non-compliant
3. If `coc_status` is Approved AND no failed validation: compliant

---

### 3. Status Priority Bug Fix (Recently Applied)
The edge function now correctly handles status updates:
- **Before:** Failed validations couldn't override Approved status due to priority logic
- **After:** Failed validations ALWAYS update subsection status to Failed (line 1590-1599)

```typescript
const isNewValidationFailed = mappedSubsectionStatus === 'Failed';
const shouldUpdate = isNewValidationFailed || 
                    !currentSubsection?.coc_number || 
                    newPriority > currentPriority || ...
```

---

## Current Yarona Centre Data Analysis

### Database State (23 subsections):

| Status | Count | Examples |
|--------|-------|----------|
| Failed | 18 | ACKERMANS, DEBONAIRS, KFC, PEP, etc. |
| Missing | 5 | CENTRE MANAGEMENT, GENERATOR, LV ROOM, SHOPRITE, SHOPRITE LIQUOR |
| Approved | 1 | DAY TO DAY (has Pass validation) |

### Identified Issue: Inconsistent `is_compliant` Flag
- **DAY TO DAY:** `coc_status=Approved` but `is_compliant=false`
  - This appears incorrect since the latest validation shows Pass
  - Should be `is_compliant=true`

- **Missing COC subsections:** `coc_status=Missing` but `is_compliant=true`
  - This is incorrect logic - missing COC should NOT be compliant
  - Compliance requires either: COC not required OR valid COC present

---

## Issues Found & Corrections Needed

### Issue 1: `is_compliant` Logic for Missing COCs
**Problem:** Subsections with `coc_status=Missing` and `is_coc_required=true` incorrectly show `is_compliant=true`

**Root Cause:** The edge function only updates `is_compliant` during validation runs. Subsections that have never been validated retain their default state.

**Fix Required:** SQL migration to correct existing data + logic review

### Issue 2: DAY TO DAY Inconsistency
**Problem:** DAY TO DAY has a passing validation but `is_compliant=false`

**Root Cause:** The `is_compliant` calculation in the edge function has multiple conditions (cocTypeMarked, hierarchyValid, etc.) that may have triggered false

**Investigation Needed:** Review the specific validation report for DAY TO DAY

---

## Proposed Corrections

### Migration 1: Fix `is_compliant` for Missing COCs
```sql
-- Subsections with missing COC that require COC should NOT be compliant
UPDATE subsections
SET is_compliant = false
WHERE coc_status = 'Missing' 
  AND is_coc_required = true 
  AND is_compliant = true;
```

### Migration 2: Fix DAY TO DAY Based on Latest Validation
```sql
-- If latest validation is Pass and subsection still shows non-compliant, fix it
UPDATE subsections s
SET is_compliant = true
WHERE s.id IN (
  SELECT s2.id
  FROM subsections s2
  JOIN coc_validations cv ON cv.subsection_id = s2.id
  WHERE s2.coc_status = 'Approved'
    AND s2.is_compliant = false
    AND cv.validated_at = (
      SELECT MAX(cv2.validated_at) 
      FROM coc_validations cv2 
      WHERE cv2.subsection_id = s2.id
    )
    AND cv.status = 'Pass'
);
```

---

## Testing Plan

### Test 1: Validate Edge Function Directly
Use `supabase--curl_edge_functions` to call `validate-coc` with a known document

### Test 2: Verify Compliance Calculations
1. Run SQL query to check compliance stats match UI
2. Verify dashboard shows correct 1/23 compliant for Yarona

### Test 3: Bulk Validation Flow
1. Navigate to Yarona Centre > Compliance tab
2. Run bulk COC validation
3. Verify results update correctly

### Test 4: Individual Validation
1. Select a subsection with a COC document
2. Trigger validation
3. Verify:
   - Validation record created in `coc_validations`
   - `subsection.coc_status` updated
   - `subsection.is_compliant` updated
   - UI reflects new status

---

## Files Involved

| File | Role |
|------|------|
| `supabase/functions/validate-coc/index.ts` | AI validation engine |
| `supabase/functions/bulk-validate-coc/index.ts` | Batch processing |
| `src/lib/complianceCalculations.ts` | Unified compliance logic |
| `src/components/site/BulkCOCValidation.tsx` | Bulk validation UI |
| `src/components/COCValidationReport.tsx` | Validation result display |
| `src/components/ComplianceDashboard.tsx` | Compliance overview dashboard |

---

## Summary

The COC validation system is well-architected with:
- Comprehensive SANS 10142-1:2020 rule coverage
- Strong anti-hallucination measures for AI analysis
- Proper status priority handling (recently fixed)
- Centralized compliance calculations

**Corrections Needed:**
1. Fix `is_compliant` flag for subsections with `coc_status=Missing`
2. Investigate and fix DAY TO DAY `is_compliant` inconsistency
3. Consider adding a database trigger to auto-update `is_compliant` when `coc_status` changes

**Testing Approach:**
Since browser login is currently blocked, testing can proceed via:
1. Direct edge function invocation using `supabase--curl_edge_functions`
2. Database queries to verify data consistency
3. Edge function logs review

