# 🧪 COC Test Framework Documentation

## Overview

This document provides comprehensive testing guidelines for the Electrical Certificate of Compliance (COC) validation system. It covers test scenarios, expected outcomes, and setup procedures for validating COCs against SANS 10142-1:2020 standards.

---

## 📋 Table of Contents

1. [Test Categories](#test-categories)
2. [Test Data Requirements](#test-data-requirements)
3. [Check ID Reference](#check-id-reference)
4. [Test Scenarios](#test-scenarios)
5. [Expected Outcomes](#expected-outcomes)
6. [Automated Test Setup](#automated-test-setup)
7. [Manual Testing Procedures](#manual-testing-procedures)

---

## 🏷️ Test Categories

### 1. COC Hierarchy Tests
Tests validating the COC type hierarchy and reference validation.

| Test ID | Category | Description | Priority |
|---------|----------|-------------|----------|
| HIER-001 | Initial COC | Valid Initial COC standalone | Critical |
| HIER-002 | Supplementary | Supplementary with valid Initial reference | Critical |
| HIER-003 | Supplementary | Supplementary without Initial reference | Critical |
| HIER-004 | Temporary | Temporary with valid Initial reference | Critical |
| HIER-005 | Temporary | Temporary without Initial reference | Critical |
| HIER-006 | Temporary | Expired Temporary COC | Critical |
| HIER-007 | Initial | Expired Initial COC | Critical |

### 2. Safety-Critical Tests
Tests for mandatory safety requirements per SANS 10142-1.

| Test ID | Check ID | Description | Clause |
|---------|----------|-------------|--------|
| SAFE-001 | EARTH-001 | Earth resistance within limits | 8.4 |
| SAFE-002 | EARTH-001 | Earth resistance exceeds limits | 8.4 |
| SAFE-003 | LOOP-001 | Earth loop impedance pass | 8.5 |
| SAFE-004 | LOOP-001 | Earth loop impedance fail | 8.5 |
| SAFE-005 | INSUL-001 | Insulation resistance pass | 8.6 |
| SAFE-006 | INSUL-001 | Insulation resistance fail | 8.6 |
| SAFE-007 | RCD-001 | RCD trip time pass | 8.8 |
| SAFE-008 | RCD-001 | RCD trip time fail | 8.8 |
| SAFE-009 | POL-001 | Polarity correct | 8.7 |
| SAFE-010 | POL-001 | Polarity incorrect | 8.7 |

### 3. Administrative Tests
Tests for documentation and certification requirements.

| Test ID | Check ID | Description | Clause |
|---------|----------|-------------|--------|
| ADMIN-001 | DOC-001 | Valid registration | 22 |
| ADMIN-002 | DOC-001 | Expired registration | 22 |
| ADMIN-003 | CERT-DATE-001 | Future-dated COC | Business |
| ADMIN-004 | CERT-EXPIRY-001 | Expired commercial COC | Business |
| ADMIN-005 | CERT-EXPIRY-001 | Expired domestic COC warning | Business |

### 4. Technical Tests
Tests for conductor sizing and overcurrent protection.

| Test ID | Check ID | Description | Clause |
|---------|----------|-------------|--------|
| TECH-001 | COND-001 | Conductor sizing correct | 7.2 |
| TECH-002 | COND-001 | Conductor undersized | 7.2 |
| TECH-003 | OCP-001 | Overcurrent protection correct | 8.3 |
| TECH-004 | OCP-001 | Overcurrent protection undersized | 8.3 |

### 5. Special Systems Tests
Tests for generators, solar, battery, and SPD systems.

| Test ID | Check ID | Description | Clause |
|---------|----------|-------------|--------|
| SPEC-001 | GEN-001 | Generator installation compliant | 26 |
| SPEC-002 | INV-001 | Solar inverter compliant | 27 |
| SPEC-003 | BAT-001 | Battery storage compliant | 31 |
| SPEC-004 | SPD-001 | SPD correctly installed | 28 |

---

## 📊 Check ID Reference

### Safety-Critical Checks (Must ALL Pass)

| Check ID | Clause | Description | Pass Criteria | Fail Criteria |
|----------|--------|-------------|---------------|---------------|
| EARTH-001 | 8.4 | Earth resistance | ≤1Ω (TN), ≤20Ω (TT+30mA RCD) | > limits |
| LOOP-001 | 8.5 | Earth loop impedance | Zs ≤ Zs(max) for MCB type | Zs > Zs(max) |
| INSUL-001 | 8.6 | Insulation resistance | ≥0.5MΩ (SELV), ≥1MΩ (≤500V) | < limits |
| RCD-001 | 8.8 | RCD trip time | ≤300ms@1×IΔn, ≤40ms@5×IΔn | > limits |
| POL-001 | 8.7 | Polarity & continuity | Correct, ≤0.5Ω | Incorrect |

### Hierarchy Checks (Must ALL Pass)

| Check ID | Description | Pass Criteria | Fail Criteria |
|----------|-------------|---------------|---------------|
| COC-INIT-001 | Initial COC exists | Valid Initial COC present | Missing or invalid |
| COC-SUPP-001 | Supplementary reference | References valid Initial | No reference |
| COC-TEMP-001 | Temporary validity | Within validity period | Expired |
| COC-VALID-001 | Overall hierarchy | All hierarchy rules met | Any violation |

### Zs Maximum Values (Type B MCB @ 0.4s)

| MCB Rating | Max Zs (Ω) | Type C (×0.5) | Type D (×0.25) |
|------------|-----------|---------------|----------------|
| 6A | 7.67 | 3.84 | 1.92 |
| 10A | 4.60 | 2.30 | 1.15 |
| 16A | 2.87 | 1.44 | 0.72 |
| 20A | 2.30 | 1.15 | 0.58 |
| 25A | 1.84 | 0.92 | 0.46 |
| 32A | 1.44 | 0.72 | 0.36 |
| 40A | 1.15 | 0.58 | 0.29 |
| 50A | 0.92 | 0.46 | 0.23 |
| 63A | 0.73 | 0.37 | 0.18 |

---

## 🧪 Test Scenarios

### Scenario 1: Complete Pass (All Checks Pass)
**Purpose:** Validate a fully compliant installation.
**Expected Status:** Pass
**Key Inputs:**
- Earth resistance: 0.85Ω (TN-S)
- Insulation resistance: ≥1MΩ all circuits
- RCD trip: 28ms @ 1×IΔn, 18ms @ 5×IΔn
- Polarity: Correct
- Valid Initial COC

### Scenario 2: Critical Safety Failure
**Purpose:** Validate detection of safety-critical failures.
**Expected Status:** Fail
**Key Inputs:**
- Earth resistance: 2.3Ω (exceeds 1Ω limit)
- RCD trip: 450ms (exceeds 300ms)
- Other tests: Pass

### Scenario 3: Hierarchy Violation - Missing Initial
**Purpose:** Validate Supplementary COC without Initial reference fails.
**Expected Status:** Fail
**Key Inputs:**
- COC Type: Supplementary
- Initial COC Reference: null
- Technical tests: All pass

### Scenario 4: Expired Certificate
**Purpose:** Validate expired COC detection.
**Expected Status:** Fail (Commercial) / Warn (Domestic)
**Key Inputs:**
- Issue Date: >2 years ago (commercial)
- Issue Date: >5 years ago (domestic)

### Scenario 5: Incomplete Data
**Purpose:** Validate handling of missing test data.
**Expected Status:** Incomplete
**Key Inputs:**
- Missing >30% of required test values
- Available tests: Pass

---

## ✅ Expected Outcomes Matrix

### Overall Status Determination

| Condition | Status | Notes |
|-----------|--------|-------|
| All safety-critical pass + All mandatory pass + Hierarchy valid | **Pass** | Fully compliant |
| Any safety-critical failure | **Fail** | Immediate remediation required |
| Hierarchy violation | **Fail** | COC type requirements not met |
| 2+ mandatory failures | **Fail** | Multiple non-compliances |
| Missing >30% test data | **Incomplete** | Insufficient data for validation |
| Certificate expired | **Fail** | Renewal required |

### Confidence Score Guidelines

| Score Range | Quality | Description |
|-------------|---------|-------------|
| 90-100 | Excellent | Clear document, all values extracted |
| 70-89 | Good | Minor values unclear, primary checks verifiable |
| 50-69 | Fair | Several values unclear, moderate uncertainty |
| <50 | Poor | Many values unreadable, low confidence |

---

## 🔧 Automated Test Setup

### Test Data Generator Functions

Use `src/lib/cocTestUtils.ts` for generating test data:

```typescript
import { 
  generatePassingCOC,
  generateFailingCOC,
  generateIncompleteData,
  generateHierarchyViolation 
} from '@/lib/cocTestUtils';

// Generate passing test case
const passingData = generatePassingCOC({
  cocType: 'Initial',
  installationType: 'Domestic Single Phase',
  supplySystem: 'TN-S'
});

// Generate failing test case
const failingData = generateFailingCOC({
  failureType: 'earth-resistance',
  measuredValue: 2.3 // Exceeds 1Ω limit
});
```

### API Testing

```typescript
import { supabase } from '@/integrations/supabase/client';

// Test COC validation endpoint
const response = await supabase.functions.invoke('validate-coc', {
  body: {
    subsectionId: 'test-subsection-id',
    documentId: 'test-document-id',
    testData: testCOCData
  }
});

expect(response.data.overallStatus).toBe('Pass');
```

---

## 📝 Manual Testing Procedures

### Procedure 1: Upload COC Document

1. Navigate to Subsection Detail page
2. Upload PDF/image of COC
3. Click "Validate COC" button
4. Verify extraction of:
   - COC Number
   - Issue Date
   - Test Values
   - Registration Details

### Procedure 2: Verify Validation Results

1. Check overall status (Pass/Fail/Incomplete)
2. Review individual check results
3. Verify remediation guidance for failures
4. Confirm audit trail entries

### Procedure 3: Test Edge Cases

1. Upload poor quality scan
2. Upload multi-page COC
3. Upload non-COC document
4. Test with missing mandatory fields

---

## 📊 Test Coverage Requirements

| Category | Minimum Coverage | Priority |
|----------|-----------------|----------|
| Hierarchy Tests | 100% | Critical |
| Safety-Critical Tests | 100% | Critical |
| Administrative Tests | 90% | High |
| Technical Tests | 85% | High |
| Special Systems | 70% | Medium |
| Edge Cases | 60% | Low |

---

## 🔄 Continuous Integration

### Pre-Deployment Checks

1. Run all unit tests
2. Execute integration tests against test database
3. Verify edge function responses
4. Check for regression in existing validations

### Post-Deployment Validation

1. Run smoke tests on production
2. Verify real COC validation
3. Check audit logging
4. Monitor error rates

---

## 📚 Related Documentation

- [COC Verification Engine](./coc-verification-engine.md)
- [COC Input Schema](./coc-input-schema.json)
- [SANS 10142-1:2020 Quick Reference](./sans-10142-reference.md)
