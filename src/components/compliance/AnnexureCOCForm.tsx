/**
 * Annexure 1 COC Form — Department of Labour
 * Mirrors the physical SA "Certificate of Compliance — General Electrical Installation"
 * OHS Act 1993, Electrical Installation Regulations 2009
 */
import { useState, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from '@/components/ui/form';
import {
  CheckCircle, XCircle, AlertTriangle, ShieldCheck, ShieldX, ShieldAlert,
  Zap, FileWarning, Save, Loader2, Download, Building2, MapPin, User, Briefcase,
  ClipboardList, TestTube, FileText, MessageSquare, ShieldOff, Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  validateCOC, type COCData, type COCTestReport, type COCValidationResult, type ValidationRuleResult,
} from '@/utils/cocValidationEngine';
import { buildCOCValidationPdf } from '@/utils/cocValidationPdfBuilder';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const annexureCOCSchema = z.object({
  // ── Page 1: Certificate of Compliance ──
  certificateNo: z.string().trim().min(1, 'Certificate number required').max(50),
  certificateType: z.enum(['initial', 'supplementary', 'certificate']),
  supplementNo: z.string().max(50).optional().or(z.literal('')),
  initialCertificateNo: z.string().max(50).optional().or(z.literal('')),
  initialCertificateIssuedOn: z.string().optional().or(z.literal('')),

  // Installation identification
  physicalAddress: z.string().trim().min(1, 'Address required').max(500),
  buildingName: z.string().max(255).optional().or(z.literal('')),
  gpsCoordinates: z.string().max(100).optional().or(z.literal('')),
  suburbTownship: z.string().max(255).optional().or(z.literal('')),
  districtTownCity: z.string().max(255).optional().or(z.literal('')),
  erfLotNo: z.string().max(100).optional().or(z.literal('')),

  // Declaration by registered person
  registeredPersonName: z.string().trim().min(1, 'Name required').max(255),
  registeredPersonIdNo: z.string().max(20).optional().or(z.literal('')),
  regulationType: z.enum(['new_installation', 'existing_installation', 'new_part_existing']),
  registrationNumber: z.string().trim().min(1, 'Registration number required').max(50),
  dateOfRegistration: z.string().optional().or(z.literal('')),
  registrationCategory: z.enum([
    'installation_electrician',
    'master_installation_electrician',
    'electrical_tester_single_phase',
  ]),
  hasSignature: z.boolean(),
  signatureDate: z.string().nullable().optional(),

  // Contact details of registered person
  rpAddress: z.string().max(500).optional().or(z.literal('')),
  rpTelNo: z.string().max(30).optional().or(z.literal('')),
  rpFaxNo: z.string().max(30).optional().or(z.literal('')),
  rpCellNo: z.string().max(30).optional().or(z.literal('')),
  rpEmail: z.string().max(255).optional().or(z.literal('')),

  // Declaration by electrical contractor
  contractorName: z.string().max(255).optional().or(z.literal('')),
  contractorIdNo: z.string().max(20).optional().or(z.literal('')),
  contractorRegNumber: z.string().max(50).optional().or(z.literal('')),
  contractorDateOfRegistration: z.string().optional().or(z.literal('')),
  contractorHasSignature: z.boolean().optional(),

  // Contractor contact details
  ecBusinessName: z.string().max(255).optional().or(z.literal('')),
  ecAddress: z.string().max(500).optional().or(z.literal('')),
  ecTelNo: z.string().max(30).optional().or(z.literal('')),
  ecFaxNo: z.string().max(30).optional().or(z.literal('')),
  ecCellNo: z.string().max(30).optional().or(z.literal('')),
  ecEmail: z.string().max(255).optional().or(z.literal('')),

  // Recipient
  recipientName: z.string().max(255).optional().or(z.literal('')),
  recipientSignatureDate: z.string().optional().or(z.literal('')),

  // ── Page 2: Test Report ──
  dateOfIssue: z.string().min(1, 'Date of issue required'),
  dbSupplyName: z.string().max(255).optional().or(z.literal('')),

  // Section 1 - Location (same as page 1 address, auto-filled)

  // Section 2 - Installation
  installationPermanent: z.boolean().default(true),
  supplySystemType: z.enum(['TN-S', 'TN-C-S', 'TN-C', 'TT', 'IT']),
  supplyVoltage: z.coerce.number().min(100).max(600).default(230),
  phaseConfiguration: z.enum(['single_phase', 'two_phase', 'three_phase']),
  phaseRotation: z.enum(['clockwise', 'anticlockwise', 'n_a']).optional(),
  supplyFrequency: z.coerce.number().min(45).max(65).default(50),
  mainSwitchType: z.string().max(100).optional().or(z.literal('')),
  numberOfPoles: z.coerce.number().nullable().optional(),
  currentRatingA: z.coerce.number().nullable().optional(),
  shortCircuitWithstandKA: z.coerce.number().nullable().optional(),
  ratedEarthLeakageTrippingCurrent_mA: z.coerce.number().default(30),
  surgeProtectionInstalled: z.boolean().optional(),
  lightningProtectionInstalled: z.boolean().optional(),
  alternativePowerSupply: z.boolean().optional(),
  specializedInstallation: z.boolean().optional(),
  aboveOneKV: z.boolean().optional(),

  // Section 3 - Description (circuit counts stored as JSON)
  circuitDescription: z.any().optional(),

  // Section 4 - Inspection items (Yes/No/N/A)
  inspection1_conductors: z.enum(['yes', 'no', 'n_a']).optional(),
  inspection2_components: z.enum(['yes', 'no', 'n_a']).optional(),
  inspection3_disconnecting: z.enum(['yes', 'no', 'n_a']).optional(),
  inspection4_markings: z.enum(['yes', 'no', 'n_a']).optional(),

  // Section 4 - Tests (1-15)
  test1_continuityBonding: z.string().max(50).optional().or(z.literal('')),
  test2_earthContinuity: z.string().max(50).optional().or(z.literal('')),
  test3_continuityRing: z.string().max(50).optional().or(z.literal('')),
  test4_earthLoopImpedance_ohm: z.coerce.number().nullable().optional(),
  test5_neutralLoopImpedance_ohm: z.coerce.number().nullable().optional(),
  test6_pscc_kA: z.coerce.number().nullable().optional(),
  test6_pscc_method: z.enum(['calculated', 'measured']).optional(),
  test7_elevatedVoltage_V: z.coerce.number().nullable().optional(),
  test8_insulationResistance_MOhm: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') return null;
      const s = String(val).trim().toLowerCase();
      if (s === '∞' || s === '\u221E' || s === 'infinity' || s === 'inf') return Infinity;
      const n = Number(s);
      return isNaN(n) ? null : n;
    },
    z.number().nullable().optional()
  ),
  test9_voltageNoLoad_R: z.coerce.number().nullable().optional(),
  test9_voltageNoLoad_Y: z.coerce.number().nullable().optional(),
  test9_voltageNoLoad_B: z.coerce.number().nullable().optional(),
  test10_voltageFullLoad_R: z.coerce.number().nullable().optional(),
  test10_voltageFullLoad_Y: z.coerce.number().nullable().optional(),
  test10_voltageFullLoad_B: z.coerce.number().nullable().optional(),
  test11_earthLeakageValue_mA: z.coerce.number().nullable().optional(),
  test12_earthLeakageTestButton: z.boolean().optional(),
  test13_polarityCorrect: z.boolean().optional(),
  test14_phaseRotationCorrect: z.boolean().optional(),
  test15_switchingDevicesCorrect: z.boolean().optional(),

  // Comments
  comments: z.string().max(2000).optional().or(z.literal('')),
  commentsNotCovered: z.string().max(2000).optional().or(z.literal('')),

  // Section 5 - Responsibility
  section5PersonName: z.string().max(255).optional().or(z.literal('')),
  section5RegCertNo: z.string().max(50).optional().or(z.literal('')),
  section5RegType: z.enum([
    'master_installation_electrician',
    'installation_electrician',
    'single_phase_tester',
  ]).optional(),
  section5Date: z.string().optional().or(z.literal('')),
  section5TelNo: z.string().max(30).optional().or(z.literal('')),
});

type AnnexureCOCFormValues = z.infer<typeof annexureCOCSchema>;

// ---------------------------------------------------------------------------
// Override Types
// ---------------------------------------------------------------------------
interface FieldOverride {
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
}

type FieldOverrides = Record<string, FieldOverride>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function InspectionSelect({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger className="w-24 h-8 text-xs">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">Yes</SelectItem>
        <SelectItem value="no">No</SelectItem>
        <SelectItem value="n_a">N/A</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ThresholdDot({ value, check }: {
  value: number | null | undefined;
  check: (v: number) => 'pass' | 'fail' | 'warn';
}) {
  if (value == null || isNaN(value)) return null;
  const r = check(value);
  if (r === 'pass') return <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (r === 'fail') return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'VALID': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
    case 'INVALID': return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'REQUIRES_REVIEW': return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getFraudColor(score: string) {
  switch (score) {
    case 'LOW': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
    case 'MEDIUM': return 'bg-amber-500/15 text-amber-700 border-amber-500/30';
    case 'HIGH': return 'bg-destructive/15 text-destructive border-destructive/30';
    default: return 'bg-muted text-muted-foreground';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'VALID': return <ShieldCheck className="h-5 w-5 text-emerald-600" />;
    case 'INVALID': return <ShieldX className="h-5 w-5 text-destructive" />;
    case 'REQUIRES_REVIEW': return <ShieldAlert className="h-5 w-5 text-amber-600" />;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AnnexureCOCFormProps {
  editId?: string | null;
  siteId?: string | null;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AnnexureCOCForm({ editId, siteId, onSaved }: AnnexureCOCFormProps) {
  const [saving, setSaving] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [overrides, setOverrides] = useState<FieldOverrides>({});
  const [overrideInput, setOverrideInput] = useState<Record<string, string>>({});

  const form = useForm<AnnexureCOCFormValues>({
    resolver: zodResolver(annexureCOCSchema),
    defaultValues: {
      certificateNo: '',
      certificateType: 'initial',
      supplementNo: '',
      initialCertificateNo: '',
      initialCertificateIssuedOn: '',
      physicalAddress: '',
      buildingName: '',
      gpsCoordinates: '',
      suburbTownship: '',
      districtTownCity: '',
      erfLotNo: '',
      registeredPersonName: '',
      registeredPersonIdNo: '',
      regulationType: 'existing_installation',
      registrationNumber: '',
      dateOfRegistration: '',
      registrationCategory: 'installation_electrician',
      hasSignature: false,
      signatureDate: null,
      rpAddress: '',
      rpTelNo: '',
      rpFaxNo: '',
      rpCellNo: '',
      rpEmail: '',
      contractorName: '',
      contractorIdNo: '',
      contractorRegNumber: '',
      contractorDateOfRegistration: '',
      contractorHasSignature: false,
      ecBusinessName: '',
      ecAddress: '',
      ecTelNo: '',
      ecFaxNo: '',
      ecCellNo: '',
      ecEmail: '',
      recipientName: '',
      recipientSignatureDate: '',
      dateOfIssue: new Date().toISOString().split('T')[0],
      dbSupplyName: '',
      installationPermanent: true,
      supplySystemType: 'TN-S',
      supplyVoltage: 230,
      phaseConfiguration: 'single_phase',
      phaseRotation: 'n_a',
      supplyFrequency: 50,
      mainSwitchType: '',
      numberOfPoles: null,
      currentRatingA: null,
      shortCircuitWithstandKA: null,
      ratedEarthLeakageTrippingCurrent_mA: 30,
      surgeProtectionInstalled: false,
      lightningProtectionInstalled: false,
      alternativePowerSupply: false,
      specializedInstallation: false,
      aboveOneKV: false,
      inspection1_conductors: undefined,
      inspection2_components: undefined,
      inspection3_disconnecting: undefined,
      inspection4_markings: undefined,
      test1_continuityBonding: '',
      test2_earthContinuity: '',
      test3_continuityRing: '',
      test4_earthLoopImpedance_ohm: undefined,
      test5_neutralLoopImpedance_ohm: undefined,
      test6_pscc_kA: undefined,
      test6_pscc_method: 'measured',
      test7_elevatedVoltage_V: undefined,
      test8_insulationResistance_MOhm: undefined,
      test9_voltageNoLoad_R: undefined,
      test9_voltageNoLoad_Y: undefined,
      test9_voltageNoLoad_B: undefined,
      test10_voltageFullLoad_R: undefined,
      test10_voltageFullLoad_Y: undefined,
      test10_voltageFullLoad_B: undefined,
      test11_earthLeakageValue_mA: undefined,
      test12_earthLeakageTestButton: false,
      test13_polarityCorrect: false,
      test14_phaseRotationCorrect: false,
      test15_switchingDevicesCorrect: false,
      comments: '',
      commentsNotCovered: '',
      section5PersonName: '',
      section5RegCertNo: '',
      section5RegType: undefined,
      section5Date: '',
      section5TelNo: '',
    },
  });

  const w = form.watch();

  // Build engine inputs for live validation
  const buildEngineInputs = (d: AnnexureCOCFormValues) => {
    const cocData: COCData = {
      cocReferenceNumber: d.certificateNo,
      certificateType: d.certificateType === 'initial' ? 'initial' : d.certificateType === 'supplementary' ? 'alteration' : 're-inspection',
      installationAddress: d.physicalAddress,
      registeredPersonName: d.registeredPersonName,
      registrationNumber: d.registrationNumber,
      registrationCategory: d.registrationCategory,
      dateOfIssue: d.dateOfIssue,
      installationType: 'residential', // derived from form context
      phaseConfiguration: d.phaseConfiguration === 'three_phase' ? 'three_phase' : 'single_phase',
      supplyVoltage: d.supplyVoltage || 230,
      supplyFrequency: d.supplyFrequency || 50,
    };

    const testReport: COCTestReport = {
      insulationResistance_MOhm: d.test8_insulationResistance_MOhm ?? null,
      earthLoopImpedance_Zs_Ohm: d.test4_earthLoopImpedance_ohm ?? null,
      rcdTripTime_ms: d.test11_earthLeakageValue_mA ?? null, // maps earth leakage value
      rcdRatedCurrent_mA: d.ratedEarthLeakageTrippingCurrent_mA || 30,
      pscc_kA: d.test6_pscc_kA ?? null,
      earthContinuity_Ohm: null, // test2 is text "Compliant"
      voltageAtMainDB_V: d.test9_voltageNoLoad_R ?? null,
      polarityCorrect: d.test13_polarityCorrect || false,
      hasSignature: d.hasSignature || false,
      signatureDate: d.signatureDate || null,
      hasSolarPV: d.alternativePowerSupply || false,
      hasBESS: false,
      solarGroundingVerified: null,
      inverterSyncVerified: null,
      bessFireProtection: null,
      spdOperational: d.surgeProtectionInstalled || null,
      afddInstalled: null,
    };

    return { cocData, testReport };
  };

  const liveResult = useMemo(() => {
    const { cocData, testReport } = buildEngineInputs(w);
    return validateCOC(cocData, testReport);
  }, [w]);

  // Save
  const onSubmit = async (data: AnnexureCOCFormValues) => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { toast.error('You must be logged in'); return; }

      const { cocData, testReport } = buildEngineInputs(data);
      const result = validateCOC(cocData, testReport);

      const record = {
        form_type: 'annexure1',
        coc_reference_number: data.certificateNo,
        certificate_type: data.certificateType,
        installation_address: data.physicalAddress,
        building_name: data.buildingName || null,
        gps_coordinates: data.gpsCoordinates || null,
        suburb_township: data.suburbTownship || null,
        district_town_city: data.districtTownCity || null,
        erf_lot_no: data.erfLotNo || null,
        registered_person_name: data.registeredPersonName,
        registered_person_id_number: data.registeredPersonIdNo || null,
        registration_number: data.registrationNumber,
        registration_category: data.registrationCategory,
        regulation_type: data.regulationType,
        registered_person_reg_date: data.dateOfRegistration || null,
        date_of_issue: data.dateOfIssue,
        has_signature: data.hasSignature,
        signature_date: data.signatureDate || null,
        installation_type: 'residential',
        phase_configuration: data.phaseConfiguration === 'three_phase' ? 'three_phase' : 'single_phase',
        supply_voltage: data.supplyVoltage,
        supply_frequency: data.supplyFrequency,
        supply_system_type: data.supplySystemType,
        installation_permanent: data.installationPermanent,
        phase_rotation: data.phaseRotation || null,
        main_switch_type: data.mainSwitchType || null,
        number_of_poles: data.numberOfPoles ?? null,
        current_rating_a: data.currentRatingA ?? null,
        short_circuit_withstand_ka: data.shortCircuitWithstandKA ?? null,
        rcd_rated_current: data.ratedEarthLeakageTrippingCurrent_mA,
        insulation_resistance: data.test8_insulationResistance_MOhm ?? null,
        earth_loop_impedance: data.test4_earthLoopImpedance_ohm ?? null,
        neutral_loop_impedance_ohm: data.test5_neutralLoopImpedance_ohm ?? null,
        pscc: data.test6_pscc_kA ?? null,
        elevated_voltage_v: data.test7_elevatedVoltage_V ?? null,
        voltage_no_load_r: data.test9_voltageNoLoad_R ?? null,
        voltage_no_load_y: data.test9_voltageNoLoad_Y ?? null,
        voltage_no_load_b: data.test9_voltageNoLoad_B ?? null,
        voltage_full_load_r: data.test10_voltageFullLoad_R ?? null,
        voltage_full_load_y: data.test10_voltageFullLoad_Y ?? null,
        voltage_full_load_b: data.test10_voltageFullLoad_B ?? null,
        rcd_trip_time: data.test11_earthLeakageValue_mA ?? null,
        earth_leakage_test_button: data.test12_earthLeakageTestButton || false,
        polarity_correct: data.test13_polarityCorrect || false,
        phase_rotation_correct: data.test14_phaseRotationCorrect || false,
        switching_devices_correct: data.test15_switchingDevicesCorrect || false,
        continuity_of_bonding: data.test1_continuityBonding || null,
        earth_continuity: null, // stored as text in form_data_json
        continuity_ring_circuits: data.test3_continuityRing || null,
        comments: data.comments || null,
        db_supply_name: data.dbSupplyName || null,
        has_solar_pv: data.alternativePowerSupply || false,
        has_bess: false,
        spd_operational: data.surgeProtectionInstalled || null,
        voltage_at_main_db: data.test9_voltageNoLoad_R ?? null,
        validation_status: result.status,
        fraud_risk_score: result.fraudRiskScore,
        validation_results_json: JSON.parse(JSON.stringify(result)),
        created_by: userData.user.id,
        site_id: siteId || null,
        form_data_json: {
          contractorName: data.contractorName,
          contractorIdNo: data.contractorIdNo,
          contractorRegNumber: data.contractorRegNumber,
          contractorDateOfRegistration: data.contractorDateOfRegistration,
          contractorHasSignature: data.contractorHasSignature,
          ecBusinessName: data.ecBusinessName,
          ecAddress: data.ecAddress,
          ecTelNo: data.ecTelNo,
          ecFaxNo: data.ecFaxNo,
          ecCellNo: data.ecCellNo,
          ecEmail: data.ecEmail,
          rpAddress: data.rpAddress,
          rpTelNo: data.rpTelNo,
          rpFaxNo: data.rpFaxNo,
          rpCellNo: data.rpCellNo,
          rpEmail: data.rpEmail,
          recipientName: data.recipientName,
          recipientSignatureDate: data.recipientSignatureDate,
          supplementNo: data.supplementNo,
          initialCertificateNo: data.initialCertificateNo,
          initialCertificateIssuedOn: data.initialCertificateIssuedOn,
          inspection1: data.inspection1_conductors,
          inspection2: data.inspection2_components,
          inspection3: data.inspection3_disconnecting,
          inspection4: data.inspection4_markings,
          test1_continuityBonding: data.test1_continuityBonding,
          test2_earthContinuity: data.test2_earthContinuity,
          test3_continuityRing: data.test3_continuityRing,
          test6_pscc_method: data.test6_pscc_method,
          commentsNotCovered: data.commentsNotCovered,
          section5: {
            personName: data.section5PersonName,
            regCertNo: data.section5RegCertNo,
            regType: data.section5RegType,
            date: data.section5Date,
            telNo: data.section5TelNo,
          },
          circuitDescription: data.circuitDescription,
          lightningProtectionInstalled: data.lightningProtectionInstalled,
          specializedInstallation: data.specializedInstallation,
          aboveOneKV: data.aboveOneKV,
        },
      };

      if (editId) {
        const { error } = await supabase.from('coc_local_validations').update(record).eq('id', editId);
        if (error) throw error;
        toast.success('COC validation updated');
      } else {
        const { error } = await supabase.from('coc_local_validations').insert(record);
        if (error) throw error;
        toast.success('COC validation saved');
      }
      onSaved?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // PDF
  const handleDownloadPdf = async () => {
    try {
      const { cocData, testReport } = buildEngineInputs(w);
      const result = validateCOC(cocData, testReport);
      const docDef = buildCOCValidationPdf({ cocData, testReport, validationResult: result });
      const pdfMake = await import('pdfmake/build/pdfmake');
      pdfMake.default.createPdf(docDef).download(
        `Annexure1_COC_${w.certificateNo || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`
      );
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  // Re-validate: re-runs deterministic engine on current form data and updates stored record
  const handleRevalidate = async () => {
    if (!editId) {
      toast.error('Save the record first before re-validating');
      return;
    }
    setRevalidating(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { toast.error('You must be logged in'); return; }

      const currentValues = form.getValues();
      const { cocData, testReport } = buildEngineInputs(currentValues);
      const result = validateCOC(cocData, testReport);

      const { error } = await supabase
        .from('coc_local_validations')
        .update({
          validation_status: result.status,
          fraud_risk_score: result.fraudRiskScore,
          validation_results_json: JSON.parse(JSON.stringify(result)),
        })
        .eq('id', editId);

      if (error) throw error;

      toast.success(
        `Re-validation complete: ${result.status} — ${result.passedRules.length} passed, ${result.failedRules.length} failed`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Re-validation failed');
    } finally {
      setRevalidating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Annexure 1 — Department of Labour</p>
        <h2 className="text-lg font-bold">Certificate of Compliance</h2>
        <p className="text-xs text-muted-foreground">
          General Electrical Installation — OHS Act, 1993 — Electrical Installation Regulations, 2009
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* ═══════════════ PAGE 1: CERTIFICATE OF COMPLIANCE ═══════════════ */}

          {/* Certificate Number & Type */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Certificate Identification
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField control={form.control} name="certificateNo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Certificate No. *</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. NM 1560359" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="certificateType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Certificate Type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="initial">Initial</SelectItem>
                      <SelectItem value="supplementary">Supplementary</SelectItem>
                      <SelectItem value="certificate">Certificate</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="dateOfIssue" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Issue *</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {w.certificateType === 'supplementary' && (
                <>
                  <FormField control={form.control} name="supplementNo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplement No.</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="initialCertificateNo" render={({ field }) => (
                    <FormItem>
                      <FormLabel>To Initial Certificate No.</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="initialCertificateIssuedOn" render={({ field }) => (
                    <FormItem>
                      <FormLabel>As Issued On</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Installation Identification */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Identification of the Relevant Electrical Installation
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="physicalAddress" render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Physical Address *</FormLabel>
                  <FormControl><Input {...field} placeholder="Full physical address" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="buildingName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name of Building</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="gpsCoordinates" render={({ field }) => (
                <FormItem>
                  <FormLabel>GPS Coordinates</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. -26.2041, 28.0473" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="suburbTownship" render={({ field }) => (
                <FormItem>
                  <FormLabel>Suburb / Township</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="districtTownCity" render={({ field }) => (
                <FormItem>
                  <FormLabel>District / Town / City</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="erfLotNo" render={({ field }) => (
                <FormItem>
                  <FormLabel>Erf / Lot No.</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Declaration by Registered Person */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Declaration by Registered Person
              </CardTitle>
              <CardDescription className="text-xs">
                Regulation 7(1) — I declare that I have personally carried out the inspection and testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="registeredPersonName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="registeredPersonIdNo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID Number</FormLabel>
                    <FormControl><Input {...field} placeholder="13-digit SA ID" /></FormControl>
                  </FormItem>
                )} />
              </div>

              {/* Regulation type tick boxes */}
              <FormField control={form.control} name="regulationType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Report as per Requirements (Tick appropriate)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="new_installation">
                        (a) New electrical installation
                      </SelectItem>
                      <SelectItem value="existing_installation">
                        (b) Existing electrical installation
                      </SelectItem>
                      <SelectItem value="new_part_existing">
                        (c) New part to existing installation
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="registrationNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Number *</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateOfRegistration" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Registration</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="registrationCategory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type of Registration *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="installation_electrician">Installation Electrician</SelectItem>
                        <SelectItem value="master_installation_electrician">Master Installation Electrician</SelectItem>
                        <SelectItem value="electrical_tester_single_phase">Electrical Tester (Single Phase)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex items-center gap-6">
                <FormField control={form.control} name="hasSignature" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="cursor-pointer">Signature Present</FormLabel>
                  </FormItem>
                )} />
                {w.hasSignature && (
                  <FormField control={form.control} name="signatureDate" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormLabel>Date:</FormLabel>
                      <FormControl>
                        <Input type="date" value={field.value || ''} onChange={(e) => field.onChange(e.target.value || null)} className="w-40" />
                      </FormControl>
                    </FormItem>
                  )} />
                )}
              </div>

              <Separator />

              {/* Contact details */}
              <p className="text-sm font-medium text-muted-foreground">Contact Details of Registered Person</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="rpAddress" render={({ field }) => (
                  <FormItem className="sm:col-span-2 lg:col-span-3">
                    <FormLabel>Address</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="rpTelNo" render={({ field }) => (
                  <FormItem><FormLabel>Tel No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="rpCellNo" render={({ field }) => (
                  <FormItem><FormLabel>Cell No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="rpEmail" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Declaration by Electrical Contractor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Declaration by Electrical Contractor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="contractorName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contractor Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contractorIdNo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ID Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contractorRegNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Number</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contractorDateOfRegistration" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Registration</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="contractorHasSignature" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0 self-end pb-2">
                    <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                    <FormLabel className="cursor-pointer">Contractor Signature Present</FormLabel>
                  </FormItem>
                )} />
              </div>

              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Contact Details of Electrical Contractor</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="ecBusinessName" render={({ field }) => (
                  <FormItem><FormLabel>Business Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ecAddress" render={({ field }) => (
                  <FormItem className="sm:col-span-2"><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ecTelNo" render={({ field }) => (
                  <FormItem><FormLabel>Tel No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ecCellNo" render={({ field }) => (
                  <FormItem><FormLabel>Cell No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="ecEmail" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl></FormItem>
                )} />
              </div>

              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Recipient</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField control={form.control} name="recipientName" render={({ field }) => (
                  <FormItem><FormLabel>Recipient Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="recipientSignatureDate" render={({ field }) => (
                  <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ═══════════════ PAGE 2: TEST REPORT ═══════════════ */}

          <div className="text-center py-2">
            <Separator />
            <p className="text-sm font-bold text-primary mt-3">TEST REPORT for Electrical Installations</p>
            <p className="text-xs text-muted-foreground">To SANS 10142-1</p>
          </div>

          {/* Test Report Header */}
          <Card>
            <CardContent className="pt-4 grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="dbSupplyName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Report for DB / Supply</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. Main DB" /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Section 2 - Installation */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Section 2 — Installation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField control={form.control} name="installationPermanent" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Installation Type</FormLabel>
                    <Select value={field.value ? 'permanent' : 'temporary'} onValueChange={(v) => field.onChange(v === 'permanent')}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="permanent">Permanent Installation</SelectItem>
                        <SelectItem value="temporary">Temporary Installation</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="supplySystemType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supply System Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="TN-S">TN-S</SelectItem>
                        <SelectItem value="TN-C-S">TN-C-S</SelectItem>
                        <SelectItem value="TN-C">TN-C</SelectItem>
                        <SelectItem value="TT">TT</SelectItem>
                        <SelectItem value="IT">IT</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="supplyVoltage" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Voltage (V)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="supplyFrequency" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Freq (Hz)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="phaseConfiguration" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Phases *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="single_phase">One</SelectItem>
                        <SelectItem value="two_phase">Two</SelectItem>
                        <SelectItem value="three_phase">Three</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="phaseRotation" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phase Rotation</FormLabel>
                    <Select value={field.value || 'n_a'} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="clockwise">Clockwise</SelectItem>
                        <SelectItem value="anticlockwise">Anticlockwise</SelectItem>
                        <SelectItem value="n_a">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="mainSwitchType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Main Switch Type</FormLabel>
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="switch_disconnector">Switch Disconnector (On-load Isolator)</SelectItem>
                        <SelectItem value="fuse_switch">Fuse Switch</SelectItem>
                        <SelectItem value="circuit_breaker">Circuit-breaker</SelectItem>
                        <SelectItem value="elcb">Earth Leakage Circuit-breaker</SelectItem>
                        <SelectItem value="el_switch_disconnector">Earth Leakage Switch Disconnector</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />

                <FormField control={form.control} name="numberOfPoles" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Poles</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="currentRatingA" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Rating (A)</FormLabel>
                    <FormControl><Input type="number" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="shortCircuitWithstandKA" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short-circuit/Withstand Rating (kA)</FormLabel>
                    <FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="ratedEarthLeakageTrippingCurrent_mA" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rated Earth Leakage IΔn (mA)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <Separator />
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {[
                  { name: 'surgeProtectionInstalled' as const, label: 'Surge Protection Installed (6.7.6)' },
                  { name: 'lightningProtectionInstalled' as const, label: 'Lightning Protection Installed (6.7)' },
                  { name: 'alternativePowerSupply' as const, label: 'Alternative Power Supply Installed (7.12)' },
                  { name: 'specializedInstallation' as const, label: 'Specialized Electrical Installation' },
                  { name: 'aboveOneKV' as const, label: 'Any part above 1 kV' },
                ].map(({ name, label }) => (
                  <FormField key={name} control={form.control} name={name} render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl><Checkbox checked={field.value === true} onCheckedChange={field.onChange} /></FormControl>
                      <FormLabel className="cursor-pointer text-sm">{label}</FormLabel>
                    </FormItem>
                  )} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 4 - Inspection and Tests */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TestTube className="h-4 w-4 text-primary" />
                Section 4 — Inspection and Tests
              </CardTitle>
              <CardDescription className="text-xs text-destructive font-medium">
                CRITICAL: All empirical test measurements require numeric values per OHS Act
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Inspection items (Yes/No/N/A) */}
              <div>
                <p className="text-sm font-semibold mb-3">Inspection — Mark as Appropriate</p>
                <div className="space-y-2">
                  {[
                    { name: 'inspection1_conductors' as const, num: '1', text: 'Conductors are of the correct rating and current-carrying capacity for the protective devices and connected load' },
                    { name: 'inspection2_components' as const, num: '2', text: 'Components have been correctly selected and installed' },
                    { name: 'inspection3_disconnecting' as const, num: '3', text: 'Disconnecting devices are correctly located and all switchgear switches the phase conductors' },
                    { name: 'inspection4_markings' as const, num: '4', text: 'Circuits, fuses, switches, terminals, earth leakage units, circuit-breakers, distribution boards are correctly and permanently marked or labelled' },
                  ].map(({ name, num, text }) => (
                    <div key={name} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                      <span className="text-xs font-bold text-primary w-5 shrink-0">{num}.</span>
                      <span className="text-xs flex-1">{text}</span>
                      <FormField control={form.control} name={name} render={({ field }) => (
                        <InspectionSelect value={field.value} onChange={field.onChange} />
                      )} />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Tests 1-15 */}
              <div>
                <p className="text-sm font-semibold mb-3">Tests — Readings & Results</p>
                <div className="space-y-3">
                  {/* Test 1: Continuity of bonding */}
                  <div className="grid grid-cols-[auto_1fr_100px] gap-2 items-center p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-bold text-primary w-5">1.</span>
                    <span className="text-xs">Continuity of bonding</span>
                    <Input {...form.register('test1_continuityBonding')} placeholder="Compliant" className="h-8 text-xs" />
                  </div>

                  {/* Test 2: Earth continuity */}
                  <div className="grid grid-cols-[auto_1fr_100px] gap-2 items-center p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-bold text-primary w-5">2.</span>
                    <span className="text-xs">Resistance of earth continuity conductor at all points (Ω)</span>
                    <Input {...form.register('test2_earthContinuity')} placeholder="Compliant" className="h-8 text-xs" />
                  </div>

                  {/* Test 3: Ring circuits */}
                  <div className="grid grid-cols-[auto_1fr_100px] gap-2 items-center p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-bold text-primary w-5">3.</span>
                    <span className="text-xs">Continuity of ring circuits (if applicable)</span>
                    <Input {...form.register('test3_continuityRing')} placeholder="—" className="h-8 text-xs" />
                  </div>

                  {/* Test 4: Earth loop impedance */}
                  <div className="grid grid-cols-[auto_1fr_80px_20px] gap-2 items-center p-2 rounded-md bg-primary/5">
                    <span className="text-xs font-bold text-primary w-5">4.</span>
                    <span className="text-xs flex items-center gap-1">
                      Earth loop impedance test at main/local switch
                      <ThresholdDot value={w.test4_earthLoopImpedance_ohm} check={(v) => v <= 0 ? 'fail' : v > 1.67 ? 'warn' : 'pass'} />
                    </span>
                    <Input type="number" step="0.01" {...form.register('test4_earthLoopImpedance_ohm', { valueAsNumber: true })} placeholder="Ω" className="h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">Ω</span>
                  </div>

                  {/* Test 5: Neutral loop impedance */}
                  <div className="grid grid-cols-[auto_1fr_80px_20px] gap-2 items-center p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-bold text-primary w-5">5.</span>
                    <span className="text-xs">Neutral loop impedance test at main/local switch</span>
                    <Input type="number" step="0.01" {...form.register('test5_neutralLoopImpedance_ohm', { valueAsNumber: true })} placeholder="Ω" className="h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">Ω</span>
                  </div>

                  {/* Test 6: PSCC */}
                  <div className="grid grid-cols-[auto_1fr_80px_80px] gap-2 items-center p-2 rounded-md bg-primary/5">
                    <span className="text-xs font-bold text-primary w-5">6.</span>
                    <span className="text-xs flex items-center gap-1">
                      Prospective short-circuit current (PSCC)
                      <ThresholdDot value={w.test6_pscc_kA} check={(v) => v <= 0 ? 'fail' : (v < 0.5 || v > 25) ? 'warn' : 'pass'} />
                    </span>
                    <Input type="number" step="0.1" {...form.register('test6_pscc_kA', { valueAsNumber: true })} placeholder="kA" className="h-8 text-xs" />
                    <Select value={w.test6_pscc_method || 'measured'} onValueChange={(v) => form.setValue('test6_pscc_method', v as 'calculated' | 'measured')}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="calculated">Calculated</SelectItem>
                        <SelectItem value="measured">Measured</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Test 7: Elevated voltage */}
                  <div className="grid grid-cols-[auto_1fr_80px_20px] gap-2 items-center p-2 rounded-md bg-muted/20">
                    <span className="text-xs font-bold text-primary w-5">7.</span>
                    <span className="text-xs">Elevated voltage between incoming neutral and external earth</span>
                    <Input type="number" step="0.1" {...form.register('test7_elevatedVoltage_V', { valueAsNumber: true })} placeholder="V" className="h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">V</span>
                  </div>

                  {/* Test 8: Insulation resistance */}
                  <div className="grid grid-cols-[auto_1fr_80px_20px] gap-2 items-center p-2 rounded-md bg-primary/5">
                    <span className="text-xs font-bold text-primary w-5">8.</span>
                    <span className="text-xs flex items-center gap-1">
                      Insulation resistance
                      <ThresholdDot value={w.test8_insulationResistance_MOhm} check={(v) => v > 1.0 ? 'pass' : 'fail'} />
                    </span>
                    <Input type="number" step="0.01" {...form.register('test8_insulationResistance_MOhm', { valueAsNumber: true })} placeholder="MΩ" className="h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">MΩ</span>
                  </div>

                  {/* Tests 9 & 10: Voltage at DB */}
                  <div className="p-2 rounded-md bg-muted/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary w-5">9.</span>
                      <span className="text-xs flex-1">Voltage at DB with no load (per phase to neutral)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 ml-7">
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">R (V)</label>
                        <Input type="number" step="0.1" {...form.register('test9_voltageNoLoad_R', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">Y (V)</label>
                        <Input type="number" step="0.1" {...form.register('test9_voltageNoLoad_Y', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">B (V)</label>
                        <Input type="number" step="0.1" {...form.register('test9_voltageNoLoad_B', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-md bg-muted/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary w-5">10.</span>
                      <span className="text-xs flex-1">Voltage at DB with load / full load (per phase to neutral)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 ml-7">
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">R (V)</label>
                        <Input type="number" step="0.1" {...form.register('test10_voltageFullLoad_R', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">Y (V)</label>
                        <Input type="number" step="0.1" {...form.register('test10_voltageFullLoad_Y', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-0.5">
                        <label className="text-[10px] text-muted-foreground">B (V)</label>
                        <Input type="number" step="0.1" {...form.register('test10_voltageFullLoad_B', { valueAsNumber: true })} className="h-8 text-xs" />
                      </div>
                    </div>
                  </div>

                  {/* Test 11: Earth leakage value */}
                  <div className="grid grid-cols-[auto_1fr_80px_20px] gap-2 items-center p-2 rounded-md bg-primary/5">
                    <span className="text-xs font-bold text-primary w-5">11.</span>
                    <span className="text-xs flex items-center gap-1">
                      Value of operation of earth leakage units
                      <ThresholdDot value={w.test11_earthLeakageValue_mA} check={(v) => v > 300 ? 'fail' : v > 200 ? 'warn' : 'pass'} />
                    </span>
                    <Input type="number" step="1" {...form.register('test11_earthLeakageValue_mA', { valueAsNumber: true })} placeholder="mA" className="h-8 text-xs" />
                    <span className="text-[10px] text-muted-foreground">mA</span>
                  </div>

                  {/* Tests 12-15: Correct/Incorrect checkboxes */}
                  {[
                    { name: 'test12_earthLeakageTestButton' as const, num: '12', text: 'Operation of earth leakage test button' },
                    { name: 'test13_polarityCorrect' as const, num: '13', text: 'Polarity of points of consumption' },
                    { name: 'test14_phaseRotationCorrect' as const, num: '14', text: 'Phase rotation is consistent at all points of consumption (3-phase)' },
                    { name: 'test15_switchingDevicesCorrect' as const, num: '15', text: 'All switching devices, make-and-break circuits' },
                  ].map(({ name, num, text }) => (
                    <div key={name} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center p-2 rounded-md bg-muted/20">
                      <span className="text-xs font-bold text-primary w-5">{num}.</span>
                      <span className="text-xs">{text}</span>
                      <FormField control={form.control} name={name} render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl><Checkbox checked={field.value === true} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="text-xs cursor-pointer">Correct</FormLabel>
                        </FormItem>
                      )} />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Comments */}
              <div className="space-y-3">
                <FormField control={form.control} name="comments" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comments</FormLabel>
                    <FormControl><Textarea {...field} rows={2} placeholder="Any comments..." /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="commentsNotCovered" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comments on parts not covered by this report</FormLabel>
                    <FormControl><Textarea {...field} rows={2} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Section 5 - Responsibility */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Section 5 — Responsibility — Inspection and Tests
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField control={form.control} name="section5PersonName" render={({ field }) => (
                <FormItem><FormLabel>Name of Registered Person</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="section5RegCertNo" render={({ field }) => (
                <FormItem><FormLabel>Registration Certificate No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="section5RegType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type of Registration</FormLabel>
                  <Select value={field.value || ''} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="master_installation_electrician">Master Installation Electrician</SelectItem>
                      <SelectItem value="installation_electrician">Installation Electrician</SelectItem>
                      <SelectItem value="single_phase_tester">Single-phase Tester</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="section5Date" render={({ field }) => (
                <FormItem><FormLabel>Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="section5TelNo" render={({ field }) => (
                <FormItem><FormLabel>Tel No.</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" size="lg" className="flex-1 h-12 text-base" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editId ? 'Update Validation' : 'Save & Validate'}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            {editId && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-12"
                disabled={revalidating}
                onClick={handleRevalidate}
              >
                {revalidating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Re-validate
              </Button>
            )}
          </div>
        </form>
      </Form>

      {/* Live Validation Results */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2">
              <StatusIcon status={liveResult.status} />
              Validation Results
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(liveResult.status)}>
                {liveResult.status.replace('_', ' ')}
              </Badge>
              <Badge className={getFraudColor(liveResult.fraudRiskScore)}>
                Fraud Risk: {liveResult.fraudRiskScore}
              </Badge>
            </div>
          </div>
          <CardDescription>
            {liveResult.totalRulesChecked} rules checked • {liveResult.passedRules.length} passed • {liveResult.failedRules.length} failed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {liveResult.failedRules.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <XCircle className="h-4 w-4" /> Failed Rules ({liveResult.failedRules.length})
              </h4>
              <div className="space-y-1.5">
                {liveResult.failedRules.map((rule) => (
                  <RuleRow key={rule.ruleId} rule={rule} passed={false} />
                ))}
              </div>
            </div>
          )}
          {liveResult.passedRules.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> Passed Rules ({liveResult.passedRules.length})
              </h4>
              <div className="space-y-1.5">
                {liveResult.passedRules.map((rule) => (
                  <RuleRow key={rule.ruleId} rule={rule} passed={true} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RuleRow({ rule, passed }: { rule: ValidationRuleResult; passed: boolean }) {
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-md text-sm ${
      passed ? 'bg-emerald-500/5' : rule.severity === 'CRITICAL' ? 'bg-destructive/5' : 'bg-amber-500/5'
    }`}>
      {passed ? (
        <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
      ) : rule.severity === 'CRITICAL' ? (
        <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{rule.ruleName}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{rule.ruleId}</Badge>
          {rule.sansClause && <span className="text-[10px] text-muted-foreground">{rule.sansClause}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{rule.message}</p>
      </div>
    </div>
  );
}
