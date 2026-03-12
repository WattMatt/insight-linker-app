# Inspection Templates Reference

Complete reference for all 26 inspection templates — their categories, sections, fields, and field types.

---

## Table of Contents

- [Template Summary](#template-summary)
- [Field Types](#field-types)
- [Electrical Templates](#electrical-templates)
  - [1. Electrical Meter Inspection Report](#1-electrical-meter-inspection-report)
  - [2. Electrical Installation Certificate](#2-electrical-installation-certificate)
  - [3. Distribution Board Inspection](#3-distribution-board-inspection)
  - [4. Electrical Main Board (EMB) Inspection](#4-electrical-main-board-emb-inspection)
  - [5. Factory Acceptance Test (FAT) Inspection Report](#5-factory-acceptance-test-fat-inspection-report)
  - [6. Low Voltage Line Shop Board Audit](#6-low-voltage-line-shop-board-audit)
- [Medium & High Voltage Templates](#medium--high-voltage-templates)
  - [7. Miniature Substation Inspection Report](#7-miniature-substation-inspection-report)
  - [8. Miniature Substation Pre-FAT and Post-FAT](#8-miniature-substation-pre-fat-and-post-fat)
  - [9. RMU Snagging & Compliance Report](#9-rmu-snagging--compliance-report)
- [Generator Templates](#generator-templates)
  - [10. Generator Installation Inspection](#10-generator-installation-inspection)
- [Solar & Renewable Energy Templates](#solar--renewable-energy-templates)
  - [11. Standalone Solar PV Installation Inspection](#11-standalone-solar-pv-installation-inspection)
- [Fire Safety Templates](#fire-safety-templates)
  - [12. Fire Alarm System Inspection](#12-fire-alarm-system-inspection)
  - [13. Fire Extinguisher Inspection](#13-fire-extinguisher-inspection)
  - [14. Sprinkler System Test](#14-sprinkler-system-test)
  - [15. Emergency Lighting Test](#15-emergency-lighting-test)
- [Structural Templates](#structural-templates)
  - [16. Structural Integrity Assessment](#16-structural-integrity-assessment)
  - [17. Roof Inspection](#17-roof-inspection)
- [HVAC Templates](#hvac-templates)
  - [18. HVAC System Inspection](#18-hvac-system-inspection)
  - [19. Ventilation System Test](#19-ventilation-system-test)
- [Plumbing Templates](#plumbing-templates)
  - [20. Plumbing System Inspection](#20-plumbing-system-inspection)
  - [21. Backflow Prevention Test](#21-backflow-prevention-test)
- [Safety Templates](#safety-templates)
  - [22. General Safety Audit](#22-general-safety-audit)
  - [23. Elevator Inspection](#23-elevator-inspection)
- [General / Reports Templates](#general--reports-templates)
  - [24. Site Summary Report](#24-site-summary-report)
  - [25. Standard Progress Report](#25-standard-progress-report)
  - [26. Site Drawing Inspection](#26-site-drawing-inspection)
- [PDF Report Templates](#pdf-report-templates)

---

## Template Summary

| # | Template Name | Category | Sections | Pages |
|---|--------------|----------|----------|-------|
| 1 | Electrical Meter Inspection Report | General | 4 | 6 |
| 2 | Electrical Installation Certificate | Electrical | 8 | 12 |
| 3 | Distribution Board Inspection | Electrical | 6 | 8 |
| 4 | Electrical Main Board (EMB) Inspection | Low Voltage & Line Shops | 4 | 5 |
| 5 | Factory Acceptance Test (FAT) Inspection Report | Low Voltage & Line Shops | 6 | 10 |
| 6 | Low Voltage Line Shop Board Audit | Low Voltage & Line Shops | 6 | 8 |
| 7 | Miniature Substation Inspection Report | Medium & High Voltage | 5 | 7 |
| 8 | Miniature Substation Pre-FAT and Post-FAT | Medium & High Voltage | 4 | 6 |
| 9 | RMU Snagging & Compliance Report | Medium & High Voltage | 3 | 5 |
| 10 | Generator Installation Inspection | Generator | 4 | 6 |
| 11 | Standalone Solar PV Installation Inspection | Solar & Renewable Energy | 6 | 8 |
| 12 | Fire Alarm System Inspection | Fire Safety | 7 | 10 |
| 13 | Fire Extinguisher Inspection | Fire Safety | 4 | 5 |
| 14 | Sprinkler System Test | Fire Safety | 6 | 9 |
| 15 | Emergency Lighting Test | Electrical | 5 | 6 |
| 16 | Structural Integrity Assessment | Structural | 10 | 15 |
| 17 | Roof Inspection | Structural | 5 | 7 |
| 18 | HVAC System Inspection | HVAC | 8 | 11 |
| 19 | Ventilation System Test | HVAC | 5 | 6 |
| 20 | Plumbing System Inspection | Plumbing | 7 | 9 |
| 21 | Backflow Prevention Test | Plumbing | 4 | 5 |
| 22 | General Safety Audit | Safety | 12 | 18 |
| 23 | Elevator Inspection | Safety | 9 | 13 |
| 24 | Site Summary Report | General | 3 | 4 |
| 25 | Standard Progress Report | General | 6 | 5 |
| 26 | Site Drawing Inspection | Site Drawing | 0 | 1 |

---

## Field Types

| Type | Renders As | Description |
|------|-----------|-------------|
| `checklist` | Toggle / checkbox | Pass/Fail/N/A check with notes and photos |
| `text` | Single-line input | Short text answers |
| `textarea` | Multi-line input | Detailed notes and observations |
| `number` | Numeric input | Measurements, counts, ratings |
| `date` | Date picker | Date values |
| `select` | Dropdown menu | Predefined options |
| `image` | Photo capture | Image upload/capture field |
| `rating` | Star/numeric rating | Quality rating (e.g. 1–5) |
| `boolean` | Yes/No toggle | Simple binary check |

All fields have a `required` flag. Optional fields are marked below.

---

## Electrical Templates

### 1. Electrical Meter Inspection Report

**Category:** General
**Description:** Comprehensive inspection report for electrical metering installations, covering documentation, physical inspection, functional testing, and data verification
**Sections:** 4 | **Pages:** 6

#### Section 1: Documentation Verification

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1_1 | Approved shop drawings and meter layout received | checklist | Yes |
| 1_2 | Meter datasheet (type, class, serial no.) on file | checklist | Yes |
| 1_3 | CT/VT ratio certificates and calibration reports | checklist | Yes |
| 1_4 | Meter programming spec (tariff schedule, TOU settings) | checklist | Yes |
| 1_5 | Sealing procedure and seal number documented | checklist | Yes |

#### Section 2: Physical Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2_1 | Correct meter model and rating installed | checklist | Yes |
| 2_2 | Meter mounted per approved location and orientation | checklist | Yes |
| 2_3 | Seals intact (seal no. matches documentation) | checklist | Yes |
| 2_4 | Enclosure IP rating and lockable cover in place | checklist | Yes |
| 2_5 | CT test blocks installed close to meter as per NRS 057 | checklist | Yes |
| 2_6 | CT/VT wiring neat, correctly colour-coded, and labeled | checklist | Yes |
| 2_7 | CT polarity and phase sequence visually confirmed | checklist | Yes |
| 2_8 | VT connections verified | checklist | Yes |
| 2_9 | Earthing of meter enclosure and test blocks confirmed | checklist | Yes |

#### Section 3: Functional Testing

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3_1 | Insulation resistance >1 MΩ @ 500 V DC | checklist | Yes |
| 3_2 | Continuity of protective conductors (SANS 10142-1) | checklist | Yes |
| 3_3 | CT ratio test against calibration standard | checklist | Yes |
| 3_4 | VT ratio test against calibration standard | checklist | Yes |
| 3_5 | Meter accuracy test (load injection method) | checklist | Yes |
| 3_6 | Tamper detection relay / alarm function | checklist | No |
| 3_7 | Seal re-application after testing | checklist | Yes |

#### Section 4: Data Extraction & Tariff Verification

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 4_1 | IR / optical port communication test | checklist | Yes |
| 4_2 | Modbus / Ethernet link configuration verified | checklist | No |
| 4_3 | Data logger heartbeat and timestamp accuracy | checklist | Yes |
| 4_4 | Extracted energy registers match test readings | checklist | Yes |
| 4_5 | Tariff tables programmed as per client schedule | checklist | Yes |
| 4_6 | Time-of-Use periods and DST settings checked | checklist | Yes |

---

### 2. Electrical Installation Certificate

**Category:** Electrical
**Description:** Comprehensive electrical installation inspection for new installations and alterations
**Sections:** 8 | **Pages:** 12

#### Section 1: Installation Details

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Installation Address | text | Yes |
| 1-2 | Type of Installation | select | Yes |
| 1-3 | Date of Inspection | date | Yes |

#### Section 2: Supply Characteristics

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Supply Voltage | number | Yes |
| 2-2 | Frequency | number | Yes |
| 2-3 | Earthing System | select | Yes |

#### Section 3: Main Protective Devices

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Type of Device | text | Yes |
| 3-2 | Rating | number | Yes |
| 3-3 | Condition | select | Yes |

#### Section 4: Circuit Testing

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 4-1 | Insulation Resistance | number | Yes |
| 4-2 | Earth Continuity | number | Yes |
| 4-3 | RCD Test Results | number | No |

> Sections 5–8 cover circuit schedule, earth bonding, observations, and declaration/signatures.

---

### 3. Distribution Board Inspection

**Category:** Electrical
**Description:** Detailed inspection of electrical distribution boards and consumer units
**Sections:** 6 | **Pages:** 8

#### Section 1: Board Identification

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Board Location | text | Yes |
| 1-2 | Board Type | select | Yes |

#### Section 2: Visual Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Physical Condition | select | Yes |
| 2-2 | Labeling Complete | boolean | Yes |

#### Section 3: Circuit Protection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Breaker Types | text | Yes |
| 3-2 | Ratings Appropriate | boolean | Yes |

> Sections 4–6 cover wiring standards, earth bonding, and functional testing.

---

### 4. Electrical Main Board (EMB) Inspection

**Category:** Low Voltage & Line Shops
**Description:** Detailed inspection checklist for electrical main boards including physical safety, SANS compliance, control systems, and tenant management
**Sections:** 4 | **Pages:** 5

#### Section 1: Physical & Safety Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| enclosureCondition | EMB Enclosure Condition (corrosion, damage) | checklist | Yes |
| doorLocks | Door Locks & Security | checklist | Yes |
| ventilation | Ventilation & Cooling Systems | checklist | Yes |
| internalCleanliness | Internal Cleanliness (dust, debris) | checklist | Yes |
| warningLabels | Warning Labels & Signage | checklist | Yes |

#### Section 2: SANS Compliance Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| mainBoardLabelling | Main Board Labelling (Supply Source, Voltage) | checklist | Yes |
| outgoingCircuitLabelling | Outgoing Circuit Labelling & Schedule | checklist | Yes |
| phaseIdentification | Phase Color Coding & Identification | checklist | Yes |
| earthingBonding | Main Earthing & Bonding Conductor Sizing | checklist | Yes |
| mainSwitchAccessibility | Main Switch Accessibility & Operation | checklist | Yes |

#### Section 3: 48V Control Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| keySwitchWiring | Key Switch Wiring | checklist | Yes |
| panelLightingWiring | Panel Lighting Wiring | checklist | Yes |
| supplyBreakers | Supply Breakers | checklist | Yes |
| transformer | Transformer | checklist | Yes |
| wiringLabelling | Wiring Labelling | checklist | Yes |

#### Section 4: Observations & Snag List

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| observations | General observations and snags | textarea | No |

---

### 5. Factory Acceptance Test (FAT) Inspection Report

**Category:** Low Voltage & Line Shops
**Description:** Comprehensive FAT inspection covering documentation, physical inspection, functional testing, ATS commissioning, solar components, and generator integration
**Sections:** 6 | **Pages:** 10

#### Section 1: Documentation Verification

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| shopDrawings | Final approved shop drawings received | checklist | Yes |
| wiringDiagrams | Wiring diagrams and schematics match physical layout | checklist | Yes |
| componentDatasheets | Component datasheets and certificates of conformity | checklist | Yes |
| routineTestCertificates | Manufacturer's routine test certificates | checklist | Yes |

#### Section 2: Physical Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| enclosureType | Enclosure type and IP rating as per spec | checklist | Yes |
| dimensionsLayout | Dimensions and internal layout match approved drawings | checklist | Yes |
| busbar | Busbar sizing, spacing, color-coding, and insulation | checklist | Yes |
| cts | CTs installed and labeled as per schematic | checklist | Yes |
| earthNeutralBar | Earth and neutral bar continuity (visual and mechanical) | checklist | Yes |
| componentLabeling | Component labeling and terminal identification | checklist | Yes |
| cableEntry | Cable entry points and gland plate configuration | checklist | Yes |
| controlWiring | 48V control wiring neatly routed and segregated per schematic | checklist | Yes |
| enclosureMaterial | Enclosure constructed from certified 312-grade corrosion-resistant steel | checklist | Yes |
| powderCoating | Powder coating inspected per spec (DFT, Adhesion, Salt Spray, Color/Gloss) | checklist | Yes |

#### Section 3: Functional Testing

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| protectiveConductors | Continuity of protective conductors (SANS 10142-1: 8.6.2) | checklist | Yes |
| insulationResistance | Insulation resistance >1 MΩ @ 500V DC | checklist | Yes |
| earthLoopImpedance | Earth loop impedance test (SANS 10142-1: 8.6.5) | checklist | Yes |
| ctVerification | CT ratios, wiring polarity, and connections verified | checklist | Yes |
| protectionDevices | Protection devices (MCBs, MCCBs, E/L units) function tested | checklist | Yes |
| interlocks | Interlocks, shunt trips, and control relays verified | checklist | Yes |
| controlCircuits | Functional test of 48V control circuits and live actuation | checklist | Yes |

#### Section 4: ABB TruONE® ATS – Commissioning

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| modelRating | ATS model and rating confirmed against specification | checklist | Yes |
| mechanicalInstallation | Mechanical installation and mounting verified | checklist | Yes |
| hmiDipSwitch | HMI / DIP switch interface functioning | checklist | Yes |
| settingsVerified | Settings verified and recorded | checklist | Yes |
| communication | Communication setup (Modbus / Ethernet) | checklist | No |
| manualTransfer | Manual transfer test via HMI | checklist | Yes |
| autoTransfer | Simulated auto transfer (loss of supply) | checklist | Yes |
| ledAlarms | LED indications and alarm outputs verified | checklist | Yes |
| configFile | Configuration file saved/exported | checklist | No |
| commissioningCert | Signed commissioning certificate attached | checklist | Yes |

#### Section 5: Solar Component Check

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| inverterCircuitBreaker | Inverter Circuit Breaker | checklist | Yes |
| isolatingTransformer | 1250VA isolating transformer | checklist | Yes |
| singlePhasePlugPoint | Single Phase plug point | checklist | Yes |
| fanFuse | Fan fuse | checklist | Yes |
| backupUpsConnection | Backup UPS connected to isolating transformer | checklist | Yes |
| gridMonitoringRelayVoltage | Grid Monitoring Relay voltage pickup | checklist | Yes |
| powerMeterCts | Power Meter CTs positioned correctly | checklist | Yes |
| mechanicalInterlock | Bus Contactors mechanically interlocked | checklist | Yes |
| electricalInterlock | Bus Contactors electrically interlocked | checklist | Yes |

#### Section 6: Generator Integration

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| tieInBreakerSize | Tie-in breaker size verification | checklist | Yes |
| motorizedBreakerControl | Motorized breaker control settings confirmed | checklist | Yes |
| motorizedBreakerOperation | Motorized breaker operation test | checklist | Yes |
| generatorStartStopSignal | Generator start/stop signal integration | checklist | Yes |
| breakerInterlockLogic | Breaker interlock logic confirmed | checklist | Yes |

---

### 6. Low Voltage Line Shop Board Audit

**Category:** Low Voltage & Line Shops
**Description:** Comprehensive audit template for line shop electrical boards including visual documentation, component verification, and quality assessment
**Sections:** 6 | **Pages:** 8

#### Section 1: Normal Board State Images

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| boardOpen | Board (Open) | image | Yes |
| boardClosed | Board (Closed) | image | Yes |
| internalLegend | Internal Legend | image | Yes |

#### Section 2: Emergency Board State Images

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| boardOpen | Board (Open) | image | Yes |
| boardClosed | Board (Closed) | image | Yes |
| internalLegend | Internal Legend | image | Yes |

#### Section 3: Key Component Images

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| mainBreaker | Main Breaker | image | Yes |
| meter | Meter | image | Yes |
| ct | CT | image | Yes |
| earthLeakage | Earth Leakage | image | Yes |
| other | Other | image | No |

#### Section 4: Normal Wiring Images

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| cleanliness | Cleanliness | image | Yes |
| mainCableGland | Glanding | image | Yes |
| generalWiring | General Wiring | image | Yes |
| meterWiring | Meter Wiring | image | Yes |

#### Section 5: Emergency Wiring Images

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| cleanliness | Cleanliness | image | Yes |
| mainCableGland | Glanding | image | Yes |
| generalWiring | General Wiring | image | Yes |
| meterWiring | Meter Wiring | image | Yes |

#### Section 6: Observations & Quality

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| comments | General Observations & Comments | textarea | No |
| qualityRating | Overall Quality Rating (1-5) | rating | Yes |

---

## Medium & High Voltage Templates

### 7. Miniature Substation Inspection Report

**Category:** Medium & High Voltage
**Description:** Comprehensive inspection for miniature substations covering visual, electrical, thermal, service history, documentation, and safety checks
**Sections:** 5 | **Pages:** 7

#### Section 1: Visual & Structural Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| enclosureDamage | Enclosure: Physical Damage Assessment | checklist | Yes |
| waterIngress | Cable Entries/Ducts: Signs of Water Ingress | checklist | Yes |
| ventilation | Ventilation Louvers: Obstruction/Damage | checklist | Yes |
| lockingMechanism | Locking Mechanisms & Door Hinges | checklist | Yes |
| foundationCondition | Foundation/Plinth Condition | checklist | Yes |

#### Section 2: Electrical, Functional & Thermal Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| transformerSpecs | Transformer Specs: Rating (kVA), Voltage, Impedance | checklist | Yes |
| insulationResistanceLV | Insulation Resistance (Megger): LV Side | checklist | Yes |
| insulationResistanceHV | Insulation Resistance (Megger): HV Side | checklist | Yes |
| oilLevelTemp | Transformer Oil Level & Temperature | checklist | Yes |
| thermalScan | Thermal Scan: Connections & Terminations | checklist | Yes |

#### Section 3: Service & Maintenance History

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| serviceLogs | Service Logs & Fault History: Review | checklist | Yes |
| internalCleanliness | Internal Cleanliness: Dust, Contaminants | checklist | Yes |
| oilSample | Oil Sample Taken (if required) | checklist | No |

#### Section 4: Documentation & Compliance

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| sldAvailability | Single Line Diagram (SLD): Availability & Accuracy | checklist | Yes |
| cocRecords | Certificates of Compliance (COCs): Record Keeping | checklist | Yes |
| warningLabels | Danger & Warning Labels: Visibility & Condition | checklist | Yes |

#### Section 5: Critical Safety Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| hvEarthingIntegrity | HV Earthing System Integrity Verification | checklist | Yes |
| lvEarthingIntegrity | LV Earthing & Bonding Integrity | checklist | Yes |
| accessControl | Access Control & Security | checklist | Yes |
| fireExtinguisher | Fire Extinguisher Availability & Service Date | checklist | Yes |

---

### 8. Miniature Substation Pre-FAT and Post-FAT

**Category:** Medium & High Voltage
**Description:** Pre-factory and post-factory acceptance testing for miniature substations covering electrical details, visual inspection, safety, and cover verification
**Sections:** 4 | **Pages:** 6

#### Section 1: PRE FAT INSPECTION — ELECTRICAL DETAILS

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| lvTransformerSpec | LV Transformer Spec: Rating (KVA), Voltage | text | Yes |
| tapSetting | Tap setting | text | Yes |
| hvSpec | HV Spec: Rating (KVA), Voltage | text | Yes |
| busbarSizing | Busbar sizing and spacing | checklist | Yes |
| mainLvBreaker | Main LV Breaker (Type/Rating) | text | Yes |
| mainLvBreakerSettings | Main LV Breaker Settings | text | Yes |
| mainLvBreakerMeter | Main LV Breaker meter | checklist | Yes |
| mainMeterCtRatio | Main meter CT ratio | text | Yes |
| subBreaker | Sub Breaker (Type/Rating) | text | Yes |
| subBreakerSettings | Sub Breaker Settings | text | Yes |
| subBreakerMeter | Sub Breaker meter | checklist | Yes |
| subBreakerCtRatio | Sub Breaker CT ratio | text | Yes |
| cableLugCrimping | All cable lug crimping and heat shrink | checklist | Yes |
| busbarConnectionTorque | Busbar & Connection Torque (Visual) | checklist | Yes |

#### Section 2: PRE FAT INSPECTION — VISUAL

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| enclosureTypeIp | Enclosure type and IP rating as per spec | checklist | Yes |
| enclosurePhysical | Enclosure Physical | checklist | Yes |
| cableEntries | Cable Entries | checklist | Yes |
| ventilationLouvers | Ventilation louvers | checklist | Yes |
| lockingMechanisms | Locking Mechanisms & Door Hinges | checklist | Yes |
| breather | Breather | checklist | Yes |
| oilLevelIndicator | Oil level Indicator | checklist | Yes |
| drainTap | Drain Tap | checklist | Yes |
| tempProbeAccess | Temp probe access | checklist | Yes |

#### Section 3: PRE FAT INSPECTION — SAFETY

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| hvEarthing | HV Earthing | checklist | Yes |
| lvEarthing | LV Earthing | checklist | Yes |
| lvDangerWarnings | LV Danger and warning signs | checklist | Yes |
| hvDangerWarnings | HV Danger and warning signs | checklist | Yes |
| hvEarthFaultIndicator | HV Earth fault protection indicator | checklist | Yes |

#### Section 4: FINAL FAT INSPECTION — COVERS

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| mainLvBreakerCover | Main LV Breaker (per specs) | checklist | Yes |
| subBreakersCover | Sub breakers | checklist | Yes |
| hvCovers | HV covers | checklist | Yes |

---

### 9. RMU Snagging & Compliance Report

**Category:** Medium & High Voltage
**Description:** Ring main unit inspection covering physical/structural checks, electrical verification, and critical safety assessments
**Sections:** 3 | **Pages:** 5

#### Section 1: Physical & Structural Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| housingCorrosion | Housing Corrosion Assessment (Visual) | checklist | Yes |
| weatherproofingSeal | Weatherproofing & Seal Integrity (Visual) | checklist | Yes |
| foundationPlinth | Foundation/Plinth Condition (Visual) | checklist | Yes |
| cableGlandPlates | Cable Gland Plates & Entry Points (Visual) | checklist | Yes |
| labelsSignage | Labels, Danger & Warning Signage (Visual) | checklist | Yes |

#### Section 2: Electrical Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| insulatorContamination | Insulator Contamination/Damage (Visual) | checklist | Yes |
| busbarConnections | Busbar & Connection Torque (Visual/Thermal) | checklist | Yes |
| earthingContinuity | Main Earthing Bar & Continuity (Visual/Test) | checklist | Yes |
| gasPressure | SF6 Gas Pressure/Density Gauge Reading (Visual) | checklist | Yes |
| switchOperation | Switch Mechanism Operation (Manual) | checklist | Yes |
| interlockFunction | Mechanical & Electrical Interlocks (Functional Test) | checklist | Yes |
| ctVtCondition | CT/VT Condition & Wiring (Visual) | checklist | Yes |
| protectionRelay | Protection Relay Health & Settings (Visual) | checklist | Yes |
| batteryTrippingUnit | Battery/Tripping Unit Health (Visual/Test) | checklist | Yes |

#### Section 3: Critical Safety Checks

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| emergencyStop | Emergency Stop Functionality Test | checklist | Yes |
| livePartsIsolation | Live Parts Isolation Verification | checklist | Yes |
| fireSuppression | Fire Suppression System Status (if applicable) | checklist | No |
| accessControl | Access Control & Lockout/Tagout Provisions | checklist | Yes |

---

## Generator Templates

### 10. Generator Installation Inspection

**Category:** Generator
**Description:** Generator installation verification covering integration, documentation, physical inspection, and functional testing
**Sections:** 4 | **Pages:** 6

#### Section 1: Generator Integration

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| tieInBreakerSize | Tie-in breaker size verification | checklist | Yes |
| tieInBreakerPositioning | Tie-in breaker positioning verification | checklist | Yes |
| motorizedBreakerControl | Motorized breaker control settings confirmed | checklist | Yes |
| motorizedBreakerOperation | Motorized breaker operation test | checklist | Yes |
| generatorStartStopSignal | Generator start/stop signal integration | checklist | Yes |
| generatorLoadTransfer | Generator load transfer sequence verified | checklist | Yes |
| breakerInterlockLogic | Breaker interlock logic confirmed | checklist | Yes |
| controlPanelSettings | Control panel settings documented | checklist | Yes |
| signalFeedback | Signal feedback from generator to monitoring system | checklist | No |
| emergencyStopIntegration | Emergency stop integration and test | checklist | Yes |

#### Section 2: Documentation Verification

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| final_generator_specs | Final generator specs | checklist | Yes |
| engine_alternator_certificates | Engine & alternator certificates | checklist | Yes |
| controller_datasheets_wiring_diagrams | Controller datasheets & wiring diagrams | checklist | Yes |
| gsm_module_documentation | GSM module documentation | checklist | No |
| commissioning_checklist_test_certs | Commissioning checklist & test certs | checklist | Yes |

#### Section 3: Physical Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| generator_enclosure_condition | Generator enclosure condition | checklist | Yes |
| exhaust_cooling_systems_checked | Exhaust & cooling systems checked | checklist | Yes |
| fuel_system_inspection | Fuel system inspection | checklist | Yes |
| engine_type_model_verified | Engine type/model verified | checklist | Yes |
| alternator_type_rating_confirmed | Alternator type/rating confirmed | checklist | Yes |
| controller_model | Controller model | checklist | Yes |
| gsm_module_installed | GSM module installed | checklist | No |
| cable_entry_earthing_verified | Cable entry & earthing verified | checklist | Yes |

#### Section 4: Functional Testing

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| emergency_stop_function | Emergency stop function | checklist | Yes |
| engine_start_stop_test | Engine start/stop test | checklist | Yes |
| alternator_output_voltage | Alternator output voltage | checklist | Yes |
| load_transfer_sequence | Load transfer sequence | checklist | Yes |
| gsm_communication_test | GSM communication test | checklist | No |
| battery_charging_voltage_drop | Battery charging voltage & drop | checklist | Yes |
| controller_settings_recorded | Controller settings recorded | checklist | Yes |
| alarm_simulation | Alarm simulation | checklist | Yes |

---

## Solar & Renewable Energy Templates

### 11. Standalone Solar PV Installation Inspection

**Category:** Solar & Renewable Energy
**Description:** Complete inspection checklist for standalone solar photovoltaic installations covering PV array, inverter systems, battery storage, and grid integration
**Sections:** 6 | **Pages:** 8

#### Section 1: PV Array Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| panelMounting | Panel mounting structure integrity and alignment | checklist | Yes |
| panelCondition | Panel physical condition (cracks, hotspots, delamination) | checklist | Yes |
| arrayWiring | DC wiring, conduit, and cable management | checklist | Yes |
| stringConfiguration | String configuration verified against design | checklist | Yes |
| pvIsolators | PV isolators installed and labeled | checklist | Yes |
| earthingBonding | Earthing and bonding of array structure | checklist | Yes |

#### Section 2: Inverter System

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| inverterModel | Inverter model and rating verification | text | Yes |
| inverterMounting | Inverter mounting and ventilation clearances | checklist | Yes |
| dcConnections | DC input connections and polarity | checklist | Yes |
| acConnections | AC output connections and protection | checklist | Yes |
| inverterSettings | Inverter settings and grid parameters configured | checklist | Yes |
| communicationSetup | Communication/monitoring system setup | checklist | No |

#### Section 3: Battery Storage System (if applicable)

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| batteryType | Battery type and capacity verification | text | No |
| batteryInstallation | Battery installation and ventilation | checklist | No |
| bmsOperation | BMS (Battery Management System) operation | checklist | No |
| batteryConnections | Battery connections and cable sizing | checklist | No |
| chargingSystem | Charging system parameters verified | checklist | No |

#### Section 4: Electrical Testing & Commissioning

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| insulationResistance | Insulation resistance test (DC side) | checklist | Yes |
| earthContinuity | Earth continuity and bonding test | checklist | Yes |
| polarityTest | Polarity test (DC and AC) | checklist | Yes |
| stringVoltage | String voltage and current measurements | checklist | Yes |
| inverterOutput | Inverter output voltage and frequency | checklist | Yes |
| gridSynchronization | Grid synchronization test | checklist | Yes |

#### Section 5: Protection & Safety Systems

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| antiIslandingProtection | Anti-islanding protection verified | checklist | Yes |
| overvoltageProtection | Overvoltage/undervoltage protection | checklist | Yes |
| surgeProtection | Surge protection devices (SPDs) installed | checklist | Yes |
| isolationDevices | Isolation devices accessible and labeled | checklist | Yes |
| fireSafety | Fire safety provisions and signage | checklist | Yes |
| emergencyShutdown | Emergency shutdown procedure tested | checklist | Yes |

#### Section 6: Documentation & Compliance

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| asBuiltDrawings | As-built drawings and schematics | checklist | Yes |
| equipmentDatasheets | Equipment datasheets and certificates | checklist | Yes |
| testResults | Test results and commissioning reports | checklist | Yes |
| cocSubmitted | COC submitted to authority | checklist | Yes |
| operationManuals | Operation and maintenance manuals provided | checklist | Yes |
| warningLabels | All warning and identification labels in place | checklist | Yes |

---

## Fire Safety Templates

### 12. Fire Alarm System Inspection

**Category:** Fire Safety
**Description:** Comprehensive fire detection and alarm system inspection
**Sections:** 7 | **Pages:** 10

#### Section 1: System Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | System Type | select | Yes |
| 1-2 | Zones Covered | number | Yes |

#### Section 2: Control Panel

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Panel Model | text | Yes |
| 2-2 | Battery Status | select | Yes |

#### Section 3: Detection Devices

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Smoke Detectors | number | Yes |
| 3-2 | Heat Detectors | number | Yes |

> Sections 4–7 follow similar patterns covering sounders/beacons, manual call points, wiring, and documentation.

---

### 13. Fire Extinguisher Inspection

**Category:** Fire Safety
**Description:** Monthly and annual fire extinguisher inspection checklist
**Sections:** 4 | **Pages:** 5

#### Section 1: Equipment Details

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Extinguisher Type | select | Yes |
| 1-2 | Serial Number | text | Yes |

#### Section 2: Physical Condition

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Pressure Gauge | select | Yes |
| 2-2 | Seal Intact | boolean | Yes |

> Sections 3–4 cover mounting/signage and service history.

---

### 14. Sprinkler System Test

**Category:** Fire Safety
**Description:** Quarterly inspection and testing of automatic sprinkler systems
**Sections:** 6 | **Pages:** 9

#### Section 1: System Details

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | System Coverage | text | Yes |
| 1-2 | Number of Heads | number | Yes |

#### Section 2: Water Supply

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Static Pressure | number | Yes |
| 2-2 | Flow Rate | number | Yes |

> Sections 3–6 cover valve inspection, alarm testing, head condition, and documentation.

---

### 15. Emergency Lighting Test

**Category:** Electrical
**Description:** Periodic testing of emergency lighting systems
**Sections:** 5 | **Pages:** 6

#### Section 1: System Overview

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Total Luminaires | number | Yes |
| 1-2 | System Type | select | Yes |

#### Section 2: Duration Test

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Test Duration | number | Yes |
| 2-2 | All Units Functional | boolean | Yes |

> Sections 3–5 cover individual luminaire checks, battery condition, and signage.

---

## Structural Templates

### 16. Structural Integrity Assessment

**Category:** Structural
**Description:** Comprehensive building structure safety inspection
**Sections:** 10 | **Pages:** 15

#### Section 1: Building Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Building Age | number | Yes |
| 1-2 | Construction Type | select | Yes |

#### Section 2: Foundation Inspection

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Foundation Type | text | Yes |
| 2-2 | Cracks Present | boolean | Yes |

#### Section 3: Load-Bearing Elements

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Columns Condition | select | Yes |
| 3-2 | Beams Condition | select | Yes |

> Sections 4–10 cover walls, floors, stairs, roof structure, exterior cladding, drainage, and overall assessment.

---

### 17. Roof Inspection

**Category:** Structural
**Description:** Detailed roof condition and weatherproofing assessment
**Sections:** 5 | **Pages:** 7

#### Section 1: Roof Details

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Roof Type | select | Yes |
| 1-2 | Age of Roof | number | Yes |

#### Section 2: Surface Condition

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Material Condition | select | Yes |
| 2-2 | Leaks Detected | boolean | Yes |

> Sections 3–5 cover flashing/gutters, penetrations, and drainage.

---

## HVAC Templates

### 18. HVAC System Inspection

**Category:** HVAC
**Description:** Heating, ventilation, and air conditioning system maintenance check
**Sections:** 8 | **Pages:** 11

#### Section 1: System Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | System Type | select | Yes |
| 1-2 | Capacity | number | Yes |

#### Section 2: Air Handling Units

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Filter Condition | select | Yes |
| 2-2 | Belt Tension | select | Yes |

#### Section 3: Refrigeration System

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Refrigerant Level | select | Yes |
| 3-2 | Compressor Operation | select | Yes |

> Sections 4–8 cover ductwork, controls/thermostats, electrical components, condensate drainage, and documentation.

---

### 19. Ventilation System Test

**Category:** HVAC
**Description:** Indoor air quality and ventilation performance testing
**Sections:** 5 | **Pages:** 6

#### Section 1: System Overview

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Air Changes per Hour | number | Yes |
| 1-2 | System Type | select | Yes |

#### Section 2: Performance Testing

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Air Flow Rate | number | Yes |
| 2-2 | CO2 Levels | number | Yes |

> Sections 3–5 cover duct inspection, fan operation, and air quality measurements.

---

## Plumbing Templates

### 20. Plumbing System Inspection

**Category:** Plumbing
**Description:** Comprehensive water supply and drainage system inspection
**Sections:** 7 | **Pages:** 9

#### Section 1: Water Supply

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Water Pressure | number | Yes |
| 1-2 | Pipe Material | text | Yes |

#### Section 2: Drainage System

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Drain Flow | select | Yes |
| 2-2 | Blockages Present | boolean | Yes |

#### Section 3: Hot Water System

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Water Heater Type | select | Yes |
| 3-2 | Temperature Setting | number | Yes |

> Sections 4–7 cover fixtures, valves, backflow prevention, and documentation.

---

### 21. Backflow Prevention Test

**Category:** Plumbing
**Description:** Annual testing of backflow prevention devices
**Sections:** 4 | **Pages:** 5

#### Section 1: Device Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Device Type | select | Yes |
| 1-2 | Serial Number | text | Yes |

#### Section 2: Test Results

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Check Valve #1 | number | Yes |
| 2-2 | Check Valve #2 | number | Yes |

> Sections 3–4 cover relief valve testing and certification.

---

## Safety Templates

### 22. General Safety Audit

**Category:** Safety
**Description:** Comprehensive workplace safety and compliance audit
**Sections:** 12 | **Pages:** 18

#### Section 1: Workplace Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Facility Type | select | Yes |
| 1-2 | Number of Employees | number | Yes |

#### Section 2: Emergency Procedures

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Emergency Exits Marked | boolean | Yes |
| 2-2 | Evacuation Plan Posted | boolean | Yes |

#### Section 3: Personal Protective Equipment

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | PPE Available | boolean | Yes |
| 3-2 | Training Documented | boolean | Yes |

> Sections 4–12 cover hazardous materials, electrical safety, fire protection, first aid, housekeeping, signage, access control, incident records, and overall compliance.

---

### 23. Elevator Inspection

**Category:** Safety
**Description:** Annual elevator safety and operation inspection
**Sections:** 9 | **Pages:** 13

#### Section 1: Elevator Details

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 1-1 | Elevator ID | text | Yes |
| 1-2 | Capacity | number | Yes |

#### Section 2: Safety Devices

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 2-1 | Governor Test | select | Yes |
| 2-2 | Brake Test | select | Yes |

#### Section 3: Door Operation

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| 3-1 | Door Safety Edge | boolean | Yes |
| 3-2 | Reopening Device | boolean | Yes |

> Sections 4–9 cover car interior, hoistway, machine room, emergency systems, signage, and documentation.

---

## General / Reports Templates

### 24. Site Summary Report

**Category:** General
**Description:** Comprehensive site overview and summary report
**Sections:** 3 | **Pages:** 4

#### Section 1: Site Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| siteName | Site Name | text | Yes |
| siteAddress | Site Address | text | Yes |
| clientName | Client Name | text | Yes |
| siteType | Site Type | text | Yes |
| supplyAuthority | Supply Authority | text | No |
| nominatedMaxDemand | Nominated Max Demand | text | No |

#### Section 2: Subsection Summary

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| totalSubsections | Total Number of Subsections | number | Yes |
| compliantSubsections | Compliant Subsections | number | Yes |
| nonCompliantSubsections | Non-Compliant Subsections | number | Yes |
| pendingInspections | Pending Inspections | number | Yes |

#### Section 3: Overall Status & Recommendations

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| overallCompliance | Overall Compliance Status | select | Yes |
| keyFindings | Key Findings | textarea | No |
| recommendations | Recommendations | textarea | No |
| nextActions | Next Actions Required | textarea | No |

---

### 25. Standard Progress Report

**Category:** General
**Description:** Regular project progress report covering work completed, schedule status, quality control, safety, and upcoming activities
**Sections:** 6 | **Pages:** 5

#### Section 1: Report Information

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| reportDate | Report Date | date | Yes |
| reportPeriod | Reporting Period | text | Yes |
| projectName | Project Name | text | Yes |
| contractorName | Contractor Name | text | Yes |
| reportedBy | Reported By | text | Yes |

#### Section 2: Work Completed This Period

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| completedActivities | Activities Completed | textarea | Yes |
| milestonesAchieved | Milestones Achieved | textarea | No |
| materialsDelivered | Materials Delivered/Installed | textarea | No |
| workersOnSite | Number of Workers on Site | number | No |

#### Section 3: Schedule Status

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| overallProgress | Overall Progress Percentage | number | Yes |
| scheduleVariance | Schedule Variance (Days Ahead/Behind) | text | Yes |
| delaysIssues | Delays or Issues Encountered | textarea | No |
| recoveryActions | Recovery Actions Taken | textarea | No |

#### Section 4: Quality Control & Inspections

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| inspectionsCompleted | Inspections Completed This Period | textarea | No |
| nonConformances | Non-Conformances Identified | textarea | No |
| correctiveActions | Corrective Actions Implemented | textarea | No |
| qualityIssues | Outstanding Quality Issues | textarea | No |

#### Section 5: Safety & Environmental

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| safetyIncidents | Safety Incidents/Near Misses | textarea | Yes |
| safetyMeetings | Safety Meetings/Toolbox Talks Held | number | No |
| environmentalCompliance | Environmental Compliance Status | textarea | No |
| safetyObservations | Safety Observations/Improvements | textarea | No |

#### Section 6: Upcoming Work & Planning

| Field ID | Field Name | Type | Required |
|----------|-----------|------|----------|
| plannedActivities | Planned Activities (Next Period) | textarea | Yes |
| expectedMilestones | Expected Milestones | textarea | No |
| resourceRequirements | Resource Requirements | textarea | No |
| issuesForAttention | Issues Requiring Client Attention | textarea | No |

---

### 26. Site Drawing Inspection

**Category:** Site Drawing
**Description:** Interactive PDF site drawing inspection with pin-based annotations for marking specific locations and adding photos and notes
**Sections:** 0 (no predefined sections) | **Pages:** 1

This is a special template — it has no predefined form sections. Instead, it uses the interactive floor plan system with drag-and-drop pins for marking locations on a site drawing.

---

## PDF Report Templates

These are separate from inspection templates. They define the **output format** of generated PDF reports (not the inspection form). Configured in `src/hooks/usePDFTemplateGateway.ts`:

| Template ID | Name | Accent Color | Sections |
|------------|------|-------------|----------|
| `site_summary` | Site Summary | Blue | Health Metrics, Health by Category, Summary Statistics, Subsection Details, COC Validations, Recent Inspections |
| `inspection` | Inspection | Green | Inspection Details, Findings, Photo Evidence, Signatures |
| `floor_plan` | Floor Plan | Orange | Floor Plan Image, Pins Summary, Pin Details |
| `asset_verification` | Asset Verification | Purple | Asset Summary, Electrical Meters, Water Meters, Equipment |
| `compliance` | Compliance | Blue | Compliance Summary, COC Status by Site, Expiring Certificates, Non-Compliant Items |
| `coc_validation` | COC Validation | Green | Validation Status, Administrative Details, Technical Evaluation, Check Results, Critical Failures, Recommendations |
| `comprehensive_inspection` | Comprehensive Inspection | Green | Inspection Details, Findings, Snag Summary, Before/After Photos, Compliance Checklist, Sign-off Section |
