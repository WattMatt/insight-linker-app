/**
 * Plain-English reference for the COC verification rules the (647) Fortress re-verification was
 * scored against: "COC Verification Rule Set - SANS 10142-1.md" v0.4.2 (LOCKED 2026-06-23), applied
 * strictly as described in each site pack's "Rule basis" sheet. Used by the Sign-off screen so a
 * reviewer sees what each rule means and where to look on the certificate.
 *
 * If the rule set is re-versioned, update this file with it — the verdicts and these words must agree.
 */

export interface RuleInfo {
  /** Full item name, as in the rule set. */
  name: string;
  /** Where on the certificate / test report to look. */
  where: string;
  /** What a pass looks like (the strict criterion). */
  pass: string;
  /** SANS 10142-1:2021 clause, where the rule set cites one. */
  clause?: string;
}

export const RULE_SET_VERSION = "v0.4.2 (SANS 10142-1:2021 Ed 3.1, Section 8)";

export const RULES: Record<string, RuleInfo> = {
  // Group D — Initial vs Supplementary classification & cross-referencing
  D1: { name: "Certificate type can be determined (Initial or Supplementary)",
    where: "\"Type COC\" tick; test report Section 2 \"Existing Certificate?\" and \"Previous COC Number\"; installation-type tick",
    pass: "One non-conflicting classification. The type tick governs; no tick and no supplement reference = can't classify." },
  D2: { name: "Supplementary records the COC number it supplements",
    where: "Test report Section 2, \"Previous / Original COC Number\"",
    pass: "Supplementary certificates only: a previous COC number is written and legible (N/A or blank fails)." },
  D3: { name: "Supplementary records the original certificate's issue date",
    where: "Test report Section 2, \"Date issued\" of the existing certificate",
    pass: "Supplementary certificates only: the date is written." },
  D4: { name: "The referenced Initial COC is on file",
    where: "Compare the previous COC number with the Initial certificates for this site",
    pass: "A matching Initial exists. If it simply wasn't supplied this is a flag (request it), not a fail." },

  // Group A — Document & administrative checks
  A1: { name: "Certificate of Compliance number present", where: "COC cover page", pass: "A CoC number is recorded." },
  A2: { name: "Test report attached", where: "The pages after the cover",
    pass: "A SANS 10142-1 test report (8.7 format) accompanies the COC — a cover page alone is not a valid COC.", clause: "8 (intro), 8.7" },
  A3: { name: "DB / supply identified", where: "Test report — DB / supply field",
    pass: "The DB or supply the report covers is named (one report per DB & supply).", clause: "8.6.1" },
  A4: { name: "Date of issue", where: "COC cover / test report", pass: "A valid date of issue is recorded." },
  A5: { name: "Registered person and registration number", where: "Test report Section 5",
    pass: "Name and registration certificate number present (MIE / IE / single-phase tester)." },
  A6: { name: "Signed by the registered person", where: "Test report Section 5", pass: "Signature present." },
  A7: { name: "Registration type suits the installation", where: "Test report Section 5 (type of registration) vs the installation",
    pass: "Registration type is adequate — e.g. a single-phase tester may not sign a three-phase installation." },
  A8: { name: "Installation described", where: "Test report Section 3", pass: "Section 3 describes the installation covered." },

  // Group B — Inspection items (a "No" prevents issuing the report)
  B1: { name: "Conductors correctly rated for the protective devices and load", where: "Test report Section 4, inspection table",
    pass: "Ticked \"Yes\". Blank, \"No\" or N/A on this mandatory item fails.", clause: "8.5.2 a)" },
  B2: { name: "Components correctly selected and installed, accessible where necessary", where: "Test report Section 4, inspection table",
    pass: "Ticked \"Yes\". Blank, \"No\" or N/A on this mandatory item fails.", clause: "8.5.2 b)" },
  B3: { name: "Disconnecting devices correctly located; switchgear switches the phase conductors", where: "Test report Section 4, inspection table",
    pass: "Ticked \"Yes\". Blank, \"No\" or N/A on this mandatory item fails.", clause: "8.5.2 c)" },
  B4: { name: "Circuits, devices and DBs correctly and permanently labelled", where: "Test report Section 4, inspection table",
    pass: "Ticked \"Yes\". Blank, \"No\" or N/A on this mandatory item fails.", clause: "8.5.2 d)" },

  // Group C — Test items, with pass thresholds
  C1: { name: "Continuity of bonding", where: "Test report Section 4, tests table — bonding",
    pass: "A measured value ≤ 0,2 Ω. A \"Compliant\" tick with no Ω value can't be verified.", clause: "8.6.2" },
  C2: { name: "Earth continuity conductor (ECC) resistance", where: "Test report Section 4, tests table — earth continuity",
    pass: "≤ Table 8.1 maximum for the circuit's device rating: ≤ 0,146 Ω passes for any device up to 63 A; > 1,533 Ω fails for any rating; in between needs the circuit schedule.",
    clause: "8.6.3, Table 8.1" },
  C3: { name: "Continuity of ring circuits", where: "Test report Section 4, tests table — ring circuits",
    pass: "Only if ring circuits exist: ring proven continuous, both ends to the same terminal.", clause: "8.6.4" },
  C4: { name: "Earth loop impedance at the main switch", where: "Test report Section 4, tests table — earth loop (Zs)",
    pass: "Zs ≤ 230 V ÷ (2 × main device rating), so a fault trips the main device.", clause: "8.6.5.1" },
  C5: { name: "Neutral loop impedance at the main switch", where: "Test report Section 4, tests table — neutral loop (Zn)",
    pass: "Where a neutral is provided: meets the same 2 × rating test and must not exceed the earth loop value (strict reading — open ruling).",
    clause: "8.6.5.2 / 8.6.5.3" },
  C6: { name: "Prospective short-circuit current (PSCC)", where: "Test report item 6 and Section 2 (device ratings)",
    pass: "Recorded in kA and not above the withstand rating of the main switch and devices. Blank fails." },
  C7: { name: "Voltage between incoming neutral and earth", where: "Test report Section 4, tests table — elevated neutral voltage",
    pass: "≤ 25 V passes; 25–50 V is a flag (notify supplier); > 50 V fails.", clause: "8.6.6" },
  C8: { name: "Insulation resistance", where: "Test report Section 4, tests table — insulation",
    pass: "≥ 1,0 MΩ. \"∞\", \"OL\" or \">999 MΩ\" is the best result and passes; 0 MΩ fails.", clause: "8.6.8.2" },
  C9: { name: "Voltage at the DB — no load", where: "Test report Section 4, tests table — voltage no load (per phase)",
    pass: "Every phase recorded and 207–253 V (230 V ±10 %). Out of band is a flag (supply side); blank fails.", clause: "8.6.9, 5.4.2" },
  C10: { name: "Voltage at the DB — on load", where: "Test report Section 4, tests table — voltage on load (per phase)",
    pass: "Every phase recorded and within 230 V ±10 % at full load. Out of band is a flag; blank fails.", clause: "8.6.10, 5.4.2" },
  C11: { name: "Earth leakage unit operates correctly", where: "Test report Section 4, tests table — earth leakage trip value",
    pass: "Trips at ≤ 30 mA for socket-outlet circuits, and does not trip at half its rating. N/A on socket circuits fails; a tick without a value can't be verified.",
    clause: "8.6.11, 5.7" },
  C12: { name: "Earth leakage test button works", where: "Test report Section 4, tests table — test button",
    pass: "Unit trips when the test button is pressed. N/A on this mandatory item fails.", clause: "8.6.12" },
  C13: { name: "Polarity correct at points of consumption", where: "Test report Section 4, tests table — polarity",
    pass: "Single-pole devices in the phase conductor; lampholder centre contact on phase.", clause: "8.6.13" },
  C14: { name: "Phase rotation consistent (three-phase)", where: "Test report Section 4, tests table — phase rotation",
    pass: "Three-phase only: rotation recorded and maintained throughout. Blank fails.", clause: "8.6.13 d)" },
  C15: { name: "Switching devices make and break the circuit", where: "Test report Section 4, tests table — switching devices",
    pass: "Each device interrupts its circuit as intended.", clause: "8.6.14" },
  C16: { name: "Earth resistance", where: "Test report — earth electrode resistance",
    pass: "Optional where the supplier provides an earthing terminal; otherwise per SANS 10199.", clause: "8.6.7" },
};

/** What the result words on the screen mean (strict scoring). */
export const RESULT_KEY: { word: string; meaning: string }[] = [
  { word: "Fails", meaning: "Outside the limit, or a mandatory item left blank / marked N/A." },
  { word: "Ticked compliant, no value", meaning: "The tester ticked \"Compliant\" but wrote no reading — can't be verified as written." },
  { word: "Unclear / can't verify", meaning: "Illegible, missing from the scan, or depends on information not on the report." },
  { word: "Flag", meaning: "A finding to act on (e.g. notify the supplier) that does not fail the certificate by itself." },
];

export function ruleInfo(code: string): RuleInfo | undefined {
  return RULES[code.toUpperCase()];
}
