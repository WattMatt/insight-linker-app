/**
 * COC Validation Form — Strict Empirical Inputs
 * Rules defined in docs/COC_VALIDATION_SPEC.md
 * All test measurements are numeric inputs — checkboxes are legally void per OHS Act.
 */
import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Zap,
  FileWarning,
  Sun,
  Battery,
  Download,
  Save,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  validateCOC,
  type COCData,
  type COCTestReport,
  type COCValidationResult,
  type ValidationRuleResult,
} from '@/utils/cocValidationEngine';
import { buildCOCValidationPdf } from '@/utils/cocValidationPdfBuilder';

// ---------------------------------------------------------------------------
// Zod schema for the form — mirrors engine interfaces
// ---------------------------------------------------------------------------
const cocFormSchema = z.object({
  // Section 1: Certificate Details
  cocReferenceNumber: z.string().trim().min(1, 'COC reference number required').max(50),
  certificateType: z.enum(['initial', 're-inspection', 'alteration']),
  installationAddress: z.string().trim().min(1, 'Address required').max(500),
  installationType: z.enum(['residential', 'commercial', 'industrial']),
  phaseConfiguration: z.enum(['single_phase', 'three_phase']),
  supplyVoltage: z.coerce.number().min(100).max(500).default(230),
  supplyFrequency: z.coerce.number().min(45).max(65).default(50),

  // Section 2: Registered Person
  registeredPersonName: z.string().trim().min(1, 'Name required').max(255),
  registrationNumber: z.string().trim().min(1, 'Registration number required').max(50),
  registrationCategory: z.enum([
    'electrical_tester_single_phase',
    'installation_electrician',
    'master_installation_electrician',
  ]),
  dateOfIssue: z.string().min(1, 'Date of issue required'),
  hasSignature: z.boolean(),
  signatureDate: z.string().nullable(),

  // Section 3: Test Report (numbers or empty)
  insulationResistance_MOhm: z.coerce.number().nullable().optional(),
  earthLoopImpedance_Zs_Ohm: z.coerce.number().nullable().optional(),
  rcdTripTime_ms: z.coerce.number().nullable().optional(),
  rcdRatedCurrent_mA: z.coerce.number().min(1).default(30),
  pscc_kA: z.coerce.number().nullable().optional(),
  earthContinuity_Ohm: z.coerce.number().nullable().optional(),
  voltageAtMainDB_V: z.coerce.number().nullable().optional(),
  polarityCorrect: z.boolean(),

  // Section 4: New Tech
  hasSolarPV: z.boolean(),
  hasBESS: z.boolean(),
  solarGroundingVerified: z.boolean().nullable(),
  inverterSyncVerified: z.boolean().nullable(),
  bessFireProtection: z.boolean().nullable(),
  spdOperational: z.boolean().nullable(),
  afddInstalled: z.boolean().nullable(),
});

type COCFormValues = z.infer<typeof cocFormSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function ThresholdIndicator({ value, check }: {
  value: number | null | undefined;
  check: (v: number) => 'pass' | 'fail' | 'warn';
}) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const result = check(value);
  if (result === 'pass') return <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (result === 'fail') return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface COCValidationFormProps {
  editId?: string | null;
  onSaved?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function COCValidationForm({ editId, onSaved }: COCValidationFormProps) {
  const [saving, setSaving] = useState(false);

  const form = useForm<COCFormValues>({
    resolver: zodResolver(cocFormSchema),
    defaultValues: {
      cocReferenceNumber: '',
      certificateType: 'initial',
      installationAddress: '',
      installationType: 'residential',
      phaseConfiguration: 'single_phase',
      supplyVoltage: 230,
      supplyFrequency: 50,
      registeredPersonName: '',
      registrationNumber: '',
      registrationCategory: 'installation_electrician',
      dateOfIssue: new Date().toISOString().split('T')[0],
      hasSignature: false,
      signatureDate: null,
      insulationResistance_MOhm: undefined,
      earthLoopImpedance_Zs_Ohm: undefined,
      rcdTripTime_ms: undefined,
      rcdRatedCurrent_mA: 30,
      pscc_kA: undefined,
      earthContinuity_Ohm: undefined,
      voltageAtMainDB_V: undefined,
      polarityCorrect: false,
      hasSolarPV: false,
      hasBESS: false,
      solarGroundingVerified: null,
      inverterSyncVerified: null,
      bessFireProtection: null,
      spdOperational: null,
      afddInstalled: null,
    },
  });

  const watchedValues = form.watch();

  // Build engine inputs from form
  const buildEngineInputs = (data: COCFormValues) => {
    const cocData: COCData = {
      cocReferenceNumber: data.cocReferenceNumber || '',
      certificateType: data.certificateType,
      installationAddress: data.installationAddress || '',
      registeredPersonName: data.registeredPersonName || '',
      registrationNumber: data.registrationNumber || '',
      registrationCategory: data.registrationCategory,
      dateOfIssue: data.dateOfIssue || '',
      installationType: data.installationType,
      phaseConfiguration: data.phaseConfiguration,
      supplyVoltage: data.supplyVoltage || 230,
      supplyFrequency: data.supplyFrequency || 50,
    };

    const testReport: COCTestReport = {
      insulationResistance_MOhm: data.insulationResistance_MOhm ?? null,
      earthLoopImpedance_Zs_Ohm: data.earthLoopImpedance_Zs_Ohm ?? null,
      rcdTripTime_ms: data.rcdTripTime_ms ?? null,
      rcdRatedCurrent_mA: data.rcdRatedCurrent_mA || 30,
      pscc_kA: data.pscc_kA ?? null,
      earthContinuity_Ohm: data.earthContinuity_Ohm ?? null,
      voltageAtMainDB_V: data.voltageAtMainDB_V ?? null,
      polarityCorrect: data.polarityCorrect || false,
      hasSignature: data.hasSignature || false,
      signatureDate: data.signatureDate || null,
      hasSolarPV: data.hasSolarPV || false,
      hasBESS: data.hasBESS || false,
      solarGroundingVerified: data.solarGroundingVerified ?? null,
      inverterSyncVerified: data.inverterSyncVerified ?? null,
      bessFireProtection: data.bessFireProtection ?? null,
      spdOperational: data.spdOperational ?? null,
      afddInstalled: data.afddInstalled ?? null,
    };

    return { cocData, testReport };
  };

  // Live validation
  const liveResult = useMemo(() => {
    const { cocData, testReport } = buildEngineInputs(watchedValues);
    return validateCOC(cocData, testReport);
  }, [watchedValues]);

  // Save to Supabase
  const onSubmit = async (data: COCFormValues) => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        toast.error('You must be logged in to save');
        return;
      }

      const { cocData, testReport } = buildEngineInputs(data);
      const result = validateCOC(cocData, testReport);

      const record = {
        coc_reference_number: data.cocReferenceNumber,
        certificate_type: data.certificateType,
        installation_address: data.installationAddress,
        registered_person_name: data.registeredPersonName,
        registration_number: data.registrationNumber,
        registration_category: data.registrationCategory,
        date_of_issue: data.dateOfIssue,
        installation_type: data.installationType,
        phase_configuration: data.phaseConfiguration,
        supply_voltage: data.supplyVoltage,
        supply_frequency: data.supplyFrequency,
        insulation_resistance: data.insulationResistance_MOhm ?? null,
        earth_loop_impedance: data.earthLoopImpedance_Zs_Ohm ?? null,
        rcd_trip_time: data.rcdTripTime_ms ?? null,
        rcd_rated_current: data.rcdRatedCurrent_mA,
        pscc: data.pscc_kA ?? null,
        earth_continuity: data.earthContinuity_Ohm ?? null,
        voltage_at_main_db: data.voltageAtMainDB_V ?? null,
        polarity_correct: data.polarityCorrect,
        has_signature: data.hasSignature,
        signature_date: data.signatureDate || null,
        has_solar_pv: data.hasSolarPV,
        has_bess: data.hasBESS,
        solar_grounding_verified: data.solarGroundingVerified,
        inverter_sync_verified: data.inverterSyncVerified,
        bess_fire_protection: data.bessFireProtection,
        spd_operational: data.spdOperational,
        afdd_installed: data.afddInstalled,
        validation_status: result.status,
        fraud_risk_score: result.fraudRiskScore,
        validation_results_json: JSON.parse(JSON.stringify(result)),
        created_by: userData.user.id,
      };

      if (editId) {
        const { error } = await supabase
          .from('coc_local_validations')
          .update(record)
          .eq('id', editId);
        if (error) throw error;
        toast.success('COC validation updated');
      } else {
        const { error } = await supabase
          .from('coc_local_validations')
          .insert(record);
        if (error) throw error;
        toast.success('COC validation saved');
      }

      onSaved?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // PDF Download
  const handleDownloadPdf = async () => {
    try {
      const { cocData, testReport } = buildEngineInputs(watchedValues);
      const result = validateCOC(cocData, testReport);
      const docDef = buildCOCValidationPdf({ cocData, testReport, validationResult: result });

      const pdfMake = await import('pdfmake/build/pdfmake');
      pdfMake.default.createPdf(docDef).download(
        `COC_Validation_${watchedValues.cocReferenceNumber || 'report'}_${new Date().toISOString().split('T')[0]}.pdf`
      );
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('PDF generation error:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const hasMissingTests =
    watchedValues.insulationResistance_MOhm == null ||
    watchedValues.earthLoopImpedance_Zs_Ohm == null ||
    watchedValues.rcdTripTime_ms == null ||
    watchedValues.pscc_kA == null;

  return (
    <div className="space-y-6">
      {/* Incomplete Certificate Warning */}
      {hasMissingTests && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>Incomplete Certificate Warning</AlertTitle>
          <AlertDescription>
            One or more mandatory Section 4 test measurements are missing. An incomplete certificate is
            legally void per OHS Act 85 of 1993. All fields marked with <span className="font-semibold">*</span> require
            empirical numeric values.
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* ──────────────── Section 1: Certificate Details ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Section 1: Certificate Details
              </CardTitle>
              <CardDescription>Basic certificate identification and installation classification</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField control={form.control} name="cocReferenceNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>COC Reference Number *</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. ECA-2024-001234" /></FormControl>
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
                      <SelectItem value="re-inspection">Re-inspection</SelectItem>
                      <SelectItem value="alteration">Alteration</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="installationAddress" render={({ field }) => (
                <FormItem className="sm:col-span-2 lg:col-span-1">
                  <FormLabel>Installation Address *</FormLabel>
                  <FormControl><Input {...field} placeholder="Full physical address" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="installationType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Installation Type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="phaseConfiguration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phase Configuration *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="single_phase">Single Phase</SelectItem>
                      <SelectItem value="three_phase">Three Phase</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="supplyVoltage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voltage (V)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="supplyFrequency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Freq (Hz)</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ──────────────── Section 2: Registered Person ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Section 2: Registered Person (Issuer)
              </CardTitle>
              <CardDescription>Details of the person issuing the certificate</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="registeredPersonName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input {...field} placeholder="Registered person name" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="registrationNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration Number *</FormLabel>
                  <FormControl><Input {...field} placeholder="e.g. EC12345" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="registrationCategory" render={({ field }) => (
                <FormItem>
                  <FormLabel>Registration Category *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="electrical_tester_single_phase">Electrical Tester (Single Phase)</SelectItem>
                      <SelectItem value="installation_electrician">Installation Electrician (IE)</SelectItem>
                      <SelectItem value="master_installation_electrician">Master Installation Electrician (MIE)</SelectItem>
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

              <div className="flex items-center gap-6 sm:col-span-2">
                <FormField control={form.control} name="hasSignature" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer">Signature Present</FormLabel>
                  </FormItem>
                )} />

                {watchedValues.hasSignature && (
                  <FormField control={form.control} name="signatureDate" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormLabel>Signature Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          value={field.value || ''}
                          onChange={(e) => field.onChange(e.target.value || null)}
                          className="w-40"
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* ──────────────── Section 3: Test Report ──────────────── */}
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Section 3: Section 4 Test Report
              </CardTitle>
              <CardDescription className="text-destructive font-medium">
                CRITICAL: All measurements must be numeric values — checkboxes and "OK" are legally void per OHS Act
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Insulation Resistance */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Insulation Resistance (MΩ) *
                    <ThresholdIndicator
                      value={watchedValues.insulationResistance_MOhm}
                      check={(v) => v > 1.0 ? 'pass' : 'fail'}
                    />
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 2.5"
                    {...form.register('insulationResistance_MOhm', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Min: 1.0 MΩ (SANS 10142-1 Cl. 8.5)</p>
                </div>

                {/* Earth Loop Impedance */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    Earth Loop Impedance Zs (Ω) *
                    <ThresholdIndicator
                      value={watchedValues.earthLoopImpedance_Zs_Ohm}
                      check={(v) => v <= 0 ? 'fail' : v > 1.67 ? 'warn' : 'pass'}
                    />
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 0.85"
                    {...form.register('earthLoopImpedance_Zs_Ohm', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Max: 1.67 Ω for Type B MCB (Cl. 8.4)</p>
                </div>

                {/* RCD Trip Time */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    RCD Trip Time (ms) *
                    <ThresholdIndicator
                      value={watchedValues.rcdTripTime_ms}
                      check={(v) => v > 300 ? 'fail' : v > 200 ? 'warn' : 'pass'}
                    />
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="e.g. 25"
                    {...form.register('rcdTripTime_ms', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Max: 300ms for 30mA device (Cl. 8.8)</p>
                </div>

                {/* RCD Rated Current */}
                <div className="space-y-1.5">
                  <Label>RCD Rated Current (mA)</Label>
                  <Input
                    type="number"
                    step="1"
                    {...form.register('rcdRatedCurrent_mA', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Typical: 30 mA</p>
                </div>

                {/* PSCC */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-2">
                    PSCC (kA) *
                    <ThresholdIndicator
                      value={watchedValues.pscc_kA}
                      check={(v) => v <= 0 ? 'fail' : (v < 0.5 || v > 25) ? 'warn' : 'pass'}
                    />
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 6.0"
                    {...form.register('pscc_kA', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Normal range: 0.5–25 kA (Cl. 8.6)</p>
                </div>

                {/* Earth Continuity */}
                <div className="space-y-1.5">
                  <Label>Earth Continuity (Ω)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 0.15"
                    {...form.register('earthContinuity_Ohm', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Typically &lt; 1.0 Ω</p>
                </div>

                {/* Voltage at Main DB */}
                <div className="space-y-1.5">
                  <Label>Voltage at Main DB (V)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 230"
                    {...form.register('voltageAtMainDB_V', { valueAsNumber: true })}
                  />
                  <p className="text-xs text-muted-foreground">Expected: 220–240 V</p>
                </div>

                {/* Polarity */}
                <FormField control={form.control} name="polarityCorrect" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0 self-end pb-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer">Polarity Correct</FormLabel>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* ──────────────── Section 4: New Tech ──────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" />
                Section 4: SANS 10142-1:2024 New Technology
              </CardTitle>
              <CardDescription>Solar PV, BESS, SPD, and AFDD requirements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <FormField control={form.control} name="hasSolarPV" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer flex items-center gap-1">
                      <Sun className="h-4 w-4" /> Solar PV Installed
                    </FormLabel>
                  </FormItem>
                )} />

                <FormField control={form.control} name="hasBESS" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="cursor-pointer flex items-center gap-1">
                      <Battery className="h-4 w-4" /> BESS Installed
                    </FormLabel>
                  </FormItem>
                )} />
              </div>

              {watchedValues.hasSolarPV && (
                <div className="ml-6 pl-4 border-l-2 border-amber-400/50 space-y-3">
                  <p className="text-sm font-medium text-amber-700">Solar PV Verification Required</p>
                  <div className="flex flex-wrap gap-6">
                    <FormField control={form.control} name="solarGroundingVerified" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked === true ? true : null)}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer">Solar Grounding Verified</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="inverterSyncVerified" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value === true}
                            onCheckedChange={(checked) => field.onChange(checked === true ? true : null)}
                          />
                        </FormControl>
                        <FormLabel className="cursor-pointer">Inverter Sync Verified</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                </div>
              )}

              {watchedValues.hasBESS && (
                <div className="ml-6 pl-4 border-l-2 border-amber-400/50 space-y-3">
                  <p className="text-sm font-medium text-amber-700">BESS Verification Required</p>
                  <FormField control={form.control} name="bessFireProtection" render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value === true}
                          onCheckedChange={(checked) => field.onChange(checked === true ? true : null)}
                        />
                      </FormControl>
                      <FormLabel className="cursor-pointer">BESS Fire Protection Verified</FormLabel>
                    </FormItem>
                  )} />
                </div>
              )}

              <Separator />

              <div className="flex flex-wrap gap-6">
                <FormField control={form.control} name="spdOperational" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : null)}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">SPD Operational (Mandatory)</FormLabel>
                  </FormItem>
                )} />

                <FormField control={form.control} name="afddInstalled" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value === true}
                        onCheckedChange={(checked) => field.onChange(checked === true ? true : null)}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">AFDD Installed</FormLabel>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" size="lg" className="flex-1 h-12 text-base" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {editId ? 'Update Validation' : 'Save & Validate'}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </form>
      </Form>

      {/* ──────────────── Live Validation Results ──────────────── */}
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
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {rule.ruleId}
          </Badge>
          {rule.sansClause && (
            <span className="text-[10px] text-muted-foreground">{rule.sansClause}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{rule.message}</p>
      </div>
    </div>
  );
}
