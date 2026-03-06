

# Plan: Upgrade COC Validation Engine Based on AI Builder Process Specification

## Analysis Summary

The uploaded `COC_AI_Builder_Process.md` defines a stricter, legally-grounded validation philosophy. Comparing it against the current `validate-coc` edge function reveals several critical gaps where the current engine is too lenient or missing checks entirely.

## Key Gaps Identified

### 1. TEXT_PASS Acceptance is Legally Wrong (Critical)
The uploaded doc explicitly states: *"You must automatically reject generic marks like 'OK', 'Pass', or checkmarks when numerical values are legally required."*

**Current code does the opposite** — it accepts "Compliant", "Pass", "OK", "Satisfactory" as valid passes for Earth Resistance, Insulation Resistance, and RCD Trip Times via `TEXT_PASS_VALUES`. This is the single biggest compliance gap. For empirical measurement fields (IR, Zs, RCD trip time), the law requires actual numbers.

**Fix:** `TEXT_PASS` should only be accepted for non-empirical checks (Polarity, Continuity status). For empirical fields (EARTH-001, INSUL-001, RCD-001, LOOP-001), `TEXT_PASS` must result in `Fail` with a clear message: "Empirical measurement required — generic text like 'OK' or 'Pass' is not legally acceptable."

### 2. Missing Deterministic Checks (LOOP-001, COND-001, OCP-001)
The AI prompt defines Earth Loop Impedance (LOOP-001), Conductor Sizing (COND-001), and Overcurrent Protection (OCP-001), but the deterministic engine only enforces EARTH-001, INSUL-001, RCD-001, POL-001, SIG-001, COC-TYPE, Hierarchy, and Date. LOOP-001 with MCB-rating-specific Zs limits is entirely missing from server-side enforcement.

**Fix:** Add LOOP-001 to the deterministic engine with the Zs lookup table from the uploaded doc (6A→7.67Ω, 10A→4.60Ω, 16A→2.87Ω, etc.). COND-001 and OCP-001 can remain AI-informational for now since they require circuit schedule cross-referencing.

### 3. Insulation Resistance Threshold Discrepancy
The uploaded doc specifies ≥ 1.0MΩ for circuits ≤500V (the standard circuit voltage). The current default is 0.25MΩ. While 0.25MΩ is technically the absolute minimum in SANS, the uploaded spec argues for the stricter 1.0MΩ threshold per the standard test voltage tables.

**Fix:** Update the AI prompt's insulation resistance section to align with the uploaded doc's voltage-dependent thresholds. The configurable database setting remains at 0.25MΩ as a minimum, but the prompt should instruct the AI to flag values between 0.25–1.0MΩ as warnings.

### 4. Incomplete Certificate Rule Missing
The uploaded doc states: *"If any mandatory instrumental test field is missing or marked null, instantly flag as FAIL — Incomplete Certificate."*

The current engine treats missing test values as "Not Tested" which does not trigger a fail. This is too lenient.

**Fix:** Add an "Incomplete Certificate" sweep after all deterministic checks. Count how many of the core empirical checks (EARTH-001, INSUL-001, RCD-001, LOOP-001) returned "Not Tested" or had null values. If any mandatory test is missing, set status to `Incomplete` (which the current engine already supports but underuses).

### 5. Issuer Competency Check Missing
The uploaded doc requires verifying the issuer's registration category (Electrical Tester for Single Phase, IE, MIE) against the installation type. A Single Phase tester signing off a 3-phase commercial installation should be flagged.

**Fix:** Add a new check `REG-001` to the AI prompt requesting extraction of registration type and supply phases. The deterministic engine can then cross-reference: if `supplyPhases === 'Three'` and `registrationType === 'Electrical Tester for Single Phase'`, flag as Fail.

### 6. AI Prompt Improvements from Uploaded Doc
Several prompt refinements from the uploaded doc are superior to the current prompt:
- **Standardization rules**: "Convert '1,5 Meg' to '1.5'" — explicit numeric normalization guidance
- **Handwriting recognition guidance**: Specific electrical unit symbols to watch for
- **QR Code extraction**: Extract embedded URL data if present (informational)

## Implementation Plan

### Step 1: Fix TEXT_PASS for Empirical Fields
Modify `applyDeterministicValidation()` in `validate-coc/index.ts`:
- For EARTH-001, INSUL-001, RCD-001: Change `TEXT_PASS` from `Pass` to `Fail` with remediation message about empirical measurement requirement
- For POL-001, SIG-001: Keep `TEXT_PASS` as acceptable (these are non-empirical)

### Step 2: Add LOOP-001 Deterministic Check
Add Earth Loop Impedance check with MCB Zs lookup table:
- Extract MCB rating and measured Zs from AI checks
- Compare against the Type B MCB table (with Type C ×0.5 and Type D ×0.25 multipliers)
- Fail if Zs exceeds maximum for the device rating

### Step 3: Add Incomplete Certificate Detection
After all deterministic checks, count core empirical checks with `Not Tested` / null:
- If ≥1 mandatory empirical test is missing → set overallStatus to `Incomplete`
- Add `CERT-INCOMPLETE-001` check to results

### Step 4: Add REG-001 Issuer Competency Check
- Add to AI prompt: extract `registrationType` and `supplyPhases`
- Deterministic check: Single Phase tester + Three Phase installation = Fail

### Step 5: Update AI Prompt
- Add numeric normalization instructions from the uploaded doc
- Add explicit "reject 'OK'/'Pass' for empirical fields" instruction to the prompt (reinforcing the server-side enforcement)
- Add PSCC extraction request (informational, not deterministic yet)
- Add handwriting recognition guidance for electrical units

### Step 6: Update Extraction Notes
- Add audit trail entries for each deterministic override (already partially done)
- Add "Incomplete Certificate" notation when detected

## Files to Modify
- `supabase/functions/validate-coc/index.ts` — All changes in this single file (prompt + deterministic engine)

## What This Does NOT Change
- Database schema (no migrations needed)
- UI components (they already handle all status types)
- COC expiry policy (keeping the existing "COCs don't expire" stance since it matches the current prompt and settings; expiry is configurable via settings)
- Extract-coc function (unchanged)

