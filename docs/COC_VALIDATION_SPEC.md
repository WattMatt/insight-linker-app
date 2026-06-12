# COC Validation System — Unified Specification

> ⛔ **OBSOLETE 2026-06-12 — this system was REMOVED.** The automated COC validation engine described here (deterministic SANS checks, `validate-coc`/`extract-coc`, validation tables, review/approval UI) no longer exists. COC is now a **manual** Pass/Fail verdict per subsection with a failure report; a failed/expired required COC gates `is_compliant`. Current docs: `docs/superpowers/COC-VALIDATION-STRIPOUT-TRACKER.md` + `docs/superpowers/plans/2026-06-11-coc-manual-workflow.md`. Kept for historical reference only.

> **Version:** 3.0  
> **Last Updated:** 2026-03-09  
> **Standard:** SANS 10142-1:2020  
> **System:** WM Compliance — Electrical Certificate of Compliance Verification Engine  
> **Runtime Source of Truth:** `supabase/functions/validate-coc/index.ts`

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Process Flow](#2-process-flow)
3. [COC Hierarchy & Type Logic](#3-coc-hierarchy--type-logic)
4. [Validation Rules — SANS 10142-1:2020](#4-validation-rules--sans-10142-12020)
5. [Configuration System](#5-configuration-system)
6. [Database Schema & Status Mappings](#6-database-schema--status-mappings)
7. [Edge Functions API Reference](#7-edge-functions-api-reference)
8. [Post-Processing Logic](#8-post-processing-logic)
9. [UI Components](#9-ui-components)
10. [Test Cases](#10-test-cases)
11. [Sample I/O JSON](#11-sample-io-json)
12. [Input Schema Reference](#12-input-schema-reference)

---

## 1. Overview & Architecture

### 1.1 Purpose

The COC Validation System is an AI-powered verification engine that:
- **Extracts** data from Electrical Certificate of Compliance (COC) PDF documents
- **Validates** extracted data against SANS 10142-1:2020 standards using a **deterministic engine** (AI extracts; server decides pass/fail)
- **Reports** compliance status with detailed findings and remediation guidance
- **Stores** validation results for audit trails and reporting

### 1.2 Key Design Principle: Strict Empirical (v4)

The AI is treated as an **extractor only**. All pass/fail decisions are made server-side via mathematical comparisons against SANS 10142-1:2020 thresholds. This eliminates AI judgment errors on safety-critical checks.

### 1.3 Key Features

| Feature | Description |
|---------|-------------|
| **PDF Vision Analysis** | Google Gemini 3 Pro Preview for visual document analysis |
| **Deterministic Engine** | Server-side mathematical pass/fail — AI never decides compliance |
| **COC Hierarchy Validation** | Validates Initial/Supplementary/Temporary certificate relationships |
| **Checkbox State Detection** | Mandatory verification of COC type checkbox marking |
| **Configurable Thresholds** | Database-driven settings with Strict/Standard/Relaxed presets |
| **Audit Trail** | Complete logging of all validation decisions with timestamps |

### 1.4 Technology Stack

| Component | Technology |
|-----------|------------|
| AI Model (Validation) | `google/gemini-3-pro-preview` |
| AI Model (Extraction) | `google/gemini-2.5-pro` (PDF), `google/gemini-2.5-flash` (targeted) |
| Backend | Supabase Edge Functions (Deno) |
| Frontend | React + TypeScript |
| PDF Generation | pdfmake |
| Database | PostgreSQL (Supabase) |

### 1.5 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                              │
│  SubsectionDetail  │  COCValidationReport  │  COCComplianceRules   │
└────────────────────┬────────────────────────────────────────────────┘
                     │ "Verify COC" click
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       EDGE FUNCTIONS                                │
│                                                                     │
│  extract-coc (Gemini 2.5 Pro)    validate-coc (Gemini 3 Pro Preview)│
│  • Download PDF                   • Download PDF                    │
│  • Vision Analysis                • AI Extraction (vision)          │
│  • Return JSON                    • Deterministic Engine (server)   │
│                                   • Store results in DB             │
└────────────────────┬────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SUPABASE DATABASE                              │
│  subsections  │  subsection_documents  │  coc_validations           │
│  (best COC)   │  (per-document data)   │  (full audit trail)        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Process Flow

### 2.1 High-Level 8-Step Flow

```
Step 1: Document Upload & Triage
  → User uploads COC PDF to "Certificate of Compliance" category
  → System performs legibility/orientation check

Step 2: Contextual Extraction (extract-coc)
  → AI extracts raw data from document
  → System fetches context (address, contractor, previous COCs)
  → AI uses context to improve extraction accuracy

Step 3: Discrepancy Analysis
  → Compare extracted data against system records
  → Flag mismatches as warnings
  → Check for duplicate COC numbers

Step 4: User Review & Approval (COCPreviewApproval UI)
  → User reviews extracted data
  → Warnings highlighted in yellow
  → User can trigger targeted re-extraction
  → User clicks "Approve & Validate"

Step 5: SANS Validation Engine (validate-coc)
  → AI extracts all visible data from document
  → Deterministic engine applies mathematical rules server-side
  → Measurements checked against clause thresholds

Step 6: Hierarchy & Linking
  → If Supplementary/Temporary: find Initial COC in system
  → Validate hierarchy rules
  → Establish database links

Step 7: Outcome & Remediation
  → Pass/Fail assigned by deterministic engine
  → Specific remediation steps generated per failed clause
  → Critical failures highlighted

Step 8: Finalization & Notification
  → Validation report archived
  → Subsection status updated
  → is_compliant flag set based on all criteria
```

### 2.2 Extraction-Only Flow (extract-coc)

Used when only data extraction is needed without full validation:

```
1. User triggers extraction
2. extract-coc downloads PDF, calls Gemini 2.5 Pro
3. Returns extracted JSON to client (no DB updates)
4. Client populates form fields or preview
```

---

## 3. COC Hierarchy & Type Logic

### 3.1 COC Type Determination — Checkbox-First Approach

The system uses a **checkbox-first approach** to determine COC type. This is the **most critical** step in extraction.

> ⚠️ **COMMON AI ERROR:** The AI has historically defaulted to "Initial" when "Supplementary" is actually ticked.

#### Visual Layout of ECA COC Form

```
┌─────────────────────────────────────────────────────────────┐
│  CERTIFICATE NO.     │  [Indicate in appropriate block]     │
│  ECA M0313005        │                                      │
│                      │   □ Initial   ☑ Supplementary        │
└─────────────────────────────────────────────────────────────┘
```

#### Checkbox Verification Steps

1. **Locate** all three checkboxes (Initial, Supplementary, Temporary) — usually top-right of page 1
2. **Examine** each checkbox: MARKED = ☑, ✓, X, filled box; EMPTY = □, only outline
3. **Set cocType** based on which box is actually ticked
4. **Never default** to "Initial" if Supplementary is ticked

#### Mandatory `checkboxStates` Output

Every AI response **must** include:

```json
{
  "checkboxStates": {
    "initialBox": "MARKED | EMPTY",
    "initialBoxDescription": "what you see in/around this checkbox",
    "supplementaryBox": "MARKED | EMPTY",
    "supplementaryBoxDescription": "what you see",
    "temporaryBox": "MARKED | EMPTY",
    "temporaryBoxDescription": "what you see"
  }
}
```

### 3.2 Hierarchy Validation Rules

| COC Type | Rule | Check ID |
|----------|------|----------|
| Initial | Stands alone — does NOT need to reference another COC | COC-INIT-001 |
| Supplementary | MUST reference Initial COC number | COC-SUPP-001 |
| Temporary | MUST reference Initial COC number; has validity period | COC-TEMP-001 |
| No checkbox marked | Automatic FAIL — certificate incomplete | COC-TYPE-001 |

#### Priority Hierarchy for COC Type Detection

1. **User-approved type** (`approvedCocType` parameter) — highest priority
2. **Server-side checkbox correction** — if AI's checkboxStates contradict cocType
3. **AI's detected cocType** — lowest priority (fallback)

### 3.3 COC Expiry — IMPORTANT

> **⚠️ COCs DO NOT EXPIRE per South African law.** An Electrical Certificate of Compliance remains valid indefinitely once issued, unless:
> - The installation is altered (requiring a new Supplementary COC)
> - The installation is found non-compliant upon re-inspection
> - The COC is formally revoked by authorities
>
> **Do NOT report COC expiry as a failure condition.** Only WARN if >5 years old for domestic periodic inspection recommendation.

### 3.4 Non-Compliance Conditions (Automatic FAIL)

| Condition | Applies To |
|-----------|------------|
| COC Type checkbox NOT marked | All COC types |
| Supplementary COC without Initial reference | Supplementary only |
| Temporary COC without Initial reference | Temporary only |
| cocType extracted incorrectly | All COC types |

---

## 4. Validation Rules — SANS 10142-1:2020

### 4.1 Check Summary

| Check ID | Clause | Description | Category | Empirical Required |
|----------|--------|-------------|----------|-------------------|
| COC-TYPE-001 | Hierarchy | Checkbox must be marked | Mandatory | No |
| COC-INIT-001 | Hierarchy | Initial COC requirement | Mandatory | No |
| COC-SUPP-001 | Hierarchy | Supplementary reference | Mandatory | No |
| COC-TEMP-001 | Hierarchy | Temporary validity | Mandatory | No |
| COC-VALID-001 | Hierarchy | Overall hierarchy | Mandatory | No |
| EARTH-001 | 8.4 | Earth resistance | Safety-Critical | **No** (text-pass accepted) |
| LOOP-001 | 8.5 | Earth loop impedance | Safety-Critical | **Yes** |
| INSUL-001 | 8.6 | Insulation resistance | Safety-Critical | **Yes** |
| RCD-001 | 8.8 | RCD protection | Safety-Critical | **Yes** |
| POL-001 | 8.7 | Polarity & continuity | Safety-Critical | No |
| PSCC-001 | 8.3 | Prospective short-circuit current | Safety-Critical | **Yes** |
| COND-001 | 7.2 | Conductor sizing | Mandatory | No |
| OCP-001 | 8.3 | Overcurrent protection | Mandatory | No |
| DOC-001 | 22 | Documentation & certification | Mandatory | No |
| CERT-DATE-001 | — | Certificate date (not future) | Mandatory | No |
| SIG-001 | — | Signature present | Mandatory | No |
| REG-001 | — | Issuer competency vs phases | Mandatory | No |
| CERT-INCOMPLETE-001 | — | Incomplete certificate sweep | Mandatory | No |

### 4.2 Earthing System (Clause 8.4) — EARTH-001

| System Type | Maximum Earth Resistance |
|-------------|-------------------------|
| TN-S | ≤ 1Ω |
| TN-C-S | ≤ 1Ω |
| TT | ≤ 20Ω (with RCD ≤30mA) or ≤ 100Ω (with RCD ≤100mA) |
| IT | Per design specification |

**Special Rule:** Text-based pass values (e.g., "Compliant", "Pass", "OK") are **accepted** for Earth Resistance. This aligns with common South African COC form practice.

### 4.3 Earth Loop Impedance (Clause 8.5) — LOOP-001

**Maximum Zs Values (Type B MCB at 0.4s disconnection):**

| MCB Rating | Max Zs (Ω) |
|------------|------------|
| 6A | 7.67 |
| 10A | 4.60 |
| 16A | 2.87 |
| 20A | 2.30 |
| 25A | 1.84 |
| 32A | 1.44 |
| 40A | 1.15 |
| 50A | 0.92 |
| 63A | 0.73 |

**Type C MCB:** multiply by 0.5. **Type D MCB:** multiply by 0.25.

**Empirical measurement required** — generic text like "OK" is rejected.

### 4.4 Insulation Resistance (Clause 8.6) — INSUL-001

| Circuit Voltage | Test Voltage | Minimum IR |
|-----------------|--------------|------------|
| SELV/PELV | 250V DC | ≥ 0.5MΩ |
| **≤ 500V** | **500V DC** | **≥ 1.0MΩ** |
| > 500V | 1000V DC | ≥ 1.0MΩ |

**Automatic Pass:** ∞, OL, >500, >999 (beyond meter range = excellent insulation).

**Empirical measurement required** — text values rejected.

> ⚠️ The 0.5MΩ threshold applies ONLY to SELV/PELV circuits. Standard ≤500V circuits require ≥1.0MΩ.

### 4.5 RCD Protection (Clause 8.8) — RCD-001

| Test Current | Maximum Trip Time |
|--------------|-------------------|
| 1× IΔn | ≤ 300ms |
| 2× IΔn | ≤ 150ms |
| 5× IΔn | ≤ 40ms |

**Empirical measurement required** — text values rejected.

### 4.6 Prospective Short-Circuit Current (Clause 8.3) — PSCC-001

- Extract PSCC value (kA) and breaker breaking capacity (kA)
- **PASS:** PSCC < breaker breaking capacity
- **FAIL:** PSCC ≥ breaker breaking capacity
- Default capacities: 6kA domestic, 10kA commercial

**Empirical measurement required** — text values rejected.

### 4.7 Polarity & Continuity (Clause 8.7) — POL-001

- All switches in phase conductor only
- Socket outlets: phase on right
- Protective conductor continuity: ≤ 1Ω
- Trusts AI extraction (text-based, not numeric threshold)

### 4.8 Issuer Competency — REG-001

- "Electrical Tester for Single Phase" (ETS) cannot sign off Three Phase installations
- Requires IE or MIE registration for Three Phase

### 4.9 Incomplete Certificate Detection — CERT-INCOMPLETE-001

Sweeps all empirical check IDs (EARTH-001, INSUL-001, RCD-001, LOOP-001, PSCC-001). If ≥3 are "Not Tested", marks the certificate as incomplete.

### 4.10 Overall Status Determination

```
PASS:
  ✓ COC hierarchy valid
  ✓ ALL safety-critical checks pass
  ✓ ALL mandatory checks pass (fewer than threshold failures)
  ✓ No critical failures

FAIL:
  ✗ COC hierarchy invalid, OR
  ✗ ANY safety-critical failure (≥ safety_critical_failures_for_fail), OR
  ✗ Mandatory failures ≥ mandatory_failures_for_fail

INCOMPLETE:
  ⚠ Missing ≥3 of 5 required empirical tests
```

### 4.11 Red Flags (Automatic FAIL)

**COC Hierarchy:**
- COC Type checkbox NOT ticked
- Supplementary/Temporary COC without Initial COC reference

**Technical:**
- Earth resistance > configurable threshold (default 5Ω) on any system type
- Any insulation resistance < configurable minimum (default 0.25MΩ)
- RCD no-trip at rated current
- Missing signature (completely blank signature block)
- Future-dated certificate
- PSCC exceeds breaker breaking capacity

### 4.12 Text-Pass Handling

The following text values are recognized as "pass" indicators:

```
compliant, pass, passed, satisfactory, ok, good, acceptable,
correct, verified, confirmed, yes, tick, ticked, ✓, ✔,
within limits, within range, safe, adequate
```

**Accepted for:** EARTH-001, POL-001, SIG-001  
**Rejected for (empirical required):** INSUL-001, RCD-001, LOOP-001, PSCC-001

---

## 5. Configuration System

### 5.1 Settings Table: `coc_validation_settings`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `earth_continuity_max_ohms` | numeric | 5.0 | Maximum earth continuity resistance (Ω) |
| `insulation_resistance_min_mohms` | numeric | 0.25 | Minimum insulation resistance (MΩ) |
| `rcd_trip_1x_max_ms` | integer | 300 | RCD trip time at 1×IΔn (ms) |
| `rcd_trip_5x_max_ms` | integer | 150 | RCD trip time at 5×IΔn (ms) |
| `rcd_trip_max_ms` | integer | 40 | RCD trip time at 2×IΔn (ms) |
| `ai_confidence_threshold_percent` | integer | 30 | Minimum confidence for valid results |
| `mandatory_failures_for_fail` | integer | 2 | # mandatory failures triggering FAIL |
| `safety_critical_failures_for_fail` | integer | 1 | # safety-critical failures triggering FAIL |
| `ai_model` | text | google/gemini-3-pro-preview | AI model for validation |
| `ai_temperature` | numeric | 0.1 | AI temperature setting |
| `hierarchy_check_enabled` | boolean | true | Enable COC hierarchy validation |
| `earth_continuity_check_enabled` | boolean | true | Enable earth continuity check |
| `insulation_resistance_check_enabled` | boolean | true | Enable insulation resistance check |
| `protective_conductor_check_enabled` | boolean | true | Enable polarity/continuity check |
| `certificate_date_validation_enabled` | boolean | true | Enable certificate date check |
| `rcd_function_check_enabled` | boolean | true | Enable RCD function check |
| `signature_check_enabled` | boolean | true | Enable signature verification |
| `auto_fail_future_dated` | boolean | true | Auto-fail future-dated certificates |
| `auto_fail_missing_signature` | boolean | true | Auto-fail missing signatures |
| `auto_fail_earth_resistance_threshold` | boolean | true | Auto-fail on earth > threshold |
| `auto_fail_missing_initial_ref` | boolean | true | Auto-fail Supp/Temp without Initial ref |
| `auto_fail_invalid_certificate` | boolean | true | Auto-fail invalid certificate format |

### 5.2 Preset Configurations

| Preset | Description | Key Differences |
|--------|-------------|-----------------|
| **Strict** | Maximum validation | 50% confidence, 1 mandatory failure = FAIL |
| **Standard** | Balanced (default) | 30% confidence, 2 mandatory failures = FAIL |
| **Relaxed** | Legacy systems | 20% confidence, 3 mandatory failures = FAIL |

### 5.3 Dynamic Prompt Generation

The `validate-coc` edge function builds prompts dynamically:
1. Fetches settings from `coc_validation_settings` or uses `testSettings` from request
2. Injects configurable thresholds into the AI prompt
3. Indicates which checks are enabled/disabled
4. Applies auto-fail rules during post-processing
5. Marks disabled checks as "Skipped" in results
6. Enforces confidence threshold — marks as Incomplete if below
7. Stores `settingsApplied` in `report_data` for audit

---

## 6. Database Schema & Status Mappings

### 6.1 Tables

#### `subsection_documents` (per-document COC data)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| subsection_id | UUID FK → subsections | |
| file_name | TEXT | Original filename |
| file_url | TEXT | Storage URL |
| coc_number | TEXT | Extracted COC certificate number |
| coc_type | TEXT | "Initial" \| "Supplementary" \| "Temporary" \| "Not Marked" |
| coc_status | TEXT | "approved" \| "rejected" \| "pending" |
| coc_issue_date | DATE | Certificate issue date |

#### `coc_validations` (audit trail)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| document_id | UUID UNIQUE FK → subsection_documents | |
| subsection_id | UUID FK → subsections | |
| status | TEXT | "Pass" \| "Fail" \| "Incomplete" \| "Error" |
| violations | JSONB | Array of critical failures |
| report_data | JSONB | Full validation report + settingsApplied |
| validated_at | TIMESTAMPTZ | |
| validated_by | UUID | User who triggered validation |

#### `subsections` (aggregated/best COC data)

| Column | Type | Description |
|--------|------|-------------|
| coc_number | TEXT | Best COC number for subsection |
| coc_type | TEXT | Approved COC type |
| coc_status | TEXT | "Approved" \| "Failed" \| "pending" \| "Missing" |
| coc_issue_date | DATE | Issue date of best COC |
| is_compliant | BOOLEAN | Overall compliance flag |

### 6.2 Status Value Mappings

**CRITICAL:** Different tables use different status values.

| Validation Result | `coc_validations.status` | `subsection_documents.coc_status` | `subsections.coc_status` |
|-------------------|--------------------------|-----------------------------------|--------------------------| 
| Pass | Pass | approved | Approved |
| Fail | Fail | rejected | Failed |
| Incomplete | Incomplete | pending | pending |
| Error | Error | pending | pending |

### 6.3 COC Type Value Mapping

| AI Output | `subsection_documents.coc_type` | `subsections.coc_type` |
|-----------|-------------------------------|----------------------|
| "Initial Certificate" | "Initial" | "Initial" |
| "Supplementary Certificate" | "Supplementary" | "Supplementary" |
| "Temporary" | "Temporary" | "Temporary" |

### 6.4 Subsection Priority for Update

When multiple documents exist, the "best" COC is shown on the subsection:

```typescript
const statusPriority = { 'Approved': 4, 'Failed': 3, 'pending': 2, 'Missing': 1 };

// Update subsection if:
// 1. Validation failed (always update to Failed — overrides Approved)
// 2. No current COC data
// 3. New priority > current priority
// 4. Same priority but newer date
```

### 6.5 `is_compliant` Determination

```
is_compliant = cocTypeMarked AND validationPassed AND hierarchyValid AND !hasCriticalFailures
```

---

## 7. Edge Functions API Reference

### 7.1 `validate-coc`

**Location:** `supabase/functions/validate-coc/index.ts`  
**Prompt:** `supabase/functions/validate-coc/prompt.ts`

#### Request

```typescript
{
  documentId: string;      // UUID of document in subsection_documents
  documentUrl: string;     // Signed URL to PDF
  subsectionId: string;    // UUID of parent subsection
  approvedCocType?: string; // User-approved COC type (overrides AI)
  testSettings?: object;   // Settings override for testing
}
```

#### Response

```typescript
{
  success: boolean;
  status: "Pass" | "Fail" | "Incomplete" | "Error";
  confidenceScore: number;     // 0-100
  documentQuality: string;     // "Excellent" | "Good" | "Fair" | "Poor"
  violations: CriticalFailure[];
  summary: ValidationSummary;
  checks: ValidationCheck[];
  administrativeDetails: AdminDetails;
  technicalEvaluation: TechnicalEval[];
  recommendations: string[];
  extractionNotes: string[];
  report: FullValidationReport;
  settingsApplied: object;
  skippedChecks: string[];
}
```

#### Invocation

```typescript
const { data, error } = await supabase.functions.invoke('validate-coc', {
  body: {
    documentId: 'uuid',
    documentUrl: 'https://signed-url',
    subsectionId: 'uuid',
    approvedCocType: 'Initial' // optional
  }
});
```

### 7.2 `extract-coc`

**Location:** `supabase/functions/extract-coc/index.ts`

#### Request

```typescript
{
  documentUrl: string;     // Signed URL to PDF
  fileName: string;        // Original filename
  retryFields?: string[];  // Optional: specific fields to re-extract
}
```

#### Response

```typescript
{
  success: boolean;
  data: {
    cocNumber: string | null;
    cocType: "Initial" | "Supplementary" | "Temporary" | "Not Marked";
    cocIssueDate: string | null;
    checkboxStates: { ... };
    administrativeDetails: { ... };
    testResults: { ... };
    confidence: "high" | "medium" | "low";
    extractionNotes: string[];
  };
}
```

### 7.3 Error Handling

| Error Code | Message | Action |
|------------|---------|--------|
| 400 | Missing required parameters | Fix request |
| 402 | Payment required | Add credits |
| 429 | Rate limit exceeded | Wait and retry |
| 500 | Internal error | Check logs, retry |

#### Fallback Result (AI parse failure)

```json
{
  "overallStatus": "Error",
  "confidenceScore": 0,
  "documentQuality": "Poor",
  "criticalFailures": [{
    "category": "Technical",
    "clause": "N/A",
    "description": "Failed to parse validation response",
    "immediateAction": "Please try validating the document again"
  }]
}
```

---

## 8. Post-Processing Logic

### 8.1 Checkbox States Validation & Override

After AI response, the server validates that `cocType` matches `checkboxStates`:

```javascript
// Priority: approvedCocType > checkboxStates > AI cocType
if (approvedCocType) {
  cocType = approvedCocType; // User override — highest priority
} else if (checkboxStates) {
  // Derive correct type from which box is MARKED
  if (initialMarked && !supplementaryMarked) correctType = 'Initial';
  else if (supplementaryMarked && !initialMarked) correctType = 'Supplementary';
  // Override if mismatch
  if (correctType !== aiCocType) cocType = correctType;
}
```

### 8.2 Initial COC Violation Filtering

**CRITICAL:** For Initial COCs, remove any incorrectly flagged "Missing Initial COC Reference" violations:

```javascript
if (cocType === 'initial') {
  // Filter out false-positive violations about missing Initial reference
  criticalFailures = criticalFailures.filter(f => 
    !f.description.includes('missing initial coc') &&
    !f.description.includes('does not reference')
  );
  
  // Update checks from Fail → Not Applicable
  checks = checks.map(c => 
    c.result === 'Fail' && c.description.includes('initial coc reference')
      ? { ...c, result: 'Not Applicable' }
      : c
  );
  
  // Recalculate overallStatus if no remaining failures
}
```

### 8.3 Hierarchy Field Override

After deterministic validation, the server overrides AI hierarchy fields:

- **Initial COC:** Force `hierarchyStatus = 'Valid'`, `initialCocValid = true`
- **Supplementary/Temporary:** Set based on deterministic engine result for COC-SUPP-001/COC-TEMP-001

### 8.4 Remediation & Notification Workflow

1. If `overallStatus` is "Fail": identify all checks with `result: "Fail"`
2. `criticalFailures` prioritized for immediate corrective action
3. Document status set to `rejected`, subsection `is_compliant = false`
4. System waits for re-upload or re-validation after correction

---

## 9. UI Components

### 9.1 SubsectionDetail.tsx

**Location:** `src/pages/SubsectionDetail.tsx`

- `handleExtractCocData()` — triggers validation for a document
- `handleApproveAndVerify()` — approves extraction and triggers validation
- Per-document COC data state management via `cocDataByDocument`

### 9.2 COCValidationReport.tsx

**Location:** `src/components/COCValidationReport.tsx`

- Executive summary with status badge
- Critical failures with remediation
- Technical evaluation grid
- PDF generation with cover page

### 9.3 COCPreviewApproval.tsx

**Location:** `src/components/COCPreviewApproval.tsx`

- Review extracted COC data before validation
- Re-extraction of specific fields
- Approve/Reject with `approvedCocType` parameter

### 9.4 COCComplianceRulesReference.tsx

**Location:** `src/components/COCComplianceRulesReference.tsx`

- Reference accordion showing 6-rule COC hierarchy
- See component file for current UI implementation

### 9.5 BulkCOCReportSave.tsx

**Location:** `src/components/BulkCOCReportSave.tsx`

- Bulk generation and saving of COC validation reports

### 9.6 UI Badge Colors

| Status | Color | Icon |
|--------|-------|------|
| Pass / Approved | Green | ✓ CheckCircle2 |
| Fail / Failed | Red | ✗ XCircle |
| Incomplete / Pending | Yellow | ⚠ AlertTriangle |
| Error | Gray | ⚠ AlertTriangle |

---

## 10. Test Cases

### 10.1 COC Type Detection

| Test Case | Expected cocType | Expected Check Results |
|-----------|------------------|------------------------|
| Initial checkbox marked | `Initial` | COC-SUPP-001: Not Applicable, COC-TEMP-001: Not Applicable |
| Supplementary marked + Initial ref | `Supplementary` | COC-SUPP-001: Pass |
| Supplementary marked + NO Initial ref | `Supplementary` | COC-SUPP-001: Fail |
| Temporary marked + Initial ref | `Temporary` | COC-TEMP-001: Pass |
| No checkbox marked | `null` | COC-TYPE-001: Fail |

### 10.2 Hierarchy Violation Filtering

| Test Case | Expected Behavior |
|-----------|-------------------|
| Initial COC with blank reference field | NO "Missing Initial Reference" violation |
| Supplementary COC with blank reference | Fail COC-SUPP-001 |
| Initial COC misidentified as needing reference | Post-processing removes false violation |

### 10.3 User-Approved COC Type Override

| Scenario | Expected Behavior |
|----------|-------------------|
| Extraction: "Initial", validation: "Supplementary", user approves "Initial" | User override wins |
| No approved type, AI checkboxStates contradict cocType | Server checkbox override |
| User approves "Initial" + AI generated "Missing Initial Reference" | Violation removed in post-processing |

### 10.4 Technical Validation

| Test Case | Check ID | Expected |
|-----------|----------|----------|
| Earth resistance = 0.5Ω (TN) | EARTH-001 | Pass |
| Earth resistance = 2.0Ω (TN) | EARTH-001 | Fail |
| Earth resistance = "Compliant" | EARTH-001 | Pass (text-pass accepted) |
| Insulation resistance = 500MΩ | INSUL-001 | Pass |
| Insulation resistance = 0.2MΩ | INSUL-001 | Fail (Critical) |
| Insulation resistance = "OK" | INSUL-001 | Fail (empirical required) |
| RCD trips at 250ms (1×IΔn) | RCD-001 | Pass |
| RCD trips at 400ms (1×IΔn) | RCD-001 | Fail |
| Loop impedance = "Pass" | LOOP-001 | Fail (empirical required) |
| PSCC 4.5kA vs 6kA breaker | PSCC-001 | Pass |
| PSCC 8kA vs 6kA breaker | PSCC-001 | Fail |
| Single Phase tester + Three Phase install | REG-001 | Fail |

### 10.5 System Integration

| Test Case | Check | Expected |
|-----------|-------|----------|
| Address fuzzy match ≥80% | SYS-ADDR-001 | Pass |
| Duplicate COC number | SYS-DUP-001 | Fail |

---

## 11. Sample I/O JSON

### 11.1 Sample Input (Structured Test Data)

See [`docs/coc-input-schema.json`](./coc-input-schema.json) for the full JSON Schema.

```json
{
  "cocNumber": "ECA-2024-001234",
  "cocType": "ECA",
  "installationType": "Domestic Single Phase",
  "premise": {
    "address": "123 Main Street, Johannesburg",
    "erfNumber": "ERF 456",
    "supplyType": "TN-S",
    "nominalVoltage": 230,
    "phases": 1
  },
  "registeredPerson": {
    "name": "John Smith",
    "registrationNumber": "ECA-12345",
    "registrationType": "Electrical Installation Contractor"
  },
  "testResults": {
    "earthResistance": { "measured": 0.85, "unit": "Ω" },
    "insulationResistance": {
      "circuit1": { "measured": 150, "unit": "MΩ", "testVoltage": 500 }
    },
    "earthLoopImpedance": {
      "mainIncomer": { "measured": 0.42, "unit": "Ω", "protectiveDevice": "40A Type B MCB", "maxPermitted": 1.15 }
    },
    "rcdTests": {
      "rcd1": { "ratedCurrent": 30, "tripTimeAt1x": 28, "tripTimeAt5x": 18 }
    }
  },
  "circuits": [
    { "circuitNumber": 1, "description": "Lighting", "cableSize": 1.5, "protectiveDevice": "16A Type B MCB", "load": 12 }
  ]
}
```

### 11.2 Sample Output — Pass

```json
{
  "cocNumber": "ECA-2024-001234",
  "overallStatus": "Pass",
  "checks": [
    {
      "checkId": "EARTH-001",
      "clause": "8.4",
      "description": "Earth resistance",
      "result": "Pass",
      "measuredValue": "0.85Ω",
      "limit": "≤ 5Ω",
      "category": "Safety-Critical"
    }
  ],
  "criticalFailures": [],
  "summary": { "totalChecks": 11, "passedChecks": 11, "failedChecks": 0 }
}
```

### 11.3 Sample Output — Fail

```json
{
  "cocNumber": "ECA-2024-005678",
  "overallStatus": "Fail",
  "checks": [
    {
      "checkId": "EARTH-001",
      "result": "Fail",
      "measuredValue": "2.3Ω",
      "limit": "≤ 1Ω (TN system)"
    },
    {
      "checkId": "RCD-001",
      "result": "Fail",
      "measuredValue": "450ms",
      "limit": "≤ 300ms @ 30mA"
    }
  ],
  "criticalFailures": [
    {
      "category": "Safety",
      "clause": "8.4",
      "description": "Earth resistance exceeds maximum",
      "reason": "Measured 2.3Ω exceeds 1Ω limit for TN-S system",
      "immediateAction": "Install additional earth electrodes"
    }
  ],
  "summary": { "totalChecks": 4, "passedChecks": 1, "failedChecks": 3 }
}
```

---

## 12. Input Schema Reference

The full JSON Schema for structured COC input data is maintained in:

📄 **[`docs/coc-input-schema.json`](./coc-input-schema.json)**

This schema defines the structure for submitting test data directly (bypassing PDF extraction). It covers: premise details, registered person, test results (earth, insulation, loop impedance, RCD, polarity, continuity, voltage drop), circuit schedule, and special conditions (generator, solar PV, battery, SPD).

---

## Appendix A: Environment Variables

| Variable | Purpose |
|----------|---------|
| `LOVABLE_API_KEY` | Authentication for Lovable AI Gateway |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |

## Appendix B: File Locations

| File | Purpose |
|------|---------|
| `supabase/functions/validate-coc/index.ts` | Runtime validation engine (source of truth) |
| `supabase/functions/validate-coc/prompt.ts` | VALIDATION_PROMPT + buildDynamicPrompt() |
| `supabase/functions/extract-coc/index.ts` | Data extraction edge function |
| `src/components/COCComplianceRulesReference.tsx` | UI hierarchy reference |
| `src/components/COCValidationReport.tsx` | Validation report display |
| `src/components/COCPreviewApproval.tsx` | Extraction review UI |
| `docs/coc-input-schema.json` | JSON Schema for structured input |

## Appendix C: Anti-Hallucination Rules

The AI prompt contains strict anti-hallucination rules (Rules 1-9) to prevent fabricated findings. Key principles:
- **Evidence-first:** Every failure must have directly visible evidence with exact quotes
- **No invention:** Never fabricate measurements, quotes, or technical details
- **Annexure caution:** Annexures are the #1 source of AI hallucination — only quote if visible
- **Signature tolerance:** Any mark in signature area = present (only fail if completely blank)
- **When in doubt, leave it out:** Fewer accurate findings > fabricated issues

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-09 | 3.0 | Consolidated from 3 separate docs into unified spec. Resolved earthing clause (8.4), COC expiry (never), IR threshold (1.0MΩ for ≤500V). Extracted prompt to prompt.ts. |
| 2026-01-16 | 1.1 | Added Configuration System (ENGINE_SPECIFICATION) |
| 2026-01-15 | 2.1 | Added approvedCocType parameter (COC_Val) |
| 2026-01-14 | 2.0 | Added post-processing logic (COC_Val) |
| 2026-01-13 | 1.0 | Initial specification documents |

---

*This specification is the single source of truth for COC validation documentation. Runtime logic lives in `supabase/functions/validate-coc/index.ts`. Update this document whenever the validation system changes.*
