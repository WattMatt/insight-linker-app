-- Clear existing mock templates
DELETE FROM inspection_templates;

-- Insert actual Firebase templates

-- 1. Electrical Meter Inspection
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Electrical Meter Inspection Report',
  'General',
  'Comprehensive inspection report for electrical metering installations, covering documentation, physical inspection, functional testing, and data verification',
  4,
  6,
  '[
    {
      "id": "documentationVerification",
      "name": "Documentation Verification",
      "order_index": 1,
      "items": [
        {"id": "1_1", "name": "Approved shop drawings and meter layout received", "type": "checklist", "required": true},
        {"id": "1_2", "name": "Meter datasheet (type, class, serial no.) on file", "type": "checklist", "required": true},
        {"id": "1_3", "name": "CT/VT ratio certificates and calibration reports", "type": "checklist", "required": true},
        {"id": "1_4", "name": "Meter programming spec (tariff schedule, TOU settings)", "type": "checklist", "required": true},
        {"id": "1_5", "name": "Sealing procedure and seal number documented", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "physicalInspection",
      "name": "Physical Inspection",
      "order_index": 2,
      "items": [
        {"id": "2_1", "name": "Correct meter model and rating installed", "type": "checklist", "required": true},
        {"id": "2_2", "name": "Meter mounted per approved location and orientation", "type": "checklist", "required": true},
        {"id": "2_3", "name": "Seals intact (seal no. matches documentation)", "type": "checklist", "required": true},
        {"id": "2_4", "name": "Enclosure IP rating and lockable cover in place", "type": "checklist", "required": true},
        {"id": "2_5", "name": "CT test blocks installed close to meter as per NRS 057", "type": "checklist", "required": true},
        {"id": "2_6", "name": "CT/VT wiring neat, correctly colour-coded, and labeled", "type": "checklist", "required": true},
        {"id": "2_7", "name": "CT polarity and phase sequence visually confirmed", "type": "checklist", "required": true},
        {"id": "2_8", "name": "VT connections verified", "type": "checklist", "required": true},
        {"id": "2_9", "name": "Earthing of meter enclosure and test blocks confirmed", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "functionalTesting",
      "name": "Functional Testing",
      "order_index": 3,
      "items": [
        {"id": "3_1", "name": "Insulation resistance >1 MΩ @ 500 V DC", "type": "checklist", "required": true},
        {"id": "3_2", "name": "Continuity of protective conductors (SANS 10142-1)", "type": "checklist", "required": true},
        {"id": "3_3", "name": "CT ratio test against calibration standard", "type": "checklist", "required": true},
        {"id": "3_4", "name": "VT ratio test against calibration standard", "type": "checklist", "required": true},
        {"id": "3_5", "name": "Meter accuracy test (load injection method)", "type": "checklist", "required": true},
        {"id": "3_6", "name": "Tamper detection relay / alarm function", "type": "checklist", "required": false},
        {"id": "3_7", "name": "Seal re-application after testing", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "dataExtraction",
      "name": "Data Extraction & Tariff Verification",
      "order_index": 4,
      "items": [
        {"id": "4_1", "name": "IR / optical port communication test", "type": "checklist", "required": true},
        {"id": "4_2", "name": "Modbus / Ethernet link configuration verified", "type": "checklist", "required": false},
        {"id": "4_3", "name": "Data logger heartbeat and timestamp accuracy", "type": "checklist", "required": true},
        {"id": "4_4", "name": "Extracted energy registers match test readings", "type": "checklist", "required": true},
        {"id": "4_5", "name": "Tariff tables programmed as per client schedule", "type": "checklist", "required": true},
        {"id": "4_6", "name": "Time-of-Use periods and DST settings checked", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Electrical Meter Inspection Report", "subtitle": "Comprehensive Metering Installation Assessment", "company_name": "Watson Mattheus"}'::jsonb
);

-- 2. EMB Inspection
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Electrical Main Board (EMB) Inspection',
  'Low Voltage & Line Shops',
  'Detailed inspection checklist for electrical main boards including physical safety, SANS compliance, control systems, and tenant management',
  4,
  5,
  '[
    {
      "id": "physicalSafetyChecks",
      "name": "Physical & Safety Checks",
      "order_index": 1,
      "items": [
        {"id": "enclosureCondition", "name": "EMB Enclosure Condition (corrosion, damage)", "type": "checklist", "required": true},
        {"id": "doorLocks", "name": "Door Locks & Security", "type": "checklist", "required": true},
        {"id": "ventilation", "name": "Ventilation & Cooling Systems", "type": "checklist", "required": true},
        {"id": "internalCleanliness", "name": "Internal Cleanliness (dust, debris)", "type": "checklist", "required": true},
        {"id": "warningLabels", "name": "Warning Labels & Signage", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "sansComplianceChecks",
      "name": "SANS Compliance Checks",
      "order_index": 2,
      "items": [
        {"id": "mainBoardLabelling", "name": "Main Board Labelling (Supply Source, Voltage)", "type": "checklist", "required": true},
        {"id": "outgoingCircuitLabelling", "name": "Outgoing Circuit Labelling & Schedule", "type": "checklist", "required": true},
        {"id": "phaseIdentification", "name": "Phase Color Coding & Identification", "type": "checklist", "required": true},
        {"id": "earthingBonding", "name": "Main Earthing & Bonding Conductor Sizing", "type": "checklist", "required": true},
        {"id": "mainSwitchAccessibility", "name": "Main Switch Accessibility & Operation", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "fortyEightVoltControlChecks",
      "name": "48V Control Checks",
      "order_index": 3,
      "items": [
        {"id": "keySwitchWiring", "name": "Key Switch Wiring", "type": "checklist", "required": true},
        {"id": "panelLightingWiring", "name": "Panel Lighting Wiring", "type": "checklist", "required": true},
        {"id": "supplyBreakers", "name": "Supply Breakers", "type": "checklist", "required": true},
        {"id": "transformer", "name": "Transformer", "type": "checklist", "required": true},
        {"id": "wiringLabelling", "name": "Wiring Labelling", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "snagList",
      "name": "Observations & Snag List",
      "order_index": 4,
      "items": [
        {"id": "observations", "name": "General observations and snags", "type": "textarea", "required": false}
      ]
    }
  ]'::jsonb,
  '{"title": "EMB Inspection Report", "subtitle": "Electrical Main Board Assessment", "company_name": "Watson Mattheus"}'::jsonb
);

-- 3. Factory Acceptance Test
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Factory Acceptance Test (FAT) Inspection Report',
  'Low Voltage & Line Shops',
  'Comprehensive FAT inspection covering documentation, physical inspection, functional testing, ATS commissioning, solar components, and generator integration',
  6,
  10,
  '[
    {
      "id": "documentationVerification",
      "name": "Documentation Verification",
      "order_index": 1,
      "items": [
        {"id": "shopDrawings", "name": "Final approved shop drawings received", "type": "checklist", "required": true},
        {"id": "wiringDiagrams", "name": "Wiring diagrams and schematics match physical layout", "type": "checklist", "required": true},
        {"id": "componentDatasheets", "name": "Component datasheets and certificates of conformity", "type": "checklist", "required": true},
        {"id": "routineTestCertificates", "name": "Manufacturer''s routine test certificates", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "physicalInspection",
      "name": "Physical Inspection",
      "order_index": 2,
      "items": [
        {"id": "enclosureType", "name": "Enclosure type and IP rating as per spec", "type": "checklist", "required": true},
        {"id": "dimensionsLayout", "name": "Dimensions and internal layout match approved drawings", "type": "checklist", "required": true},
        {"id": "busbar", "name": "Busbar sizing, spacing, color-coding, and insulation", "type": "checklist", "required": true},
        {"id": "cts", "name": "CTs installed and labeled as per schematic", "type": "checklist", "required": true},
        {"id": "earthNeutralBar", "name": "Earth and neutral bar continuity (visual and mechanical)", "type": "checklist", "required": true},
        {"id": "componentLabeling", "name": "Component labeling and terminal identification", "type": "checklist", "required": true},
        {"id": "cableEntry", "name": "Cable entry points and gland plate configuration", "type": "checklist", "required": true},
        {"id": "controlWiring", "name": "48V control wiring neatly routed and segregated per schematic", "type": "checklist", "required": true},
        {"id": "enclosureMaterial", "name": "Enclosure constructed from certified 312-grade corrosion-resistant steel", "type": "checklist", "required": true},
        {"id": "powderCoating", "name": "Powder coating inspected per spec (DFT, Adhesion, Salt Spray, Color/Gloss)", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "functionalTesting",
      "name": "Functional Testing",
      "order_index": 3,
      "items": [
        {"id": "protectiveConductors", "name": "Continuity of protective conductors (SANS 10142-1: 8.6.2)", "type": "checklist", "required": true},
        {"id": "insulationResistance", "name": "Insulation resistance >1 MΩ @ 500V DC", "type": "checklist", "required": true},
        {"id": "earthLoopImpedance", "name": "Earth loop impedance test (SANS 10142-1: 8.6.5)", "type": "checklist", "required": true},
        {"id": "ctVerification", "name": "CT ratios, wiring polarity, and connections verified", "type": "checklist", "required": true},
        {"id": "protectionDevices", "name": "Protection devices (MCBs, MCCBs, E/L units) function tested", "type": "checklist", "required": true},
        {"id": "interlocks", "name": "Interlocks, shunt trips, and control relays verified", "type": "checklist", "required": true},
        {"id": "controlCircuits", "name": "Functional test of 48V control circuits and live actuation", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "atsCommissioning",
      "name": "ABB TruONE® ATS – Commissioning",
      "order_index": 4,
      "items": [
        {"id": "modelRating", "name": "ATS model and rating confirmed against specification", "type": "checklist", "required": true},
        {"id": "mechanicalInstallation", "name": "Mechanical installation and mounting verified", "type": "checklist", "required": true},
        {"id": "hmiDipSwitch", "name": "HMI / DIP switch interface functioning", "type": "checklist", "required": true},
        {"id": "settingsVerified", "name": "Settings verified and recorded", "type": "checklist", "required": true},
        {"id": "communication", "name": "Communication setup (Modbus / Ethernet)", "type": "checklist", "required": false},
        {"id": "manualTransfer", "name": "Manual transfer test via HMI", "type": "checklist", "required": true},
        {"id": "autoTransfer", "name": "Simulated auto transfer (loss of supply)", "type": "checklist", "required": true},
        {"id": "ledAlarms", "name": "LED indications and alarm outputs verified", "type": "checklist", "required": true},
        {"id": "configFile", "name": "Configuration file saved/exported", "type": "checklist", "required": false},
        {"id": "commissioningCert", "name": "Signed commissioning certificate attached", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "solarComponentCheck",
      "name": "Solar Component Check",
      "order_index": 5,
      "items": [
        {"id": "inverterCircuitBreaker", "name": "Inverter Circuit Breaker", "type": "checklist", "required": true},
        {"id": "isolatingTransformer", "name": "1250VA isolating transformer", "type": "checklist", "required": true},
        {"id": "singlePhasePlugPoint", "name": "Single Phase plug point", "type": "checklist", "required": true},
        {"id": "fanFuse", "name": "Fan fuse", "type": "checklist", "required": true},
        {"id": "backupUpsConnection", "name": "Backup UPS connected to isolating transformer", "type": "checklist", "required": true},
        {"id": "gridMonitoringRelayVoltage", "name": "Grid Monitoring Relay voltage pickup", "type": "checklist", "required": true},
        {"id": "powerMeterCts", "name": "Power Meter CTs positioned correctly", "type": "checklist", "required": true},
        {"id": "mechanicalInterlock", "name": "Bus Contactors mechanically interlocked", "type": "checklist", "required": true},
        {"id": "electricalInterlock", "name": "Bus Contactors electrically interlocked", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "generatorIntegration",
      "name": "Generator Integration",
      "order_index": 6,
      "items": [
        {"id": "tieInBreakerSize", "name": "Tie-in breaker size verification", "type": "checklist", "required": true},
        {"id": "motorizedBreakerControl", "name": "Motorized breaker control settings confirmed", "type": "checklist", "required": true},
        {"id": "motorizedBreakerOperation", "name": "Motorized breaker operation test", "type": "checklist", "required": true},
        {"id": "generatorStartStopSignal", "name": "Generator start/stop signal integration", "type": "checklist", "required": true},
        {"id": "breakerInterlockLogic", "name": "Breaker interlock logic confirmed", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Factory Acceptance Test Report", "subtitle": "Comprehensive FAT Inspection", "company_name": "Watson Mattheus"}'::jsonb
);

-- 4. Generator Installation Inspection
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Generator Installation Inspection',
  'Generator',
  'Generator installation verification covering integration, documentation, physical inspection, and functional testing',
  4,
  6,
  '[
    {
      "id": "generatorIntegration",
      "name": "Generator Integration",
      "order_index": 1,
      "items": [
        {"id": "tieInBreakerSize", "name": "Tie-in breaker size verification", "type": "checklist", "required": true},
        {"id": "tieInBreakerPositioning", "name": "Tie-in breaker positioning verification", "type": "checklist", "required": true},
        {"id": "motorizedBreakerControl", "name": "Motorized breaker control settings confirmed", "type": "checklist", "required": true},
        {"id": "motorizedBreakerOperation", "name": "Motorized breaker operation test", "type": "checklist", "required": true},
        {"id": "generatorStartStopSignal", "name": "Generator start/stop signal integration", "type": "checklist", "required": true},
        {"id": "generatorLoadTransfer", "name": "Generator load transfer sequence verified", "type": "checklist", "required": true},
        {"id": "breakerInterlockLogic", "name": "Breaker interlock logic confirmed", "type": "checklist", "required": true},
        {"id": "controlPanelSettings", "name": "Control panel settings documented", "type": "checklist", "required": true},
        {"id": "signalFeedback", "name": "Signal feedback from generator to monitoring system", "type": "checklist", "required": false},
        {"id": "emergencyStopIntegration", "name": "Emergency stop integration and test", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "documentation_verification",
      "name": "Documentation Verification",
      "order_index": 2,
      "items": [
        {"id": "final_generator_specs", "name": "Final generator specs", "type": "checklist", "required": true},
        {"id": "engine_alternator_certificates", "name": "Engine & alternator certificates", "type": "checklist", "required": true},
        {"id": "controller_datasheets_wiring_diagrams", "name": "Controller datasheets & wiring diagrams", "type": "checklist", "required": true},
        {"id": "gsm_module_documentation", "name": "GSM module documentation", "type": "checklist", "required": false},
        {"id": "commissioning_checklist_test_certs", "name": "Commissioning checklist & test certs", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "physical_inspection",
      "name": "Physical Inspection",
      "order_index": 3,
      "items": [
        {"id": "generator_enclosure_condition", "name": "Generator enclosure condition", "type": "checklist", "required": true},
        {"id": "exhaust_cooling_systems_checked", "name": "Exhaust & cooling systems checked", "type": "checklist", "required": true},
        {"id": "fuel_system_inspection", "name": "Fuel system inspection", "type": "checklist", "required": true},
        {"id": "engine_type_model_verified", "name": "Engine type/model verified", "type": "checklist", "required": true},
        {"id": "alternator_type_rating_confirmed", "name": "Alternator type/rating confirmed", "type": "checklist", "required": true},
        {"id": "controller_model", "name": "Controller model", "type": "checklist", "required": true},
        {"id": "gsm_module_installed", "name": "GSM module installed", "type": "checklist", "required": false},
        {"id": "cable_entry_earthing_verified", "name": "Cable entry & earthing verified", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "functional_testing",
      "name": "Functional Testing",
      "order_index": 4,
      "items": [
        {"id": "emergency_stop_function", "name": "Emergency stop function", "type": "checklist", "required": true},
        {"id": "engine_start_stop_test", "name": "Engine start/stop test", "type": "checklist", "required": true},
        {"id": "alternator_output_voltage", "name": "Alternator output voltage", "type": "checklist", "required": true},
        {"id": "load_transfer_sequence", "name": "Load transfer sequence", "type": "checklist", "required": true},
        {"id": "gsm_communication_test", "name": "GSM communication test", "type": "checklist", "required": false},
        {"id": "battery_charging_voltage_drop", "name": "Battery charging voltage & drop", "type": "checklist", "required": true},
        {"id": "controller_settings_recorded", "name": "Controller settings recorded", "type": "checklist", "required": true},
        {"id": "alarm_simulation", "name": "Alarm simulation", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Generator Installation Inspection", "subtitle": "Generator System Verification", "company_name": "Watson Mattheus"}'::jsonb
);

-- 5. Low Voltage Line Shop Audit
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Low Voltage Line Shop Board Audit',
  'Low Voltage & Line Shops',
  'Comprehensive audit template for line shop electrical boards including visual documentation, component verification, and quality assessment',
  6,
  8,
  '[
    {
      "id": "normalBoardImages",
      "name": "Normal Board State Images",
      "order_index": 1,
      "items": [
        {"id": "boardOpen", "name": "Board (Open)", "type": "image", "required": true},
        {"id": "boardClosed", "name": "Board (Closed)", "type": "image", "required": true},
        {"id": "internalLegend", "name": "Internal Legend", "type": "image", "required": true}
      ]
    },
    {
      "id": "emergencyBoardImages",
      "name": "Emergency Board State Images",
      "order_index": 2,
      "items": [
        {"id": "boardOpen", "name": "Board (Open)", "type": "image", "required": true},
        {"id": "boardClosed", "name": "Board (Closed)", "type": "image", "required": true},
        {"id": "internalLegend", "name": "Internal Legend", "type": "image", "required": true}
      ]
    },
    {
      "id": "componentImages",
      "name": "Key Component Images",
      "order_index": 3,
      "items": [
        {"id": "mainBreaker", "name": "Main Breaker", "type": "image", "required": true},
        {"id": "meter", "name": "Meter", "type": "image", "required": true},
        {"id": "ct", "name": "CT", "type": "image", "required": true},
        {"id": "earthLeakage", "name": "Earth Leakage", "type": "image", "required": true},
        {"id": "other", "name": "Other", "type": "image", "required": false}
      ]
    },
    {
      "id": "normalWiringImages",
      "name": "Normal Wiring Images",
      "order_index": 4,
      "items": [
        {"id": "cleanliness", "name": "Cleanliness", "type": "image", "required": true},
        {"id": "mainCableGland", "name": "Glanding", "type": "image", "required": true},
        {"id": "generalWiring", "name": "General Wiring", "type": "image", "required": true},
        {"id": "meterWiring", "name": "Meter Wiring", "type": "image", "required": true}
      ]
    },
    {
      "id": "emergencyWiringImages",
      "name": "Emergency Wiring Images",
      "order_index": 5,
      "items": [
        {"id": "cleanliness", "name": "Cleanliness", "type": "image", "required": true},
        {"id": "mainCableGland", "name": "Glanding", "type": "image", "required": true},
        {"id": "generalWiring", "name": "General Wiring", "type": "image", "required": true},
        {"id": "meterWiring", "name": "Meter Wiring", "type": "image", "required": true}
      ]
    },
    {
      "id": "observations",
      "name": "Observations & Quality",
      "order_index": 6,
      "items": [
        {"id": "comments", "name": "General Observations & Comments", "type": "textarea", "required": false},
        {"id": "qualityRating", "name": "Overall Quality Rating (1-5)", "type": "rating", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Line Shop Board Audit", "subtitle": "Low Voltage Electrical Board Assessment", "company_name": "Watson Mattheus"}'::jsonb
);

-- 6. Mini Sub Inspection
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Miniature Substation Inspection Report',
  'Medium & High Voltage',
  'Comprehensive inspection for miniature substations covering visual, electrical, thermal, service history, documentation, and safety checks',
  5,
  7,
  '[
    {
      "id": "visualStructural",
      "name": "Visual & Structural Checks",
      "order_index": 1,
      "items": [
        {"id": "enclosureDamage", "name": "Enclosure: Physical Damage Assessment", "type": "checklist", "required": true},
        {"id": "waterIngress", "name": "Cable Entries/Ducts: Signs of Water Ingress", "type": "checklist", "required": true},
        {"id": "ventilation", "name": "Ventilation Louvers: Obstruction/Damage", "type": "checklist", "required": true},
        {"id": "lockingMechanism", "name": "Locking Mechanisms & Door Hinges", "type": "checklist", "required": true},
        {"id": "foundationCondition", "name": "Foundation/Plinth Condition", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "electricalThermal",
      "name": "Electrical, Functional & Thermal Checks",
      "order_index": 2,
      "items": [
        {"id": "transformerSpecs", "name": "Transformer Specs: Rating (kVA), Voltage, Impedance", "type": "checklist", "required": true},
        {"id": "insulationResistanceLV", "name": "Insulation Resistance (Megger): LV Side", "type": "checklist", "required": true},
        {"id": "insulationResistanceHV", "name": "Insulation Resistance (Megger): HV Side", "type": "checklist", "required": true},
        {"id": "oilLevelTemp", "name": "Transformer Oil Level & Temperature", "type": "checklist", "required": true},
        {"id": "thermalScan", "name": "Thermal Scan: Connections & Terminations", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "serviceMaintenance",
      "name": "Service & Maintenance History",
      "order_index": 3,
      "items": [
        {"id": "serviceLogs", "name": "Service Logs & Fault History: Review", "type": "checklist", "required": true},
        {"id": "internalCleanliness", "name": "Internal Cleanliness: Dust, Contaminants", "type": "checklist", "required": true},
        {"id": "oilSample", "name": "Oil Sample Taken (if required)", "type": "checklist", "required": false}
      ]
    },
    {
      "id": "documentationCompliance",
      "name": "Documentation & Compliance",
      "order_index": 4,
      "items": [
        {"id": "sldAvailability", "name": "Single Line Diagram (SLD): Availability & Accuracy", "type": "checklist", "required": true},
        {"id": "cocRecords", "name": "Certificates of Compliance (COCs): Record Keeping", "type": "checklist", "required": true},
        {"id": "warningLabels", "name": "Danger & Warning Labels: Visibility & Condition", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "safetyChecks",
      "name": "Critical Safety Checks",
      "order_index": 5,
      "items": [
        {"id": "hvEarthingIntegrity", "name": "HV Earthing System Integrity Verification", "type": "checklist", "required": true},
        {"id": "lvEarthingIntegrity", "name": "LV Earthing & Bonding Integrity", "type": "checklist", "required": true},
        {"id": "accessControl", "name": "Access Control & Security", "type": "checklist", "required": true},
        {"id": "fireExtinguisher", "name": "Fire Extinguisher Availability & Service Date", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Miniature Substation Inspection", "subtitle": "Medium Voltage Infrastructure Assessment", "company_name": "Watson Mattheus"}'::jsonb
);

-- 7. Pre-Final FAT Inspection  
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Miniature Substation Pre-FAT and Post-FAT',
  'Medium & High Voltage',
  'Pre-factory and post-factory acceptance testing for miniature substations covering electrical details, visual inspection, safety, and cover verification',
  4,
  6,
  '[
    {
      "id": "electricalDetails",
      "name": "PRE FAT INSPECTION - ELECTRICAL DETAILS",
      "order_index": 1,
      "items": [
        {"id": "lvTransformerSpec", "name": "LV Transformer Spec: Rating (KVA), Voltage", "type": "text", "required": true},
        {"id": "tapSetting", "name": "Tap setting", "type": "text", "required": true},
        {"id": "hvSpec", "name": "HV Spec; Rating (KVA), Voltage", "type": "text", "required": true},
        {"id": "busbarSizing", "name": "Busbar sizing and spacing", "type": "checklist", "required": true},
        {"id": "mainLvBreaker", "name": "Main LV Breaker (Type/Rating)", "type": "text", "required": true},
        {"id": "mainLvBreakerSettings", "name": "Main LV Breaker Settings", "type": "text", "required": true},
        {"id": "mainLvBreakerMeter", "name": "Main LV Breaker meter", "type": "checklist", "required": true},
        {"id": "mainMeterCtRatio", "name": "Main meter CT ratio", "type": "text", "required": true},
        {"id": "subBreaker", "name": "Sub Breaker (Type/Rating)", "type": "text", "required": true},
        {"id": "subBreakerSettings", "name": "Sub Breaker Settings", "type": "text", "required": true},
        {"id": "subBreakerMeter", "name": "Sub Breaker meter", "type": "checklist", "required": true},
        {"id": "subBreakerCtRatio", "name": "Sub Breaker CT ratio", "type": "text", "required": true},
        {"id": "cableLugCrimping", "name": "All cable lug crimping and heat shrink", "type": "checklist", "required": true},
        {"id": "busbarConnectionTorque", "name": "Busbar & Connection Torque (Visual)", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "visual",
      "name": "PRE FAT INSPECTION - VISUAL",
      "order_index": 2,
      "items": [
        {"id": "enclosureTypeIp", "name": "Enclosure type and IP rating as per spec", "type": "checklist", "required": true},
        {"id": "enclosurePhysical", "name": "Enclosure Physical", "type": "checklist", "required": true},
        {"id": "cableEntries", "name": "Cable Entries", "type": "checklist", "required": true},
        {"id": "ventilationLouvers", "name": "Ventilation louvers", "type": "checklist", "required": true},
        {"id": "lockingMechanisms", "name": "Locking Mechanisms & Door Hinges", "type": "checklist", "required": true},
        {"id": "breather", "name": "Breather", "type": "checklist", "required": true},
        {"id": "oilLevelIndicator", "name": "Oil level Indicator", "type": "checklist", "required": true},
        {"id": "drainTap", "name": "Drain Tap", "type": "checklist", "required": true},
        {"id": "tempProbeAccess", "name": "Temp probe access", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "safety",
      "name": "PRE FAT INSPECTION - SAFETY",
      "order_index": 3,
      "items": [
        {"id": "hvEarthing", "name": "HV Earthing", "type": "checklist", "required": true},
        {"id": "lvEarthing", "name": "LV Earthing", "type": "checklist", "required": true},
        {"id": "lvDangerWarnings", "name": "LV Danger and warning signs", "type": "checklist", "required": true},
        {"id": "hvDangerWarnings", "name": "HV Danger and warning signs", "type": "checklist", "required": true},
        {"id": "hvEarthFaultIndicator", "name": "HV Earth fault protection indicator", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "finalFatCovers",
      "name": "FINAL FAT INSPECTION - COVERS",
      "order_index": 4,
      "items": [
        {"id": "mainLvBreakerCover", "name": "Main LV Breaker (per specs)", "type": "checklist", "required": true},
        {"id": "subBreakersCover", "name": "Sub breakers", "type": "checklist", "required": true},
        {"id": "hvCovers", "name": "HV covers", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Miniature Substation Pre-FAT and Post-FAT", "subtitle": "Factory Acceptance Testing", "company_name": "Watson Mattheus"}'::jsonb
);

-- 8. RMU Snagging & Compliance
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'RMU Snagging & Compliance Report',
  'Medium & High Voltage',
  'Ring main unit inspection covering physical/structural checks, electrical verification, and critical safety assessments',
  3,
  5,
  '[
    {
      "id": "physicalChecks",
      "name": "Physical & Structural Checks",
      "order_index": 1,
      "items": [
        {"id": "housingCorrosion", "name": "Housing Corrosion Assessment (Visual)", "type": "checklist", "required": true},
        {"id": "weatherproofingSeal", "name": "Weatherproofing & Seal Integrity (Visual)", "type": "checklist", "required": true},
        {"id": "foundationPlinth", "name": "Foundation/Plinth Condition (Visual)", "type": "checklist", "required": true},
        {"id": "cableGlandPlates", "name": "Cable Gland Plates & Entry Points (Visual)", "type": "checklist", "required": true},
        {"id": "labelsSignage", "name": "Labels, Danger & Warning Signage (Visual)", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "electricalChecks",
      "name": "Electrical Checks",
      "order_index": 2,
      "items": [
        {"id": "insulatorContamination", "name": "Insulator Contamination/Damage (Visual)", "type": "checklist", "required": true},
        {"id": "busbarConnections", "name": "Busbar & Connection Torque (Visual/Thermal)", "type": "checklist", "required": true},
        {"id": "earthingContinuity", "name": "Main Earthing Bar & Continuity (Visual/Test)", "type": "checklist", "required": true},
        {"id": "gasPressure", "name": "SF6 Gas Pressure/Density Gauge Reading (Visual)", "type": "checklist", "required": true},
        {"id": "switchOperation", "name": "Switch Mechanism Operation (Manual)", "type": "checklist", "required": true},
        {"id": "interlockFunction", "name": "Mechanical & Electrical Interlocks (Functional Test)", "type": "checklist", "required": true},
        {"id": "ctVtCondition", "name": "CT/VT Condition & Wiring (Visual)", "type": "checklist", "required": true},
        {"id": "protectionRelay", "name": "Protection Relay Health & Settings (Visual)", "type": "checklist", "required": true},
        {"id": "batteryTrippingUnit", "name": "Battery/Tripping Unit Health (Visual/Test)", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "safetyChecks",
      "name": "Critical Safety Checks",
      "order_index": 3,
      "items": [
        {"id": "emergencyStop", "name": "Emergency Stop Functionality Test", "type": "checklist", "required": true},
        {"id": "livePartsIsolation", "name": "Live Parts Isolation Verification", "type": "checklist", "required": true},
        {"id": "fireSuppression", "name": "Fire Suppression System Status (if applicable)", "type": "checklist", "required": false},
        {"id": "accessControl", "name": "Access Control & Lockout/Tagout Provisions", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "RMU Snagging & Compliance Report", "subtitle": "Ring Main Unit Assessment", "company_name": "Watson Mattheus"}'::jsonb
);
