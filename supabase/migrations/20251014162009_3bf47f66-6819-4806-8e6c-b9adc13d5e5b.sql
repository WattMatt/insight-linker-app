-- Add the 3 missing inspection templates

-- 9. Site Summary
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Site Summary Report',
  'General',
  'Comprehensive site overview and summary report covering all key site information and inspection summaries',
  3,
  4,
  '[
    {
      "id": "siteInformation",
      "name": "Site Information",
      "order_index": 1,
      "items": [
        {"id": "siteName", "name": "Site Name", "type": "text", "required": true},
        {"id": "siteAddress", "name": "Site Address", "type": "text", "required": true},
        {"id": "clientName", "name": "Client Name", "type": "text", "required": true},
        {"id": "siteType", "name": "Site Type", "type": "text", "required": true},
        {"id": "supplyAuthority", "name": "Supply Authority", "type": "text", "required": false},
        {"id": "nominatedMaxDemand", "name": "Nominated Max Demand", "type": "text", "required": false}
      ]
    },
    {
      "id": "subsectionSummary",
      "name": "Subsection Summary",
      "order_index": 2,
      "items": [
        {"id": "totalSubsections", "name": "Total Number of Subsections", "type": "number", "required": true},
        {"id": "compliantSubsections", "name": "Compliant Subsections", "type": "number", "required": true},
        {"id": "nonCompliantSubsections", "name": "Non-Compliant Subsections", "type": "number", "required": true},
        {"id": "pendingInspections", "name": "Pending Inspections", "type": "number", "required": true}
      ]
    },
    {
      "id": "overallStatus",
      "name": "Overall Status & Recommendations",
      "order_index": 3,
      "items": [
        {"id": "overallCompliance", "name": "Overall Compliance Status", "type": "select", "required": true},
        {"id": "keyFindings", "name": "Key Findings", "type": "textarea", "required": false},
        {"id": "recommendations", "name": "Recommendations", "type": "textarea", "required": false},
        {"id": "nextActions", "name": "Next Actions Required", "type": "textarea", "required": false}
      ]
    }
  ]'::jsonb,
  '{"title": "Site Summary Report", "subtitle": "Comprehensive Site Overview", "company_name": "Watson Mattheus"}'::jsonb
);

-- 10. Standalone Solar PV Inspection
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Standalone Solar PV Installation Inspection',
  'Solar & Renewable Energy',
  'Complete inspection checklist for standalone solar photovoltaic installations covering PV array, inverter systems, battery storage, and grid integration',
  6,
  8,
  '[
    {
      "id": "pvArrayInspection",
      "name": "PV Array Inspection",
      "order_index": 1,
      "items": [
        {"id": "panelMounting", "name": "Panel mounting structure integrity and alignment", "type": "checklist", "required": true},
        {"id": "panelCondition", "name": "Panel physical condition (cracks, hotspots, delamination)", "type": "checklist", "required": true},
        {"id": "arrayWiring", "name": "DC wiring, conduit, and cable management", "type": "checklist", "required": true},
        {"id": "stringConfiguration", "name": "String configuration verified against design", "type": "checklist", "required": true},
        {"id": "pvIsolators", "name": "PV isolators installed and labeled", "type": "checklist", "required": true},
        {"id": "earthingBonding", "name": "Earthing and bonding of array structure", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "inverterSystem",
      "name": "Inverter System",
      "order_index": 2,
      "items": [
        {"id": "inverterModel", "name": "Inverter model and rating verification", "type": "text", "required": true},
        {"id": "inverterMounting", "name": "Inverter mounting and ventilation clearances", "type": "checklist", "required": true},
        {"id": "dcConnections", "name": "DC input connections and polarity", "type": "checklist", "required": true},
        {"id": "acConnections", "name": "AC output connections and protection", "type": "checklist", "required": true},
        {"id": "inverterSettings", "name": "Inverter settings and grid parameters configured", "type": "checklist", "required": true},
        {"id": "communicationSetup", "name": "Communication/monitoring system setup", "type": "checklist", "required": false}
      ]
    },
    {
      "id": "batteryStorage",
      "name": "Battery Storage System (if applicable)",
      "order_index": 3,
      "items": [
        {"id": "batteryType", "name": "Battery type and capacity verification", "type": "text", "required": false},
        {"id": "batteryInstallation", "name": "Battery installation and ventilation", "type": "checklist", "required": false},
        {"id": "bmsOperation", "name": "BMS (Battery Management System) operation", "type": "checklist", "required": false},
        {"id": "batteryConnections", "name": "Battery connections and cable sizing", "type": "checklist", "required": false},
        {"id": "chargingSystem", "name": "Charging system parameters verified", "type": "checklist", "required": false}
      ]
    },
    {
      "id": "electricalTesting",
      "name": "Electrical Testing & Commissioning",
      "order_index": 4,
      "items": [
        {"id": "insulationResistance", "name": "Insulation resistance test (DC side)", "type": "checklist", "required": true},
        {"id": "earthContinuity", "name": "Earth continuity and bonding test", "type": "checklist", "required": true},
        {"id": "polarityTest", "name": "Polarity test (DC and AC)", "type": "checklist", "required": true},
        {"id": "stringVoltage", "name": "String voltage and current measurements", "type": "checklist", "required": true},
        {"id": "inverterOutput", "name": "Inverter output voltage and frequency", "type": "checklist", "required": true},
        {"id": "gridSynchronization", "name": "Grid synchronization test", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "protectionSafety",
      "name": "Protection & Safety Systems",
      "order_index": 5,
      "items": [
        {"id": "antiIslandingProtection", "name": "Anti-islanding protection verified", "type": "checklist", "required": true},
        {"id": "overvoltageProtection", "name": "Overvoltage/undervoltage protection", "type": "checklist", "required": true},
        {"id": "surgeProtection", "name": "Surge protection devices (SPDs) installed", "type": "checklist", "required": true},
        {"id": "isolationDevices", "name": "Isolation devices accessible and labeled", "type": "checklist", "required": true},
        {"id": "fireSafety", "name": "Fire safety provisions and signage", "type": "checklist", "required": true},
        {"id": "emergencyShutdown", "name": "Emergency shutdown procedure tested", "type": "checklist", "required": true}
      ]
    },
    {
      "id": "documentation",
      "name": "Documentation & Compliance",
      "order_index": 6,
      "items": [
        {"id": "asBuiltDrawings", "name": "As-built drawings and schematics", "type": "checklist", "required": true},
        {"id": "equipmentDatasheets", "name": "Equipment datasheets and certificates", "type": "checklist", "required": true},
        {"id": "testResults", "name": "Test results and commissioning reports", "type": "checklist", "required": true},
        {"id": "cocSubmitted", "name": "COC submitted to authority", "type": "checklist", "required": true},
        {"id": "operationManuals", "name": "Operation and maintenance manuals provided", "type": "checklist", "required": true},
        {"id": "warningLabels", "name": "All warning and identification labels in place", "type": "checklist", "required": true}
      ]
    }
  ]'::jsonb,
  '{"title": "Standalone Solar PV Installation Inspection", "subtitle": "Solar Photovoltaic System Assessment", "company_name": "Watson Mattheus"}'::jsonb
);

-- 11. Standard Progress Report
INSERT INTO inspection_templates (name, category, description, sections_count, pages_count, sections, cover_page) VALUES (
  'Standard Progress Report',
  'General',
  'Regular project progress report covering work completed, schedule status, quality control, safety, and upcoming activities',
  6,
  5,
  '[
    {
      "id": "reportInformation",
      "name": "Report Information",
      "order_index": 1,
      "items": [
        {"id": "reportDate", "name": "Report Date", "type": "date", "required": true},
        {"id": "reportPeriod", "name": "Reporting Period", "type": "text", "required": true},
        {"id": "projectName", "name": "Project Name", "type": "text", "required": true},
        {"id": "contractorName", "name": "Contractor Name", "type": "text", "required": true},
        {"id": "reportedBy", "name": "Reported By", "type": "text", "required": true}
      ]
    },
    {
      "id": "workCompleted",
      "name": "Work Completed This Period",
      "order_index": 2,
      "items": [
        {"id": "completedActivities", "name": "Activities Completed", "type": "textarea", "required": true},
        {"id": "milestonesAchieved", "name": "Milestones Achieved", "type": "textarea", "required": false},
        {"id": "materialsDelivered", "name": "Materials Delivered/Installed", "type": "textarea", "required": false},
        {"id": "workersOnSite", "name": "Number of Workers on Site", "type": "number", "required": false}
      ]
    },
    {
      "id": "scheduleStatus",
      "name": "Schedule Status",
      "order_index": 3,
      "items": [
        {"id": "overallProgress", "name": "Overall Progress Percentage", "type": "number", "required": true},
        {"id": "scheduleVariance", "name": "Schedule Variance (Days Ahead/Behind)", "type": "text", "required": true},
        {"id": "delaysIssues", "name": "Delays or Issues Encountered", "type": "textarea", "required": false},
        {"id": "recoveryActions", "name": "Recovery Actions Taken", "type": "textarea", "required": false}
      ]
    },
    {
      "id": "qualityControl",
      "name": "Quality Control & Inspections",
      "order_index": 4,
      "items": [
        {"id": "inspectionsCompleted", "name": "Inspections Completed This Period", "type": "textarea", "required": false},
        {"id": "nonConformances", "name": "Non-Conformances Identified", "type": "textarea", "required": false},
        {"id": "correctiveActions", "name": "Corrective Actions Implemented", "type": "textarea", "required": false},
        {"id": "qualityIssues", "name": "Outstanding Quality Issues", "type": "textarea", "required": false}
      ]
    },
    {
      "id": "safetyEnvironment",
      "name": "Safety & Environmental",
      "order_index": 5,
      "items": [
        {"id": "safetyIncidents", "name": "Safety Incidents/Near Misses", "type": "textarea", "required": true},
        {"id": "safetyMeetings", "name": "Safety Meetings/Toolbox Talks Held", "type": "number", "required": false},
        {"id": "environmentalCompliance", "name": "Environmental Compliance Status", "type": "textarea", "required": false},
        {"id": "safetyObservations", "name": "Safety Observations/Improvements", "type": "textarea", "required": false}
      ]
    },
    {
      "id": "upcomingWork",
      "name": "Upcoming Work & Planning",
      "order_index": 6,
      "items": [
        {"id": "plannedActivities", "name": "Planned Activities (Next Period)", "type": "textarea", "required": true},
        {"id": "expectedMilestones", "name": "Expected Milestones", "type": "textarea", "required": false},
        {"id": "resourceRequirements", "name": "Resource Requirements", "type": "textarea", "required": false},
        {"id": "issuesForAttention", "name": "Issues Requiring Client Attention", "type": "textarea", "required": false}
      ]
    }
  ]'::jsonb,
  '{"title": "Standard Progress Report", "subtitle": "Project Status and Activities", "company_name": "Watson Mattheus"}'::jsonb
);
