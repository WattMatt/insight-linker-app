# ⚡ Electrical COC Verification Engine Documentation

## Overview

The COC Verification Engine is an AI-driven system that validates Electrical Certificates of Compliance (COC) against SANS 10142-1:2020 standards. It provides clause-level verification with clear PASS/FAIL outcomes, remediation guidance, and audit trails.

---

## SANS 10142-1 Clause Reference

### Mandatory Safety-Critical Checks

| Check ID | Clause | Description | Threshold | Category |
|----------|--------|-------------|-----------|----------|
| EARTH-001 | 7.4 | Earth continuity & resistance | ≤ 1Ω (TN), ≤ 100Ω (TT) | Safety-Critical |
| COND-001 | 7.2 | Conductor sizing | Per load calculation | Mandatory |
| OCP-001 | 8.3 | Overcurrent protection | Device rated, Zs compliant | Safety-Critical |
| INSUL-001 | 8.6 | Insulation resistance | ≥ 0.5MΩ (≤500V), ≥ 1MΩ (>500V) | Safety-Critical |
| POL-001 | 8.7 | Polarity & continuity | Correct connections, ≤ 0.5Ω | Safety-Critical |
| RCD-001 | 8.8 | RCD functional test | ≤ 300ms @ IΔn, ≤ 40ms @ 5×IΔn | Safety-Critical |
| LOOP-001 | 8.5 | Earth loop impedance | Zs ≤ Zs(max) for device | Safety-Critical |
| DOC-001 | 22 | Certification & documentation | Valid registration, complete records | Mandatory |

### Additional Verification Checks

| Check ID | Clause | Description | Applicability |
|----------|--------|-------------|---------------|
| SPD-001 | 28 | Surge protection devices | If installed |
| GEN-001 | 26 | Generator integration | If generator present |
| INV-001 | 27 | Inverter systems | If solar/battery system |
| BAT-001 | 31 | Battery storage | If battery system present |
| VD-001 | 10 | Voltage drop verification | Max 253V @ load |

---

## Sample JSON Input (Structured Test Data)

When you have structured test data from inspection instruments, you can submit it directly:

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
    "idNumber": "7801015800080",
    "registrationNumber": "ECA-12345",
    "registrationType": "Electrical Installation Contractor",
    "registrationDate": "2015-03-15"
  },
  "testResults": {
    "earthResistance": {
      "measured": 0.85,
      "unit": "Ω",
      "testVoltage": 500,
      "testMethod": "4-pole earth tester"
    },
    "insulationResistance": {
      "circuit1": {
        "measured": 150,
        "unit": "MΩ",
        "testVoltage": 500
      },
      "circuit2": {
        "measured": 98,
        "unit": "MΩ",
        "testVoltage": 500
      }
    },
    "earthLoopImpedance": {
      "mainIncomer": {
        "measured": 0.42,
        "unit": "Ω",
        "protectiveDevice": "40A Type B MCB",
        "maxPermitted": 1.15
      }
    },
    "rcdTests": {
      "rcd1": {
        "ratedCurrent": 30,
        "unit": "mA",
        "tripTimeAt1x": 28,
        "tripTimeAt5x": 18,
        "unit": "ms"
      }
    },
    "polarity": {
      "allCircuits": "Correct",
      "notes": "Phase, neutral, earth correctly connected"
    },
    "continuity": {
      "protectiveConductor": 0.32,
      "unit": "Ω"
    }
  },
  "circuits": [
    {
      "circuitNumber": 1,
      "description": "Lighting",
      "cableSize": 1.5,
      "cableSizeUnit": "mm²",
      "protectiveDevice": "16A Type B MCB",
      "load": 12,
      "loadUnit": "A"
    },
    {
      "circuitNumber": 2,
      "description": "Socket outlets",
      "cableSize": 2.5,
      "cableSizeUnit": "mm²",
      "protectiveDevice": "20A Type B MCB",
      "load": 16,
      "loadUnit": "A"
    }
  ],
  "installationDate": "2024-01-15",
  "testDate": "2024-01-20"
}
```

---

## Sample JSON Output (Verification Report)

```json
{
  "cocNumber": "ECA-2024-001234",
  "cocType": "ECA",
  "evaluationDate": "2024-01-20",
  "overallStatus": "Pass",
  "installationSummary": "Domestic single-phase TN-S installation at 230V. 2 circuits tested (lighting 16A, socket outlets 20A). Main protection via 40A Type B MCB with 30mA RCD.",
  "overallAssessment": "Installation meets all mandatory SANS 10142-1 requirements. All safety-critical tests passed. Earth resistance, insulation, RCD functionality, and loop impedance within acceptable limits. Certification valid with registered contractor signature.",
  "checks": [
    {
      "checkId": "EARTH-001",
      "clause": "7.4",
      "description": "Earth continuity and resistance",
      "result": "Pass",
      "measuredValue": "0.85Ω",
      "limit": "≤ 1Ω (TN system)",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:32:15Z"
    },
    {
      "checkId": "INSUL-001",
      "clause": "8.6",
      "description": "Insulation resistance - Circuit 1",
      "result": "Pass",
      "measuredValue": "150MΩ",
      "limit": "≥ 0.5MΩ (circuits ≤500V)",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:35:42Z"
    },
    {
      "checkId": "INSUL-001",
      "clause": "8.6",
      "description": "Insulation resistance - Circuit 2",
      "result": "Pass",
      "measuredValue": "98MΩ",
      "limit": "≥ 0.5MΩ (circuits ≤500V)",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:36:08Z"
    },
    {
      "checkId": "LOOP-001",
      "clause": "8.5",
      "description": "Earth loop impedance - Main incomer",
      "result": "Pass",
      "measuredValue": "0.42Ω",
      "limit": "≤ 1.15Ω (40A Type B MCB)",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:38:22Z"
    },
    {
      "checkId": "RCD-001",
      "clause": "8.8",
      "description": "RCD functional test @ 1× IΔn",
      "result": "Pass",
      "measuredValue": "28ms",
      "limit": "≤ 300ms @ 30mA",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:40:15Z"
    },
    {
      "checkId": "RCD-001",
      "clause": "8.8",
      "description": "RCD functional test @ 5× IΔn",
      "result": "Pass",
      "measuredValue": "18ms",
      "limit": "≤ 40ms @ 150mA",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:40:32Z"
    },
    {
      "checkId": "POL-001",
      "clause": "8.7",
      "description": "Polarity verification",
      "result": "Pass",
      "measuredValue": "Correct on all circuits",
      "limit": "Phase/neutral/earth correctly connected",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:42:10Z"
    },
    {
      "checkId": "POL-001",
      "clause": "8.7",
      "description": "Protective conductor continuity",
      "result": "Pass",
      "measuredValue": "0.32Ω",
      "limit": "≤ 0.5Ω",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-20T14:43:05Z"
    },
    {
      "checkId": "COND-001",
      "clause": "7.2",
      "description": "Conductor sizing - Circuit 1 (Lighting)",
      "result": "Pass",
      "measuredValue": "1.5mm² for 12A load",
      "limit": "≥ 1.5mm² for 16A protection",
      "remediation": "N/A - Correctly sized",
      "category": "Mandatory",
      "timestamp": "2024-01-20T14:45:20Z"
    },
    {
      "checkId": "COND-001",
      "clause": "7.2",
      "description": "Conductor sizing - Circuit 2 (Socket outlets)",
      "result": "Pass",
      "measuredValue": "2.5mm² for 16A load",
      "limit": "≥ 2.5mm² for 20A protection",
      "remediation": "N/A - Correctly sized",
      "category": "Mandatory",
      "timestamp": "2024-01-20T14:46:15Z"
    },
    {
      "checkId": "DOC-001",
      "clause": "22",
      "description": "Certification validity",
      "result": "Pass",
      "measuredValue": "John Smith, ECA-12345, registered 2015-03-15",
      "limit": "Valid registration with competent authority",
      "remediation": "N/A - Valid certification",
      "category": "Mandatory",
      "timestamp": "2024-01-20T14:48:00Z"
    }
  ],
  "criticalFailures": [],
  "administrativeDetails": {
    "physicalAddress": "123 Main Street, Johannesburg",
    "erfNumber": "ERF 456",
    "registeredPerson": "John Smith",
    "idNumber": "7801015800080",
    "registrationNumber": "ECA-12345",
    "registrationType": "Electrical Installation Contractor",
    "registrationDate": "2015-03-15"
  },
  "technicalEvaluation": [
    {
      "section": "Earthing System",
      "clause": "7.4",
      "requirement": "Earth resistance ≤ 1Ω for TN-S system",
      "finding": "Measured 0.85Ω with 4-pole earth tester",
      "status": "Pass",
      "notes": "Excellent earth system, well below maximum permitted value"
    },
    {
      "section": "Protective Devices",
      "clause": "8.3",
      "requirement": "Correct coordination of MCB ratings with cable sizes",
      "finding": "16A MCB with 1.5mm², 20A MCB with 2.5mm²",
      "status": "Pass",
      "notes": "All circuits correctly protected per SANS 10142-1 Table 52B"
    },
    {
      "section": "RCD Protection",
      "clause": "8.8",
      "requirement": "30mA RCD trip within 300ms @ IΔn, 40ms @ 5×IΔn",
      "finding": "Trip times: 28ms @ 30mA, 18ms @ 150mA",
      "status": "Pass",
      "notes": "RCD responds well within required timeframes"
    }
  ],
  "recommendations": [
    "Consider installing Type 2 SPD at main distribution board for enhanced surge protection (Clause 28)",
    "Schedule next periodic inspection within 3 years (Clause 23)",
    "Maintain test records for minimum 5 years (Clause 24)"
  ],
  "auditTrail": [
    {
      "timestamp": "2024-01-20T14:32:15Z",
      "checkId": "EARTH-001",
      "clause": "7.4",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:35:42Z",
      "checkId": "INSUL-001",
      "clause": "8.6",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:36:08Z",
      "checkId": "INSUL-001",
      "clause": "8.6",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:38:22Z",
      "checkId": "LOOP-001",
      "clause": "8.5",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:40:15Z",
      "checkId": "RCD-001",
      "clause": "8.8",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:40:32Z",
      "checkId": "RCD-001",
      "clause": "8.8",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:42:10Z",
      "checkId": "POL-001",
      "clause": "8.7",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:43:05Z",
      "checkId": "POL-001",
      "clause": "8.7",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:45:20Z",
      "checkId": "COND-001",
      "clause": "7.2",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:46:15Z",
      "checkId": "COND-001",
      "clause": "7.2",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-20T14:48:00Z",
      "checkId": "DOC-001",
      "clause": "22",
      "action": "Evaluated",
      "result": "Pass"
    }
  ],
  "summary": {
    "totalChecks": 11,
    "passedChecks": 11,
    "failedChecks": 0,
    "notApplicable": 0,
    "criticalFailures": 0
  }
}
```

---

## Sample Output with Failures

```json
{
  "cocNumber": "ECA-2024-005678",
  "cocType": "ECA",
  "evaluationDate": "2024-01-22",
  "overallStatus": "Fail",
  "installationSummary": "Domestic single-phase installation with 3 circuits. Multiple non-compliances identified affecting safety.",
  "overallAssessment": "Installation FAILS SANS 10142-1 compliance due to critical safety issues: inadequate earth resistance (2.3Ω exceeds 1Ω limit), RCD trip time failure (450ms exceeds 300ms limit), and undersized conductors on Circuit 3. Immediate remediation required before COC can be issued.",
  "checks": [
    {
      "checkId": "EARTH-001",
      "clause": "7.4",
      "description": "Earth continuity and resistance",
      "result": "Fail",
      "measuredValue": "2.3Ω",
      "limit": "≤ 1Ω (TN system)",
      "remediation": "Install additional earth electrodes to reduce resistance. Consider driven rods or grid system. Verify all main equipotential bonding connections. Re-test until resistance ≤ 1Ω achieved.",
      "category": "Safety-Critical",
      "timestamp": "2024-01-22T10:15:30Z"
    },
    {
      "checkId": "RCD-001",
      "clause": "8.8",
      "description": "RCD functional test @ 1× IΔn",
      "result": "Fail",
      "measuredValue": "450ms",
      "limit": "≤ 300ms @ 30mA",
      "remediation": "Replace RCD - delayed trip indicates internal fault or wear. Install new 30mA RCD compliant with SANS 60947-2. Re-test to verify trip time ≤ 300ms.",
      "category": "Safety-Critical",
      "timestamp": "2024-01-22T10:22:18Z"
    },
    {
      "checkId": "COND-001",
      "clause": "7.2",
      "description": "Conductor sizing - Circuit 3 (Geyser)",
      "result": "Fail",
      "measuredValue": "2.5mm² for 25A load",
      "limit": "≥ 4mm² for 30A protection",
      "remediation": "Replace with minimum 4mm² cable rated for 30A load. Verify cable current-carrying capacity per SANS 10142-1 Table 52B considering installation method and ambient temperature.",
      "category": "Mandatory",
      "timestamp": "2024-01-22T10:28:45Z"
    },
    {
      "checkId": "INSUL-001",
      "clause": "8.6",
      "description": "Insulation resistance - Circuit 2",
      "result": "Pass",
      "measuredValue": "85MΩ",
      "limit": "≥ 0.5MΩ (circuits ≤500V)",
      "remediation": "N/A - Test passed",
      "category": "Safety-Critical",
      "timestamp": "2024-01-22T10:18:30Z"
    }
  ],
  "criticalFailures": [
    {
      "category": "Safety",
      "clause": "7.4",
      "description": "Earth resistance exceeds maximum permitted value",
      "reason": "Measured 2.3Ω exceeds 1Ω limit for TN-S system. Inadequate earth fault protection - disconnection times cannot be guaranteed. Persons at risk of electric shock under fault conditions."
    },
    {
      "category": "Safety",
      "clause": "8.8",
      "description": "RCD trip time exceeds maximum permitted duration",
      "reason": "Measured 450ms exceeds 300ms limit at rated residual current. Delayed disconnection increases risk of electrocution. RCD may be defective or worn."
    },
    {
      "category": "Technical",
      "clause": "7.2",
      "description": "Undersized conductor for circuit load",
      "reason": "2.5mm² cable used for 25A geyser circuit with 30A MCB protection. Cable will overheat under full load, creating fire risk. Must use minimum 4mm² for this application."
    }
  ],
  "administrativeDetails": {
    "physicalAddress": "456 Oak Avenue, Pretoria",
    "erfNumber": "ERF 789",
    "registeredPerson": "Mike Johnson",
    "idNumber": "8505125900081",
    "registrationNumber": "ECA-67890",
    "registrationType": "Electrical Installation Contractor",
    "registrationDate": "2018-06-10"
  },
  "technicalEvaluation": [
    {
      "section": "Earthing System",
      "clause": "7.4",
      "requirement": "Earth resistance ≤ 1Ω for TN-S system",
      "finding": "Measured 2.3Ω - exceeds limit",
      "status": "Fail",
      "notes": "Single earth rod insufficient. Additional electrodes required."
    },
    {
      "section": "RCD Protection",
      "clause": "8.8",
      "requirement": "30mA RCD trip within 300ms @ IΔn",
      "finding": "Trip time 450ms - exceeds limit",
      "status": "Fail",
      "notes": "RCD mechanically functional but slow response. Likely worn contacts or internal corrosion."
    },
    {
      "section": "Circuit Design",
      "clause": "7.2",
      "requirement": "Conductor size adequate for load and protection",
      "finding": "Circuit 3: 2.5mm² with 30A MCB for 25A load",
      "status": "Fail",
      "notes": "Cable undersized - will not withstand fault current. Thermal damage risk."
    }
  ],
  "recommendations": [
    "URGENT: Do not energize installation until all failures remediated",
    "Install additional earth electrodes to achieve ≤ 1Ω resistance",
    "Replace defective 30mA RCD with new compliant device",
    "Replace Circuit 3 conductor with minimum 4mm² cable",
    "Re-test all failed items after remediation",
    "Consider full electrical audit for older portions of installation"
  ],
  "auditTrail": [
    {
      "timestamp": "2024-01-22T10:15:30Z",
      "checkId": "EARTH-001",
      "clause": "7.4",
      "action": "Evaluated",
      "result": "Fail"
    },
    {
      "timestamp": "2024-01-22T10:18:30Z",
      "checkId": "INSUL-001",
      "clause": "8.6",
      "action": "Evaluated",
      "result": "Pass"
    },
    {
      "timestamp": "2024-01-22T10:22:18Z",
      "checkId": "RCD-001",
      "clause": "8.8",
      "action": "Evaluated",
      "result": "Fail"
    },
    {
      "timestamp": "2024-01-22T10:28:45Z",
      "checkId": "COND-001",
      "clause": "7.2",
      "action": "Evaluated",
      "result": "Fail"
    }
  ],
  "summary": {
    "totalChecks": 4,
    "passedChecks": 1,
    "failedChecks": 3,
    "notApplicable": 0,
    "criticalFailures": 3
  }
}
```

---

## Usage Instructions

### For Document-Based Validation
Upload COC document (PDF/image) to the system. The AI will:
1. Extract test results and administrative details
2. Map findings to SANS 10142-1 clauses
3. Generate structured verification report

### For Structured Data Validation
Submit JSON payload with test results. The AI will:
1. Validate each measurement against clause thresholds
2. Generate PASS/FAIL per check
3. Provide remediation for failures
4. Create audit trail

### Interpreting Results

**Overall Status:**
- **Pass:** All mandatory safety-critical checks passed
- **Fail:** One or more critical checks failed
- **Incomplete:** Missing required test data or certification

**Check Categories:**
- **Safety-Critical:** Failures pose immediate danger (earth, RCD, insulation)
- **Mandatory:** Required by standard but lower immediate risk (conductor sizing, documentation)
- **Administrative:** Certification and record-keeping requirements

### Exclusions (Ignored Items)
- Cable cosmetic appearance (unless affects safety)
- Conduit aesthetics (unless structural integrity compromised)
- Label font size (unless affects readability for safety)
- Enclosure finish (unless corrosion affects IP rating)
- Minor documentation formatting

---

## Integration Example

```typescript
// Call the validate-coc edge function
const { data, error } = await supabase.functions.invoke('validate-coc', {
  body: {
    documentId: 'doc-uuid',
    documentUrl: 'storage-url',
    subsectionId: 'subsection-uuid'
  }
});

if (data?.validation) {
  const report = data.validation;
  console.log('Overall Status:', report.overallStatus);
  console.log('Total Checks:', report.summary.totalChecks);
  console.log('Failed Checks:', report.summary.failedChecks);
  
  // Display critical failures
  report.criticalFailures.forEach(failure => {
    console.error(`[${failure.clause}] ${failure.description}: ${failure.reason}`);
  });
  
  // Show remediation for failed checks
  report.checks
    .filter(check => check.result === 'Fail')
    .forEach(check => {
      console.log(`Remediation for ${check.checkId}:`, check.remediation);
    });
}
```

---

## Future Enhancements

1. **JSON Schema Validation:** Validate input payload structure before submission
2. **Role-Based Views:** Different detail levels for auditors vs clients
3. **Annexure Generation:** Auto-generate SANS 10142-1 test sheets with results
4. **Trend Analysis:** Track compliance over time per contractor/region
5. **Image Analysis:** OCR for handwritten test results on paper COCs
6. **Multi-Language Support:** Reports in Afrikaans, Zulu, etc.

---

## Support

For questions about SANS 10142-1 interpretation or verification engine usage, contact your system administrator or refer to the official SABS SANS 10142-1:2020 standard documentation.
