

## Plan: Export COC Review Process Documentation

### Objective
Create a comprehensive markdown document in `docs/` that consolidates the complete Certificate of Compliance (COC) review process, including all stages, functions, rules, configurations, and database workflows. This will serve as a single reference point for understanding the entire COC validation pipeline.

### Document Structure

**File:** `docs/COC_REVIEW_PROCESS.md`

#### Sections to Include:

1. **Overview & System Architecture**
   - High-level description of the 6-stage pipeline
   - Architecture diagram (ASCII)
   - Technology stack (Gemini AI, Supabase Edge Functions, React UI)
   - Key principles: AI extraction → Human review → Deterministic validation

2. **Stage 1: Document Upload & Storage**
   - Supabase Storage bucket structure: `{subsectionId}/COC/{timestamp}-{filename}`
   - Database tables: `subsection_documents`, `site_documents`
   - File metadata tracking (uploaded_at, file_name, file_url)

3. **Stage 2: AI Extraction (`extract-coc` Edge Function)**
   - Two-pass extraction strategy (full + targeted retry)
   - Gemini model: `google/gemini-2.5-flash`
   - Page-specific prompts (PAGE_1_PROMPT, PAGE_2_PROMPT)
   - Checkbox detection logic for COC type (Initial/Supplementary/Temporary)
   - Extracted data structure (60+ fields)
   - Date validation and normalization
   - Confidence scoring
   - Database: `coc_extractions` table for caching

4. **Stage 3: Human-in-the-Loop Review (`COCPreviewApproval` component)**
   - PDF preview with zoom/pan controls
   - Editable field-by-field review
   - Re-extraction capabilities (single field or all missing fields)
   - Missing field detection
   - Approval workflow leading to validation

5. **Stage 4: Deterministic Validation (`validate-coc` Edge Function)**
   - **Model:** `google/gemini-3-pro-preview` (configured via `DEFAULT_SETTINGS`)
   - **Core Principle:** AI extracts, server-side rules decide pass/fail
   - **Configuration Source:** `coc_validation_settings` table
   
   **Rule Categories:**
   
   a) **Administrative Checks**
   - `COC-TYPE-001`: Checkbox must be marked
   - `COC-SUPP-001`: Supplementary must reference Initial COC
   - `COC-TEMP-001`: Temporary must reference Initial COC
   - `REG-001`: Issuer competency (e.g., Single Phase tester cannot certify Three Phase)
   - `CERT-DATE-001`: No future-dated certificates
   - `CERT-INCOMPLETE-001`: Minimum 70% of mandatory tests required
   
   b) **Safety-Critical Empirical Tests** (No text-based passes allowed)
   - `EARTH-001` (Clause 8.4): Earth resistance ≤ 5.0Ω (configurable, accepts TEXT_PASS like "Compliant")
   - `INSUL-001` (Clause 8.6): Insulation resistance ≥ 0.25MΩ (MUST be numeric or ∞)
   - `RCD-001` (Clause 8.8): RCD trip times (≤300ms @1x, ≤150ms @2x, ≤40ms @5x IΔn) (MUST be numeric)
   - `LOOP-001` (Clause 8.5): Earth loop impedance Zs using lookup table (MUST be numeric)
   - `PSCC-001`: Short-circuit current < breaker capacity (MUST be numeric)
   
   c) **Zs Lookup Table** (Type B MCB @ 0.4s)
   ```
   MCB Rating → Max Zs (Ω)
   6A  → 7.67  (Type C: 3.84, Type D: 1.92)
   10A → 4.60  (Type C: 2.30, Type D: 1.15)
   16A → 2.87  (Type C: 1.44, Type D: 0.72)
   20A → 2.30  (Type C: 1.15, Type D: 0.58)
   25A → 1.84  (Type C: 0.92, Type D: 0.46)
   32A → 1.44  (Type C: 0.72, Type D: 0.36)
   40A → 1.15  (Type C: 0.58, Type D: 0.29)
   50A → 0.92  (Type C: 0.46, Type D: 0.23)
   63A → 0.73  (Type C: 0.37, Type D: 0.18)
   ```
   
   d) **Value Parsing Logic**
   - Numeric extraction with SA comma-as-decimal support ("1,5" → 1.5)
   - `N/A` detection for non-applicable tests
   - `TEXT_PASS` detection (only valid for EARTH-001, POL-001, SIG-001)
   - Infinity symbols (∞, OL, >500MΩ) for insulation resistance
   
   e) **Overall Status Logic**
   - **Pass:** All safety-critical pass + hierarchy valid + <2 mandatory failures
   - **Fail:** Any safety-critical failure OR hierarchy violation OR 2+ mandatory failures
   - **Incomplete:** >30% missing test data

6. **Stage 5: Database Synchronization**
   - Updates to `subsection_documents` (coc_status, coc_number, coc_type, coc_issue_date)
   - Updates to `subsections` (coc_status, is_compliant)
   - Insert into `coc_validations` (status, violations[], report_data, settings snapshot)
   - Database trigger: `trg_sync_coc_compliance` auto-calculates `is_compliant`

7. **Stage 6: Post-Validation Workflows**
   - **Compliance Dashboard** (`ComplianceDashboard.tsx`): Displays stats, violations, trends
   - **Violation Overrides** (`InlineViolationOverrides.tsx`): Allows admins to override failed checks with audit trail
   - **Validation Log** (`COCValidationLogCard.tsx`): Historical view with filtering
   - **Compliance Calculations** (`complianceCalculations.ts`): 
     - `calculateCocComplianceStats()` - Single source of truth for compliance rates
     - `fetchFailedValidationsBySubsection()` - Retrieves latest validation status per subsection
     - `VALID_COC_STATUSES`: ['Approved', 'Valid', 'Pass']
     - `FAILED_VALIDATION_STATUSES`: ['Fail', 'Failed', 'Incomplete']

8. **Configuration & Settings**
   - Table: `coc_validation_settings`
   - Configurable thresholds (earth_continuity_max_ohms, insulation_min_megohms, etc.)
   - AI model selection and temperature
   - Enabled/disabled check toggles
   - Confidence threshold for extraction
   - Auto-fail behavior toggles

9. **User Interface Routes**
   - Main site: `/clients/{clientId}/sites/{siteId}` → Documents tab
   - Subsection COC: `/clients/{clientId}/sites/{siteId}/subsections/{subsectionId}` → COC-Metering tab
   - Public review: `/public/subsection-review/:token` (visitor gated)

10. **Technical Reference**
    - Edge function endpoints
    - Database schema for `coc_extractions`, `coc_validations`, `subsection_documents`
    - Related files map
    - SANS 10142-1:2020 clause mappings

11. **Related Documentation**
    - Link to `COC_VALIDATION_SPEC.md` (unified rules specification)
    - Link to `COC_TEST_FRAMEWORK.md` (testing scenarios)
    - Link to `coc-input-schema.json` (data structure)
    - Link to `AI_MODEL_CONFIGURATION.md` (model details)

### Content Sources
- Extract code logic from `supabase/functions/extract-coc/index.ts`
- Extract validation rules from `supabase/functions/validate-coc/index.ts`
- Reference UI workflows from `src/components/COCPreviewApproval.tsx`, `src/components/ComplianceDashboard.tsx`
- Include compliance calculation logic from `src/lib/complianceCalculations.ts`
- Reference existing docs: `COC_VALIDATION_SPEC.md`, `COC_TEST_FRAMEWORK.md`

### Document Characteristics
- Clear section headers with emojis for visual navigation
- Code snippets for key algorithms (Zs lookup, value parsing)
- Table formats for lookup values and status logic
- ASCII diagrams for pipeline flow
- Cross-references to related documentation
- Technical accuracy matching actual implementation
- Suitable for both developers and technical stakeholders

### Deliverable
A single comprehensive markdown file that serves as the definitive reference for the entire COC review system, from upload to compliance reporting.

