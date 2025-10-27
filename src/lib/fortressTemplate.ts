// Fortress Scope of Work Template Generator
// Based on Document: 584_FORTRESS-SCOPE_OF_WORKS.docx

export const generateFortressTemplate = () => {
  return {
    name: "FORTRESS - Complete Compliance Inspection",
    category: "General",
    description: "Comprehensive electrical inspection, verification, and reporting for Fortress sites covering RMU, miniature substations, main distribution boards, earthing & lightning protection, electrical meters, line shop boards, and general area lighting & power.",
    sections: [
      // Section 1: RMU Compliance
      {
        id: "rmu_compliance",
        name: "1. RMU Compliance Inspections & Annual Maintenance",
        order_index: 0,
        items: [
          // 1.1 Visual Inspection
          { id: "rmu_1_1_1", name: "1.1.1 Housing Integrity - Assess corrosion, weatherproofing, structural integrity", type: "checkbox", required: true },
          { id: "rmu_1_1_1_notes", name: "Housing Integrity Notes", type: "textarea", required: false },
          { id: "rmu_1_1_2", name: "1.1.2 Access Control & Labelling - Verify SANS 10142-1 compliance", type: "checkbox", required: true },
          { id: "rmu_1_1_2_notes", name: "Access Control Notes", type: "textarea", required: false },
          { id: "rmu_1_1_3", name: "1.1.3 Cable Entries & Sealing - Check for water ingress or tampering", type: "checkbox", required: true },
          { id: "rmu_1_1_3_notes", name: "Cable Entries Notes", type: "textarea", required: false },
          { id: "rmu_1_1_4", name: "1.1.4 Ventilation & Cooling - Ensure proper function", type: "checkbox", required: true },
          { id: "rmu_1_1_4_notes", name: "Ventilation Notes", type: "textarea", required: false },
          { id: "rmu_1_1_5", name: "1.1.5 Grounding & Earthing - Validate SANS 10292 compliance", type: "checkbox", required: true },
          { id: "rmu_1_1_5_notes", name: "Grounding Notes", type: "textarea", required: false },
          
          // 1.2 Electrical Integrity
          { id: "rmu_1_2_1", name: "1.2.1 Switchgear Operation - Test mechanical functionality", type: "checkbox", required: true },
          { id: "rmu_1_2_1_notes", name: "Switchgear Notes", type: "textarea", required: false },
          { id: "rmu_1_2_2", name: "1.2.2 Breaker & Protection Settings - SANS 474 & SANS 60076 compliance", type: "checkbox", required: true },
          { id: "rmu_1_2_2_notes", name: "Breaker Settings Notes", type: "textarea", required: false },
          { id: "rmu_1_2_3", name: "1.2.3 Busbar Condition - Inspect for degradation or overheating", type: "checkbox", required: true },
          { id: "rmu_1_2_3_notes", name: "Busbar Notes", type: "textarea", required: false },
          { id: "rmu_1_2_4", name: "1.2.4 Load Capacity & System Integration - SANS 780 verification", type: "checkbox", required: true },
          { id: "rmu_1_2_4_notes", name: "Load Capacity Notes", type: "textarea", required: false },
          { id: "rmu_1_2_5", name: "1.2.5 Insulation Resistance Testing - Megger test results", type: "checkbox", required: true },
          { id: "rmu_1_2_5_reading", name: "Insulation Resistance Reading (MΩ)", type: "number", required: false },
          
          // 1.3 Infrared Scanning
          { id: "rmu_1_3_1", name: "1.3.1 Heat Distribution Analysis - Conduct IR scanning", type: "checkbox", required: true },
          { id: "rmu_1_3_1_image", name: "Infrared Scan Image", type: "image", required: false },
          { id: "rmu_1_3_2", name: "1.3.2 Hot Spots Identification - Document overheating areas", type: "checkbox", required: true },
          { id: "rmu_1_3_2_notes", name: "Hot Spots Details", type: "textarea", required: false },
          { id: "rmu_1_3_3", name: "1.3.3 Circuit Stability - Uniform temperature distribution", type: "checkbox", required: true },
          
          // 1.4 Service History
          { id: "rmu_1_4_1", name: "1.4.1 Maintenance Log Review - Examine past records", type: "checkbox", required: true },
          { id: "rmu_1_4_1_notes", name: "Maintenance History Notes", type: "textarea", required: false },
          { id: "rmu_1_4_2", name: "1.4.2 Dielectric Oil & SF6 Gas Checks - Test pressure levels", type: "checkbox", required: false },
          { id: "rmu_1_4_2_reading", name: "Gas Pressure Reading", type: "text", required: false },
          { id: "rmu_1_4_3", name: "1.4.3 Routine Cleaning & Component Tightening", type: "checkbox", required: true },
          { id: "rmu_1_4_4", name: "1.4.4 Emergency Operation Testing", type: "checkbox", required: true },
        ]
      },
      
      // Section 2: Miniature Substations
      {
        id: "miniature_substations",
        name: "2. Miniature Substations Compliance Inspections & Annual Maintenance",
        order_index: 1,
        items: [
          // 2.1 Visual & Structural
          { id: "mini_2_1_1a", name: "2.1.1a Enclosure Integrity - Condition check for damage", type: "checkbox", required: true },
          { id: "mini_2_1_1a_notes", name: "Enclosure Condition Notes", type: "textarea", required: false },
          { id: "mini_2_1_1b", name: "2.1.1b Weatherproofing - Verify seals and gaskets", type: "checkbox", required: true },
          { id: "mini_2_1_2", name: "2.1.2 Door and Seal Inspection - Access security check", type: "checkbox", required: true },
          { id: "mini_2_1_3", name: "2.1.3 Cable Entry Points & Ducting - Inspect for water ingress", type: "checkbox", required: true },
          { id: "mini_2_1_3_notes", name: "Cable Entry Notes", type: "textarea", required: false },
          { id: "mini_2_1_4a", name: "2.1.4a Labelling - SANS 10142-1 compliance", type: "checkbox", required: true },
          { id: "mini_2_1_4b", name: "2.1.4b Documentation Accuracy - Match SLDs", type: "checkbox", required: true },
          { id: "mini_2_1_5", name: "2.1.5 Accessibility & Ergonomics - Maintenance access", type: "checkbox", required: true },
          { id: "mini_2_1_5_image", name: "Photographic Documentation", type: "image", required: false },
          
          // 2.2 Electrical Integrity
          { id: "mini_2_2_1", name: "2.2.1 Specification Verification - Compare with manufacturer data", type: "checkbox", required: true },
          { id: "mini_2_2_1_kva", name: "Transformer Rating (kVA)", type: "number", required: false },
          { id: "mini_2_2_1_hv", name: "HV Voltage Level", type: "text", required: false },
          { id: "mini_2_2_1_lv", name: "LV Voltage Level", type: "text", required: false },
          { id: "mini_2_2_2a", name: "2.2.2a Control Systems Check - Review relay settings", type: "checkbox", required: true },
          { id: "mini_2_2_2b", name: "2.2.2b Functional Consistency - Operational tests", type: "checkbox", required: true },
          { id: "mini_2_2_3", name: "2.2.3 Connection & Component Status - Terminal inspections", type: "checkbox", required: true },
          { id: "mini_2_2_4", name: "2.2.4 Insulation & Resistance Testing - Megger tests", type: "checkbox", required: true },
          { id: "mini_2_2_4_reading", name: "Insulation Resistance (MΩ)", type: "number", required: false },
          { id: "mini_2_2_5", name: "2.2.5 Load & Performance Analysis - Current capacity verification", type: "checkbox", required: true },
          { id: "mini_2_2_5_load", name: "Current Load (%)", type: "number", required: false },
          
          // 2.3 Thermal & Infrared
          { id: "mini_2_3_1a", name: "2.3.1a Infrared Imaging - Heat signature analysis", type: "checkbox", required: true },
          { id: "mini_2_3_1a_image", name: "Thermal Image", type: "image", required: false },
          { id: "mini_2_3_1b", name: "2.3.1b Hot Spots Identification", type: "checkbox", required: true },
          { id: "mini_2_3_1b_notes", name: "Hot Spots Details", type: "textarea", required: false },
          { id: "mini_2_3_2", name: "2.3.2 Correlation with Operational Load - Dynamic testing", type: "checkbox", required: true },
          { id: "mini_2_3_3", name: "2.3.3 Preventative Follow-Up - Action plan for anomalies", type: "checkbox", required: true },
          
          // 2.4 Service History
          { id: "mini_2_4_1a", name: "2.4.1a Maintenance Logs - Scrutinize service records", type: "checkbox", required: true },
          { id: "mini_2_4_1b", name: "2.4.1b Documentation Consistency", type: "checkbox", required: true },
          { id: "mini_2_4_2a", name: "2.4.2a Routine Cleaning - Debris removal", type: "checkbox", required: true },
          { id: "mini_2_4_2b", name: "2.4.2b Lubrication & Tightening", type: "checkbox", required: true },
          { id: "mini_2_4_3a", name: "2.4.3a Scheduled Testing - Component testing", type: "checkbox", required: true },
          { id: "mini_2_4_3b", name: "2.4.3b Proactive Repairs - Component replacements", type: "checkbox", required: true },
          
          // 2.5 Transformer Oil
          { id: "mini_2_5_1a", name: "2.5.1a Oil Level Check - Visual inspection", type: "checkbox", required: true },
          { id: "mini_2_5_1a_level", name: "Oil Level Status", type: "select", required: false, options: ["Normal", "Low", "Critical"] },
          { id: "mini_2_5_1b", name: "2.5.1b Leak Detection - Examine for seepage", type: "checkbox", required: true },
          { id: "mini_2_5_1c", name: "2.5.1c Seal Condition - Inspect gaskets", type: "checkbox", required: true },
          { id: "mini_2_5_2a", name: "2.5.2a Dielectric Strength Test - Breakdown voltage", type: "checkbox", required: false },
          { id: "mini_2_5_2a_result", name: "Breakdown Voltage (kV)", type: "number", required: false },
          { id: "mini_2_5_2b", name: "2.5.2b Moisture Content Analysis - Karl Fischer", type: "checkbox", required: false },
          { id: "mini_2_5_2b_result", name: "Moisture Content (ppm)", type: "number", required: false },
          { id: "mini_2_5_2c", name: "2.5.2c Dissolved Gas Analysis (DGA)", type: "checkbox", required: false },
          { id: "mini_2_5_2c_notes", name: "DGA Results", type: "textarea", required: false },
          { id: "mini_2_5_3", name: "2.5.3 Biannual Maintenance - Top-up, filtration, sludge removal", type: "checkbox", required: false },
          
          // 2.6 Documentation
          { id: "mini_2_6_1", name: "2.6.1 Comprehensive Reporting - Compile findings", type: "checkbox", required: true },
          { id: "mini_2_6_2", name: "2.6.2 Standards Verification - SANS 10142-1 compliance", type: "checkbox", required: true },
          { id: "mini_2_6_3", name: "2.6.3 Recommendations & Risk Mitigation - Action plan", type: "checkbox", required: true },
          { id: "mini_2_6_3_actions", name: "Prioritized Corrective Actions", type: "textarea", required: false },
          { id: "mini_2_6_4", name: "2.6.4 Oil Condition Documentation", type: "checkbox", required: false },
        ]
      },
      
      // Section 3: Main Distribution Boards
      {
        id: "main_distribution_boards",
        name: "3. Main Distribution Boards Compliance Inspections & Annual Maintenance",
        order_index: 2,
        items: [
          // 3.1 Visual & Structural
          { id: "mdb_3_1_1a", name: "3.1.1a Physical Damage - Examine for dents, cracks, corrosion", type: "checkbox", required: true },
          { id: "mdb_3_1_1a_notes", name: "Physical Damage Notes", type: "textarea", required: false },
          { id: "mdb_3_1_1b", name: "3.1.1b Moisture & Dust Protection - Check IP ratings", type: "checkbox", required: true },
          { id: "mdb_3_1_2a", name: "3.1.2a Internal Layout - SANS 10142-1 spacing", type: "checkbox", required: true },
          { id: "mdb_3_1_2b", name: "3.1.2b Labelling & Identification - Verify clarity", type: "checkbox", required: true },
          { id: "mdb_3_1_3", name: "3.1.3 Connection Integrity - Check terminals & wiring", type: "checkbox", required: true },
          { id: "mdb_3_1_3_notes", name: "Connection Issues", type: "textarea", required: false },
          { id: "mdb_3_1_4", name: "3.1.4 Photographic Documentation - Interior & exterior", type: "image", required: false },
          
          // 3.2 Electrical Integrity
          { id: "mdb_3_2_1", name: "3.2.1 Operational Checks - Test breakers, switches, interlocks", type: "checkbox", required: true },
          { id: "mdb_3_2_1_notes", name: "Operational Issues", type: "textarea", required: false },
          { id: "mdb_3_2_2", name: "3.2.2 Protection & Control Settings - SANS 474 compliance", type: "checkbox", required: true },
          { id: "mdb_3_2_2_settings", name: "Protection Settings Record", type: "textarea", required: false },
          { id: "mdb_3_2_3", name: "3.2.3 Insulation Resistance Testing - Megger tests", type: "checkbox", required: true },
          { id: "mdb_3_2_3_reading", name: "Insulation Resistance (MΩ)", type: "number", required: false },
          { id: "mdb_3_2_4", name: "3.2.4 Earthing & Bonding - SANS 10292 compliance", type: "checkbox", required: true },
          { id: "mdb_3_2_4_impedance", name: "Earth Loop Impedance (Ω)", type: "number", required: false },
          { id: "mdb_3_2_5", name: "3.2.5 System Integration - Load distribution balance", type: "checkbox", required: true },
          { id: "mdb_3_2_5_notes", name: "Load Balance Notes", type: "textarea", required: false },
          
          // 3.3 Thermal & Infrared
          { id: "mdb_3_3_1", name: "3.3.1 Infrared Imaging - Heat pattern analysis", type: "checkbox", required: true },
          { id: "mdb_3_3_1_image", name: "Thermal Image", type: "image", required: false },
          { id: "mdb_3_3_2", name: "3.3.2 Hotspots Identification - Busbars, breaker terminals", type: "checkbox", required: true },
          { id: "mdb_3_3_2_notes", name: "Hotspot Details", type: "textarea", required: false },
          { id: "mdb_3_3_3", name: "3.3.3 Dynamic Load Comparison - Variable testing", type: "checkbox", required: true },
          
          // 3.4 Service History
          { id: "mdb_3_4_1", name: "3.4.1 Historical Data Review - Study maintenance logs", type: "checkbox", required: true },
          { id: "mdb_3_4_1_notes", name: "Historical Issues", type: "textarea", required: false },
          { id: "mdb_3_4_2a", name: "3.4.2a Debris Removal - Routine cleaning", type: "checkbox", required: true },
          { id: "mdb_3_4_2b", name: "3.4.2b Component Tightening - Secure connections", type: "checkbox", required: true },
          { id: "mdb_3_4_3a", name: "3.4.3a Periodic Testing - Schedule routine tests", type: "checkbox", required: true },
          { id: "mdb_3_4_3b", name: "3.4.3b Component Replacement - Proactive replacements", type: "checkbox", required: true },
          
          // 3.5 Documentation
          { id: "mdb_3_5_1", name: "3.5.1 Comprehensive Reporting - Compile all findings", type: "checkbox", required: true },
          { id: "mdb_3_5_2", name: "3.5.2 Standards Verification - SANS compliance check", type: "checkbox", required: true },
          { id: "mdb_3_5_2_actions", name: "Non-Compliance Issues & Corrective Measures", type: "textarea", required: false },
          { id: "mdb_3_5_3", name: "3.5.3 Continuous Improvement - Post-inspection review", type: "checkbox", required: true },
        ]
      },
      
      // Section 4: Earthing & Lightning Protection
      {
        id: "earthing_lightning",
        name: "4. Earthing & Lightning Protection Resistance & Impedance Testing",
        order_index: 3,
        items: [
          { id: "earth_4_1_1", name: "4.1.1 Earth Loop Impedance (Zₛ) - Measure at furthest LV board", type: "checkbox", required: true },
          { id: "earth_4_1_1_reading", name: "Earth Loop Impedance (Ω)", type: "number", required: false },
          { id: "earth_4_1_1_compliance", name: "SANS 10142-1 Compliance", type: "select", required: false, options: ["Pass", "Fail", "Marginal"] },
          { id: "earth_4_1_2", name: "4.1.2 Continuity Sweeps - Joint resistance < 0.2 Ω", type: "checkbox", required: true },
          { id: "earth_4_1_2_reading", name: "Joint Resistance (Ω)", type: "number", required: false },
          { id: "earth_4_1_notes", name: "Earthing System Notes", type: "textarea", required: false },
          { id: "earth_4_1_image", name: "Earthing Test Photo", type: "image", required: false },
          { id: "earth_compliance", name: "SANS 10199, 10313, IEC 62305 Compliance", type: "checkbox", required: true },
        ]
      },
      
      // Section 5: Electrical Meter Installation
      {
        id: "electrical_meters",
        name: "5. Electrical Meter Installation Recording & Compliance Verification",
        order_index: 4,
        items: [
          // 5.1 Meter Identification
          { id: "meter_5_1_1", name: "5.1.1 Meter Serial Number", type: "text", required: true },
          { id: "meter_5_1_2_model", name: "5.1.2 Model", type: "text", required: true },
          { id: "meter_5_1_2_manufacturer", name: "5.1.2 Manufacturer", type: "text", required: true },
          { id: "meter_5_1_3", name: "5.1.3 CT Ratio", type: "text", required: true },
          { id: "meter_image", name: "Meter Photo", type: "image", required: false },
          
          // 5.2 CT Confirmation
          { id: "meter_5_2_1", name: "5.2.1 CT Connection Direction Check - Verify polarity", type: "checkbox", required: true },
          { id: "meter_5_2_1_notes", name: "CT Connection Notes", type: "textarea", required: false },
          
          // 5.3 Meter Programming
          { id: "meter_5_3_1", name: "5.3.1 Tariff & Billing Parameters - Validate setup", type: "checkbox", required: true },
          { id: "meter_5_3_1_tariff", name: "Tariff Structure", type: "text", required: false },
          { id: "meter_5_3_2", name: "5.3.2 Load Profile & Interval Data Setup", type: "checkbox", required: true },
          
          // 5.4 Compliance
          { id: "meter_5_4_1", name: "5.4.1 SANS 474 & IEC 62053 Compliance", type: "checkbox", required: true },
          { id: "meter_5_4_2", name: "5.4.2 Data Archiving & Retrieval", type: "checkbox", required: true },
          { id: "meter_5_4_3", name: "5.4.3 Site Report Compilation", type: "checkbox", required: true },
          { id: "meter_5_4_4", name: "5.4.4 Corrective Action Recommendations", type: "textarea", required: false },
        ]
      },
      
      // Section 6: Line Shop Boards
      {
        id: "line_shop_boards",
        name: "6. Line Shop Boards Compliance Inspections & Annual Maintenance",
        order_index: 5,
        items: [
          // 6.1 Visual & Structural
          { id: "lsb_6_1_1a", name: "6.1.1a Physical Condition - Examine enclosure", type: "checkbox", required: true },
          { id: "lsb_6_1_1a_notes", name: "Physical Condition Notes", type: "textarea", required: false },
          { id: "lsb_6_1_1b", name: "6.1.1b IP Ratings & Sealing", type: "checkbox", required: true },
          { id: "lsb_6_1_2a", name: "6.1.2a Component Arrangement - Assess layout", type: "checkbox", required: true },
          { id: "lsb_6_1_2b", name: "6.1.2b Labelling & Signage - SANS 10142-1", type: "checkbox", required: true },
          { id: "lsb_6_1_3a", name: "6.1.3a Cable Gland Inspection", type: "checkbox", required: true },
          { id: "lsb_6_1_3b", name: "6.1.3b Mounting & Fixation", type: "checkbox", required: true },
          { id: "lsb_6_1_4a", name: "6.1.4a Fire Safety Measures", type: "checkbox", required: true },
          { id: "lsb_6_1_4b", name: "6.1.4b Work Area Conditions - Clearance standards", type: "checkbox", required: true },
          { id: "lsb_6_1_image", name: "Line Shop Board Photo", type: "image", required: false },
          
          // 6.2 Electrical Integrity
          { id: "lsb_6_2_1a", name: "6.2.1a Circuit Breaker & Fuse Testing", type: "checkbox", required: true },
          { id: "lsb_6_2_1b", name: "6.2.1b Contact & Relay Check", type: "checkbox", required: true },
          { id: "lsb_6_2_2a", name: "6.2.2a Megger Tests - Insulation resistance", type: "checkbox", required: true },
          { id: "lsb_6_2_2a_reading", name: "Insulation Resistance (MΩ)", type: "number", required: false },
          { id: "lsb_6_2_2b", name: "6.2.2b Continuity Checks", type: "checkbox", required: true },
          { id: "lsb_6_2_3a", name: "6.2.3a Protection Calibration", type: "checkbox", required: true },
          { id: "lsb_6_2_3b", name: "6.2.3b Load Distribution Analysis", type: "checkbox", required: true },
          { id: "lsb_6_2_3b_notes", name: "Load Analysis Notes", type: "textarea", required: false },
          
          // 6.3 Thermal & Infrared
          { id: "lsb_6_3_1a", name: "6.3.1a Heat Mapping - Infrared imaging", type: "checkbox", required: true },
          { id: "lsb_6_3_1a_image", name: "Thermal Image", type: "image", required: false },
          { id: "lsb_6_3_1b", name: "6.3.1b Abnormal Temperature Profiles", type: "checkbox", required: true },
          { id: "lsb_6_3_2a", name: "6.3.2a Load Variation Testing", type: "checkbox", required: true },
          { id: "lsb_6_3_2b", name: "6.3.2b Correlation with Maintenance Data", type: "checkbox", required: true },
          
          // 6.4 Service History
          { id: "lsb_6_4_1a", name: "6.4.1a Maintenance Record Review", type: "checkbox", required: true },
          { id: "lsb_6_4_1a_notes", name: "Historical Documentation Notes", type: "textarea", required: false },
          { id: "lsb_6_4_1b", name: "6.4.1b Incident Trends Analysis", type: "checkbox", required: true },
          { id: "lsb_6_4_2a", name: "6.4.2a Regular Cleaning", type: "checkbox", required: true },
          { id: "lsb_6_4_2b", name: "6.4.2b Component Tightening", type: "checkbox", required: true },
          { id: "lsb_6_4_3a", name: "6.4.3a Periodic Tests", type: "checkbox", required: true },
          { id: "lsb_6_4_3b", name: "6.4.3b Replacement Planning", type: "checkbox", required: true },
          
          // 6.5 Documentation
          { id: "lsb_6_5_1", name: "6.5.1 Integrated Inspection Reporting", type: "checkbox", required: true },
          { id: "lsb_6_5_2", name: "6.5.2 Standards Verification - SANS compliance", type: "checkbox", required: true },
          { id: "lsb_6_5_2_actions", name: "Action Recommendations", type: "textarea", required: false },
          { id: "lsb_6_5_3", name: "6.5.3 Feedback & Continuous Improvement", type: "checkbox", required: true },
        ]
      },
      
      // Section 7: General Area Lighting & Power
      {
        id: "lighting_power",
        name: "7. General Area Lighting & Power Compliance Inspections & Annual Maintenance",
        order_index: 6,
        items: [
          // 7.1 Visual & Structural
          { id: "light_7_1_1a", name: "7.1.1a Physical Condition - Examine fixtures & panels", type: "checkbox", required: true },
          { id: "light_7_1_1a_notes", name: "Physical Condition Notes", type: "textarea", required: false },
          { id: "light_7_1_1b", name: "7.1.1b Sealing & Weatherproofing - IP ratings", type: "checkbox", required: true },
          { id: "light_7_1_2a", name: "7.1.2a Installation Security - Mounting & alignment", type: "checkbox", required: true },
          { id: "light_7_1_2b", name: "7.1.2b Labelling & Identification", type: "checkbox", required: true },
          { id: "light_7_1_3a", name: "7.1.3a Clearance & Accessibility", type: "checkbox", required: true },
          { id: "light_7_1_3b", name: "7.1.3b Visual Documentation", type: "image", required: false },
          
          // 7.2 Electrical Integrity
          { id: "light_7_2_1a", name: "7.2.1a Functionality Checks - Test lighting operation", type: "checkbox", required: true },
          { id: "light_7_2_1a_notes", name: "Functionality Issues", type: "textarea", required: false },
          { id: "light_7_2_1b", name: "7.2.1b Electrical Connections - Inspect wiring", type: "checkbox", required: true },
          { id: "light_7_2_2a", name: "7.2.2a Circuit Testing - Distribution circuits", type: "checkbox", required: true },
          { id: "light_7_2_2b", name: "7.2.2b Load Analysis - Balanced circuits", type: "checkbox", required: true },
          { id: "light_7_2_3a", name: "7.2.3a System Calibration - SANS 10142-1", type: "checkbox", required: true },
          { id: "light_7_2_3b", name: "7.2.3b Emergency Systems Testing", type: "checkbox", required: true },
          
          // 7.3 Thermal & Infrared
          { id: "light_7_3_1a", name: "7.3.1a Heat Mapping - Scan panels, drivers, ballasts", type: "checkbox", required: true },
          { id: "light_7_3_1a_image", name: "Thermal Image", type: "image", required: false },
          { id: "light_7_3_1b", name: "7.3.1b Dynamic Thermal Assessment", type: "checkbox", required: true },
          { id: "light_7_3_2", name: "7.3.2 Correlation with Operational Data", type: "checkbox", required: true },
          
          // 7.4 Service History
          { id: "light_7_4_1", name: "7.4.1 Maintenance Log Review - Historical analysis", type: "checkbox", required: true },
          { id: "light_7_4_1_notes", name: "Historical Issues", type: "textarea", required: false },
          { id: "light_7_4_2a", name: "7.4.2a Fixture & Lens Cleaning", type: "checkbox", required: true },
          { id: "light_7_4_2b", name: "7.4.2b Component Tightening & Inspection", type: "checkbox", required: true },
          { id: "light_7_4_3a", name: "7.4.3a Periodic Function Tests", type: "checkbox", required: true },
          { id: "light_7_4_3b", name: "7.4.3b Lifecycle Management - Replacements", type: "checkbox", required: true },
          { id: "light_7_4_4", name: "7.4.4 Energy Efficiency & System Upgrades", type: "checkbox", required: false },
          { id: "light_7_4_4_notes", name: "Efficiency Recommendations", type: "textarea", required: false },
          
          // 7.5 Documentation
          { id: "light_7_5_1", name: "7.5.1 Comprehensive Reporting", type: "checkbox", required: true },
          { id: "light_7_5_2", name: "7.5.2 Standards Verification - SANS compliance", type: "checkbox", required: true },
          { id: "light_7_5_2_actions", name: "Actionable Recommendations", type: "textarea", required: false },
          { id: "light_7_5_3", name: "7.5.3 Feedback & Continuous Improvement", type: "checkbox", required: true },
        ]
      },
      
      // Section 8: Issue Resolution & Close-Out
      {
        id: "issue_resolution",
        name: "8. Issue Resolution & Close-Out",
        order_index: 7,
        items: [
          // 8.1 Defect Identification
          { id: "issue_8_1_1", name: "8.1.1 Regular Inspection & Testing - Annual checks", type: "checkbox", required: true },
          { id: "issue_8_1_2", name: "8.1.2 Sampling & Laboratory Testing - Oil/gas analysis", type: "checkbox", required: false },
          { id: "issue_8_1_2_results", name: "Laboratory Test Results", type: "textarea", required: false },
          { id: "issue_8_1_3", name: "8.1.3 SF6 Gas Pressure & Purity Checks", type: "checkbox", required: false },
          { id: "issue_8_1_3_reading", name: "SF6 Pressure Reading", type: "text", required: false },
          { id: "issue_8_1_4", name: "8.1.4 Defect Register - Log all issues", type: "checkbox", required: true },
          { id: "issue_8_1_4_defects", name: "Defects Summary", type: "textarea", required: false },
          
          // 8.2 Costing & Verification
          { id: "issue_8_2_1", name: "8.2.1 Quotation Acquisition - Two independent providers", type: "checkbox", required: true },
          { id: "issue_8_2_1_quotes", name: "Quotation Details", type: "textarea", required: false },
          { id: "issue_8_2_2", name: "8.2.2 Technical Review & Validation", type: "checkbox", required: true },
          { id: "issue_8_2_3", name: "8.2.3 Client Approval - Formal cost proposal", type: "checkbox", required: true },
          
          // 8.3 Remedial Action
          { id: "issue_8_3_1", name: "8.3.1 Contractor Assignment & Scheduling", type: "checkbox", required: true },
          { id: "issue_8_3_1_contractor", name: "Assigned Contractor", type: "text", required: false },
          { id: "issue_8_3_1_date", name: "Scheduled Date", type: "text", required: false },
          { id: "issue_8_3_2", name: "8.3.2 Quality Control & Compliance Testing", type: "checkbox", required: true },
          { id: "issue_8_3_2_notes", name: "Quality Control Notes", type: "textarea", required: false },
          
          // Final Sign-Off
          { id: "final_signoff", name: "Final Inspection Sign-Off", type: "checkbox", required: true },
          { id: "inspector_name", name: "Inspector Name", type: "text", required: true },
          { id: "inspection_date", name: "Inspection Date", type: "text", required: true },
          { id: "overall_notes", name: "Overall Inspection Summary", type: "textarea", required: false },
        ]
      }
    ]
  };
};
