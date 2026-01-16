# COC Verification Engine Specification

**Document Version:** 1.1  
**Last Updated:** 2026-01-16  
**Status:** Active  
**Owner:** Watson Mattheus Electrical Compliance

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Data Flow](#3-data-flow)
4. [Edge Functions](#4-edge-functions)
5. [Database Schema](#5-database-schema)
6. [Validation Rules (SANS 10142-1:2020)](#6-validation-rules-sans-10142-12020)
7. [UI Components](#7-ui-components)
8. [Status Mappings](#8-status-mappings)
9. [Error Handling](#9-error-handling)
10. [Change Log](#10-change-log)

---

## 1. Overview

### 1.1 Purpose

The COC Verification Engine is an AI-powered system that:
- **Extracts** data from uploaded Electrical Certificate of Compliance (COC) PDF documents
- **Validates** the extracted data against SANS 10142-1:2020 electrical standards
- **Reports** compliance status with detailed checks and remediation guidance
- **Stores** validation results for audit trails and compliance reporting

### 1.2 Key Features

| Feature | Description |
|---------|-------------|
| **PDF Vision Analysis** | Uses Google Gemini AI models with vision capabilities to read PDF documents |
| **SANS 10142-1:2020 Compliance** | Full validation against South African electrical standards |
| **COC Hierarchy Validation** | Validates Initial/Supplementary/Temporary COC relationships |
| **Per-Document Storage** | Each document stores its own extracted COC data independently |
| **Best COC Selection** | Subsection shows the "best" (most recent, highest priority) COC |
| **Audit Trail** | Complete validation history stored in `coc_validations` table |

### 1.3 Supported Document Types

- **PDF** (primary): Uses vision models for accurate extraction
- **Images** (JPG, PNG, WebP): Supported via vision models
- **Text files**: Fallback text extraction

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ SubsectionDetail│  │ COCValidation   │  │ COCComplianceRules      │  │
│  │ Page            │  │ Report          │  │ Reference               │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────┘  │
│           │                    │                                         │
│           ▼                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    "Verify COC" Button Click                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EDGE FUNCTIONS                                   │
│                                                                          │
│  ┌───────────────────┐         ┌───────────────────────────────────┐    │
│  │   extract-coc     │         │         validate-coc              │    │
│  │                   │         │                                   │    │
│  │ • Download PDF    │         │ • Download PDF                    │    │
│  │ • Vision Analysis │         │ • Vision Analysis                 │    │
│  │ • Extract Data    │         │ • SANS 10142-1 Validation         │    │
│  │ • Return JSON     │         │ • Store Results in DB             │    │
│  │                   │         │ • Update Document & Subsection    │    │
│  │ Model: Gemini 2.5 │         │ Model: Gemini 3 Pro Preview       │    │
│  │         Pro       │         │                                   │    │
│  └───────────────────┘         └───────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          SUPABASE DATABASE                               │
│                                                                          │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐    │
│  │   subsections     │  │ subsection_docs   │  │  coc_validations  │    │
│  │                   │  │                   │  │                   │    │
│  │ • coc_number      │  │ • coc_number      │  │ • document_id     │    │
│  │ • coc_type        │  │ • coc_type        │  │ • status          │    │
│  │ • coc_status      │  │ • coc_status      │  │ • violations      │    │
│  │ • coc_issue_date  │  │ • coc_issue_date  │  │ • report_data     │    │
│  │                   │  │                   │  │ • validated_at    │    │
│  │ (Best COC shown)  │  │ (Per-doc data)    │  │ (Full audit)      │    │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Complete Verification Flow

```
1. USER clicks "Verify COC" button on a document
         │
         ▼
2. handleExtractCocData() in SubsectionDetail.tsx
   │
   ├── Sets validatingDocId (loading state)
   │
   └── Calls validate-coc edge function
         │
         ▼
3. validate-coc Edge Function
   │
   ├── 3.1 Parse request (documentId, documentUrl, subsectionId)
   │
   ├── 3.2 Download PDF from Supabase Storage
   │        └── Extract storage path from signed URL
   │
   ├── 3.3 Convert PDF to base64 for vision processing
   │
   ├── 3.4 Call Lovable AI Gateway (Gemini 3 Pro Preview)
   │        └── Send PDF + VALIDATION_PROMPT
   │
   ├── 3.5 Parse AI JSON response
   │        ├── Extract: cocNumber, cocType, cocIssueDate
   │        ├── Extract: overallStatus (Pass/Fail/Incomplete)
   │        ├── Extract: checks[] with clause-level results
   │        └── Extract: criticalFailures[] with remediation
   │
   ├── 3.6 Update subsection_documents table
   │        └── Store per-document: coc_number, coc_type, coc_status, coc_issue_date
   │
   ├── 3.7 Conditionally update subsections table
   │        └── Only if this COC is "better" than existing (priority logic)
   │
   └── 3.8 Upsert into coc_validations table
         └── Full report_data for audit trail
         │
         ▼
4. UI Updates
   │
   ├── Toast notification with result
   ├── Refresh cocValidations state
   ├── Show validation badge on document
   └── Display violations inline if failed
```

### 3.2 Extraction-Only Flow (extract-coc)

Used when only data extraction is needed without full validation:

```
1. USER triggers extraction
         │
         ▼
2. extract-coc Edge Function
   │
   ├── Download PDF
   ├── Call Gemini 2.5 Pro with EXTRACTION_PROMPT
   ├── Parse response (no DB updates)
   └── Return extracted JSON to client
         │
         ▼
3. Client handles data
   └── Populate form fields or preview
```

---

## 4. Edge Functions

### 4.1 validate-coc Function

**Location:** `supabase/functions/validate-coc/index.ts`  
**Purpose:** Full SANS 10142-1:2020 validation with database updates

#### Input Parameters

```typescript
{
  documentId: string;     // UUID of the document in subsection_documents
  documentUrl: string;    // Signed URL to the PDF in storage
  subsectionId: string;   // UUID of the parent subsection
}
```

#### Output Response

```typescript
{
  success: boolean;
  status: "Pass" | "Fail" | "Incomplete" | "Error";
  confidenceScore: number;     // 0-100
  documentQuality: string;     // "Excellent" | "Good" | "Fair" | "Poor"
  violations: CriticalFailure[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    notTested: number;
    notApplicable: number;
    criticalFailures: number;
  };
  checks: Check[];
  administrativeDetails: {...};
  technicalEvaluation: [...];
  recommendations: string[];
  extractionNotes: string[];
  report: FullValidationReport;
}
```

#### AI Model Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Model | `google/gemini-3-pro-preview` | Best vision capabilities for complex documents |
| Temperature | `0.1` | Low for consistent, accurate validation |
| System Prompt | `VALIDATION_PROMPT` | ~500 lines of SANS 10142-1 rules |

### 4.2 extract-coc Function

**Location:** `supabase/functions/extract-coc/index.ts`  
**Purpose:** Data extraction without validation

#### Input Parameters

```typescript
{
  documentUrl: string;   // Signed URL to the PDF
  fileName: string;      // Original filename for format detection
}
```

#### Output Response

```typescript
{
  success: boolean;
  extractedData: {
    cocNumber: string;
    cocType: "Initial Certificate" | "Supplementary Certificate";
    cocIssueDate: string;  // YYYY-MM-DD
    administrativeDetails: {...};
    testResults: {...};
    // ... full extraction schema
  };
  model: string;  // Model used for extraction
}
```

#### AI Model Configuration

| Format | Model | Rationale |
|--------|-------|-----------|
| PDF | `google/gemini-2.5-pro` | Best visual document analysis |
| Text | `google/gemini-2.5-flash` | Fast text processing |

---

## 5. Database Schema

### 5.1 Tables Involved

#### subsections (summary view)
```sql
coc_number        TEXT      -- Best/latest COC number
coc_type          TEXT      -- 'Initial' | 'Supplementary' | 'Temporary'
coc_status        TEXT      -- 'Approved' | 'Failed' | 'pending' | 'Missing'
coc_issue_date    DATE      -- Date of best COC
```

#### subsection_documents (per-document)
```sql
id                UUID PRIMARY KEY
subsection_id     UUID REFERENCES subsections(id)
file_name         TEXT
file_url          TEXT
category_id       UUID REFERENCES document_categories(id)
uploaded_at       TIMESTAMP
coc_number        TEXT      -- This document's COC number
coc_type          TEXT      -- 'initial' | 'supplementary' (lowercase)
coc_status        TEXT      -- 'pending' | 'approved' | 'rejected'
coc_issue_date    DATE      -- This document's issue date
```

#### coc_validations (audit trail)
```sql
id                UUID PRIMARY KEY
document_id       UUID UNIQUE REFERENCES subsection_documents(id)
subsection_id     UUID REFERENCES subsections(id)
status            TEXT      -- 'Pass' | 'Fail' | 'Incomplete' | 'Error'
violations        JSONB     -- Array of critical failures
report_data       JSONB     -- Full validation report
validated_at      TIMESTAMP
validated_by      UUID      -- User who triggered validation
created_at        TIMESTAMP
```

### 5.2 Status Value Mapping

**CRITICAL:** Different tables use different status values due to database constraints.

| Table | Field | Allowed Values |
|-------|-------|----------------|
| subsections | coc_status | `Approved`, `Failed`, `pending`, `Missing` |
| subsection_documents | coc_status | `pending`, `approved`, `rejected` |
| coc_validations | status | `Pass`, `Fail`, `Incomplete`, `Error` |

#### Mapping Logic (in validate-coc)

```typescript
// Subsection status mapping
const subsectionStatusMap = {
  'Pass': 'Approved',
  'Fail': 'Failed',
  'Incomplete': 'pending',
  'Error': 'pending'
};

// Document status mapping
const documentStatusMap = {
  'Pass': 'approved',
  'Fail': 'rejected',
  'Incomplete': 'pending',
  'Error': 'pending'
};
```

### 5.3 COC Type Value Mapping

| Source Value | subsections.coc_type | subsection_documents.coc_type |
|--------------|----------------------|-------------------------------|
| "Initial Certificate" | "Initial" | "initial" |
| "Supplementary Certificate" | "Supplementary" | "supplementary" |
| "Temporary" | "Temporary" | "initial" (fallback) |

---

## 6. Validation Rules (SANS 10142-1:2020)

### 6.1 COC Hierarchy Rules (Execute First)

| Check ID | Rule | Severity |
|----------|------|----------|
| COC-INIT-001 | Every premises MUST have a valid Initial COC | Critical |
| COC-SUPP-001 | Supplementary COC must reference Initial COC number | Critical |
| COC-TEMP-001 | Temporary COC must reference Initial COC and have validity period | Critical |
| COC-VALID-001 | Overall hierarchy must be valid | Critical |

#### Hierarchy Validation Flow

```
1. Identify COC Type → Initial / Supplementary / Temporary
2. If Initial → Validate status (valid/expired/revoked)
3. If Supplementary/Temporary → Confirm Initial COC reference exists
4. Validate Initial COC reference is legitimate and not expired
5. For Temporary: Check validity period has not elapsed
6. Confirm scope aligns with Initial COC baseline
7. Return compliance status with clause-specific reasoning
```

### 6.2 Technical Checks

#### Earthing System (Clause 8.4) - EARTH-001
| System Type | Maximum Earth Resistance |
|-------------|-------------------------|
| TN-S | ≤ 1Ω |
| TN-C-S | ≤ 1Ω |
| TT | ≤ 20Ω (with RCD ≤30mA) or ≤ 100Ω (with RCD ≤100mA) |

#### Earth Loop Impedance (Clause 8.5) - LOOP-001
| MCB Rating | Max Zs (Type B, 0.4s) |
|------------|----------------------|
| 6A | 7.67Ω |
| 10A | 4.60Ω |
| 16A | 2.87Ω |
| 20A | 2.30Ω |
| 32A | 1.44Ω |
| 63A | 0.73Ω |

#### Insulation Resistance (Clause 8.6) - INSUL-001
| Circuit Voltage | Test Voltage | Minimum IR |
|-----------------|--------------|------------|
| SELV/PELV | 250V DC | ≥ 0.5MΩ |
| ≤ 500V | 500V DC | ≥ 1.0MΩ |
| > 500V | 1000V DC | ≥ 1.0MΩ |

#### RCD Protection (Clause 8.8) - RCD-001
| Test Current | Maximum Trip Time |
|--------------|-------------------|
| 1× IΔn | ≤ 300ms |
| 2× IΔn | ≤ 150ms |
| 5× IΔn | ≤ 40ms |

### 6.3 Administrative Checks

| Check ID | Requirement | Severity |
|----------|-------------|----------|
| DOC-001 | COC issued by DOL-registered person | Mandatory |
| CERT-DATE-001 | Issue date not in future | Mandatory |
| CERT-EXPIRY-001 | Certificate not expired (2yr commercial, 5yr domestic) | Mandatory |

### 6.4 Overall Status Determination

```
PASS:
  ✓ COC hierarchy valid
  ✓ ALL safety-critical checks pass
  ✓ ALL mandatory checks pass
  ✓ No critical failures

FAIL:
  ✗ COC hierarchy invalid, OR
  ✗ ANY safety-critical failure, OR
  ✗ 2+ mandatory failures

INCOMPLETE:
  ⚠ Missing >30% of required test data
```

### 6.5 Red Flags (Automatic FAIL)

**COC Hierarchy:**
- Supplementary COC without Initial COC reference
- Temporary COC without Initial COC reference
- Expired Initial COC
- Temporary COC past validity period

**Technical:**
- Earth resistance > 5Ω on any system type
- Any insulation resistance < 0.25MΩ
- RCD no-trip at rated current
- Missing signature or registration number
- Future-dated certificate

---

## 7. UI Components

### 7.1 SubsectionDetail.tsx

**Location:** `src/pages/SubsectionDetail.tsx`  
**Relevant Lines:** ~2900-3100 (Documents tab)

#### Key Functions

```typescript
// Trigger validation for a document
handleExtractCocData(docId: string, fileUrl: string, fileName: string)

// Get/update per-document COC data
getDocCocData(docId: string): { cocType, cocStatus, cocNumber, cocIssueDate }
updateDocCocData(docId: string, field: string, value: string)

// Save document COC data to database
handleSaveDocumentCocData(docId: string)
```

#### State Management

```typescript
// Track COC data per document (not shared)
const [cocDataByDocument, setCocDataByDocument] = useState<Record<string, {
  cocType: string;
  cocStatus: string;
  cocNumber: string;
  cocIssueDate: string;
}>>({});

// Validation results per document
const [cocValidations, setCocValidations] = useState<Record<string, any>>({});

// Loading state for validation
const [validatingDocId, setValidatingDocId] = useState<string | null>(null);
```

### 7.2 COCValidationReport.tsx

**Location:** `src/components/COCValidationReport.tsx`  
**Purpose:** Displays full validation results with PDF export

#### Features
- Executive summary with status badge
- Critical failures list with remediation
- Administrative completeness table
- Technical evaluation grid
- Recommendations list
- PDF generation with cover page

### 7.3 COCComplianceRulesReference.tsx

**Location:** `src/components/COCComplianceRulesReference.tsx`  
**Purpose:** Reference accordion showing all SANS 10142-1 rules

#### Sections
1. COC Types & Hierarchy
2. Technical Check Requirements
3. Administrative Requirements
4. Non-Compliance Conditions
5. Validation Engine Process
6. Output & Reporting

---

## 8. Status Mappings

### 8.1 UI Display Badges

| Status | Badge Color | Icon |
|--------|-------------|------|
| Pass / Approved | Green | ✓ CheckCircle |
| Fail / Failed / rejected | Red | ✗ XCircle |
| Incomplete / pending | Yellow | ⚠ AlertTriangle |
| Error | Gray | ⚠ AlertTriangle |

### 8.2 Priority for Subsection Update

When multiple documents exist, the "best" COC is shown on the subsection:

```typescript
const statusPriority = {
  'valid': 4,
  'Approved': 4,
  'invalid': 3,
  'Failed': 3,
  'pending': 2,
  'Missing': 1,
  '': 0
};

// Update subsection if:
// 1. No current COC data
// 2. New priority > current priority
// 3. Same priority but newer issue date
```

---

## 9. Error Handling

### 9.1 Edge Function Errors

| Error | Status Code | User Message |
|-------|-------------|--------------|
| Rate limit exceeded | 429 | "Rate limit exceeded. Please try again later." |
| Payment required | 402 | "Payment required. Please add credits to your Lovable AI workspace." |
| PDF parsing failed | 500 | "Failed to parse validation response" |
| Download failed | 500 | "Failed to download document" |
| Missing parameters | 400 | "Missing required parameters" |

### 9.2 Fallback Validation Result

If AI response cannot be parsed:

```typescript
{
  overallStatus: 'Error',
  confidenceScore: 0,
  documentQuality: 'Poor',
  criticalFailures: [{
    category: 'Technical',
    clause: 'N/A',
    description: 'Failed to parse validation response',
    reason: 'The AI response could not be interpreted as valid JSON',
    immediateAction: 'Please try validating the document again',
    riskLevel: 'Medium'
  }]
}
```

---

## 10. Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-16 | 1.1 | Added Configuration System with database-driven settings, dynamic AI prompt generation, and enhanced test validation UI | System |
| 2026-01-13 | 1.0 | Initial specification document | System |

### Pending Improvements

- [ ] Add "Re-extract All" batch function
- [ ] Show raw extracted vs validated data comparison
- [x] Add manual override capability for AI errors
- [ ] Implement document versioning for re-validations
- [ ] Add email notifications for failed validations
- [x] Integrate validation settings with edge function
- [x] Add settings audit trail to report_data

---

## 11. Configuration System

### 11.1 Settings Table Schema

**Table:** `coc_validation_settings`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `earth_continuity_max_ohms` | numeric | 5.0 | Maximum earth continuity resistance (Ω) |
| `insulation_resistance_min_mohms` | numeric | 0.25 | Minimum insulation resistance (MΩ) |
| `rcd_trip_1x_max_ms` | integer | 300 | RCD trip time at 1×IΔn (ms) |
| `rcd_trip_5x_max_ms` | integer | 150 | RCD trip time at 5×IΔn (ms) - SANS default |
| `rcd_trip_max_ms` | integer | 40 | RCD trip time at 2×IΔn (ms) |
| `ai_confidence_threshold_percent` | integer | 30 | Minimum confidence for valid results |
| `mandatory_failures_for_fail` | integer | 2 | # mandatory failures triggering FAIL |
| `safety_critical_failures_for_fail` | integer | 1 | # safety-critical failures triggering FAIL |
| `ai_model` | text | google/gemini-3-pro-preview | AI model for validation |
| `ai_temperature` | numeric | 0.1 | AI temperature setting |
| `hierarchy_check_enabled` | boolean | true | Enable COC hierarchy validation |
| `earth_continuity_check_enabled` | boolean | true | Enable earth continuity check |
| `insulation_resistance_check_enabled` | boolean | true | Enable insulation resistance check |
| `protective_conductor_check_enabled` | boolean | true | Enable protective conductor check |
| `certificate_date_validation_enabled` | boolean | true | Enable certificate date check |
| `rcd_function_check_enabled` | boolean | true | Enable RCD function check |
| `signature_check_enabled` | boolean | true | Enable signature verification |
| `auto_fail_future_dated` | boolean | true | Auto-fail future-dated certificates |
| `auto_fail_missing_signature` | boolean | true | Auto-fail missing signatures |
| `auto_fail_earth_resistance_threshold` | boolean | true | Auto-fail on earth > threshold |
| `auto_fail_missing_initial_ref` | boolean | true | Auto-fail Supp/Temp without Initial ref |
| `auto_fail_invalid_certificate` | boolean | true | Auto-fail invalid certificate format |

### 11.2 Preset Configurations

| Preset | Description | Key Differences |
|--------|-------------|-----------------|
| **Strict** | Maximum validation | 50% confidence, 1 mandatory failure = FAIL |
| **Standard** | Balanced (default) | 30% confidence, 2 mandatory failures = FAIL |
| **Relaxed** | Legacy systems | 20% confidence, 3 mandatory failures = FAIL |

### 11.3 Dynamic Prompt Generation

The `validate-coc` edge function now builds prompts dynamically:
1. Fetches settings from `coc_validation_settings` or uses `testSettings` from request
2. Injects configurable thresholds into the AI prompt
3. Indicates which checks are enabled/disabled
4. Applies auto-fail rules during post-processing
5. Marks disabled checks as "Skipped" in results
6. Enforces confidence threshold - marks as Incomplete if below
7. Stores `settingsApplied` in `report_data` for audit

### 11.4 API Request Parameters

**`validate-coc` Edge Function Request Body:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentId` | string | Yes | UUID of the document to validate |
| `documentUrl` | string | Yes | Signed URL or public URL of the document |
| `subsectionId` | string | Yes | UUID of the subsection |
| `approvedCocType` | string | No | User-approved COC type (overrides AI detection) |
| `testSettings` | object | No | Settings object for test validation (overrides database settings) |

### 11.5 Response Fields

**New fields in validation response:**

| Field | Type | Description |
|-------|------|-------------|
| `skippedChecks` | string[] | List of check names that were disabled |
| `settingsApplied` | object | Complete settings used during validation |
| `settingsApplied.ai_confidence_threshold_percent` | number | Confidence threshold that was applied |

---

## Appendix A: Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `LOVABLE_API_KEY` | Authentication for Lovable AI Gateway |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for admin operations |

## Appendix B: AI Prompt Locations

| Prompt | File | Line Range |
|--------|------|------------|
| VALIDATION_PROMPT | validate-coc/index.ts | 11-569 |
| buildDynamicPrompt() | validate-coc/index.ts | 627-666 |
| EXTRACTION_PROMPT | extract-coc/index.ts | 48-391 |

---

*This specification should be updated whenever changes are made to the COC verification system.*
