import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Settings2, 
  Database, 
  FileText,
  Info,
  Save,
  RotateCcw,
  PlayCircle,
  Loader2,
  TestTube,
  XCircle
} from "lucide-react";

// Type for database settings
interface COCValidationSettingsData {
  id: string;
  earth_continuity_max_ohms: number;
  insulation_resistance_min_mohms: number;
  rcd_trip_1x_max_ms: number;
  rcd_trip_5x_max_ms: number;
  rcd_trip_max_ms: number;
  coc_expiry_domestic_years: number;
  coc_expiry_commercial_years: number;
  ai_confidence_threshold_percent: number;
  hierarchy_check_enabled: boolean;
  earth_continuity_check_enabled: boolean;
  insulation_resistance_check_enabled: boolean;
  protective_conductor_check_enabled: boolean;
  certificate_date_validation_enabled: boolean;
  rcd_function_check_enabled: boolean;
  signature_check_enabled: boolean;
  auto_fail_missing_initial_ref: boolean;
  auto_fail_invalid_certificate: boolean;
  auto_fail_future_dated: boolean;
  auto_fail_earth_resistance_threshold: boolean;
  auto_fail_missing_signature: boolean;
  mandatory_failures_for_fail: number;
  safety_critical_failures_for_fail: number;
  ai_model: string;
  ai_temperature: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// Default values matching database defaults
const DEFAULT_SETTINGS: Omit<COCValidationSettingsData, 'id' | 'created_at' | 'updated_at' | 'updated_by'> = {
  earth_continuity_max_ohms: 5.0,
  insulation_resistance_min_mohms: 0.25,
  rcd_trip_1x_max_ms: 300,
  rcd_trip_5x_max_ms: 150,
  rcd_trip_max_ms: 40,
  coc_expiry_domestic_years: 5,
  coc_expiry_commercial_years: 2,
  ai_confidence_threshold_percent: 30,
  hierarchy_check_enabled: true,
  earth_continuity_check_enabled: true,
  insulation_resistance_check_enabled: true,
  protective_conductor_check_enabled: true,
  certificate_date_validation_enabled: true,
  rcd_function_check_enabled: true,
  signature_check_enabled: true,
  auto_fail_missing_initial_ref: true,
  auto_fail_invalid_certificate: true,
  auto_fail_future_dated: true,
  auto_fail_earth_resistance_threshold: true,
  auto_fail_missing_signature: true,
  mandatory_failures_for_fail: 2,
  safety_critical_failures_for_fail: 1,
  ai_model: 'google/gemini-3-pro-preview',
  ai_temperature: 0.1,
};

// AI Model configuration
const AI_MODELS = [
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview", description: "Best vision for complex documents" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "High quality, balanced speed" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast processing, good accuracy" },
];

interface COCValidationSettingsProps {
  className?: string;
}

export function COCValidationSettings({ className }: COCValidationSettingsProps) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<COCValidationSettingsData>>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testDocumentId, setTestDocumentId] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Fetch settings from database
  const { data: dbSettings, isLoading } = useQuery({
    queryKey: ['coc-validation-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coc_validation_settings')
        .select('*')
        .limit(1)
        .single();
      
      if (error) {
        console.error('Error fetching settings:', error);
        return null;
      }
      return data as COCValidationSettingsData;
    }
  });

  // Fetch available COC documents for testing
  const { data: cocDocuments } = useQuery({
    queryKey: ['coc-documents-for-test'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsection_documents')
        .select(`
          id,
          file_name,
          subsection_id,
          subsections:subsection_id (
            name,
            site_id,
            sites:site_id (name)
          )
        `)
        .ilike('file_name', '%coc%')
        .order('uploaded_at', { ascending: false })
        .limit(50);
      
      if (error) {
        console.error('Error fetching documents:', error);
        return [];
      }
      return data;
    }
  });

  // Update local state when database settings load
  useEffect(() => {
    if (dbSettings) {
      setSettings(dbSettings);
    }
  }, [dbSettings]);

  // Track changes
  useEffect(() => {
    if (!dbSettings) return;
    const changed = JSON.stringify(settings) !== JSON.stringify(dbSettings);
    setHasChanges(changed);
  }, [settings, dbSettings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newSettings: Partial<COCValidationSettingsData>) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      
      const { error } = await supabase
        .from('coc_validation_settings')
        .update({
          ...newSettings,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbSettings?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coc-validation-settings'] });
      toast.success("COC validation settings saved", {
        description: "Changes will apply to future validations"
      });
      setHasChanges(false);
    },
    onError: (error) => {
      console.error('Error saving settings:', error);
      toast.error("Failed to save settings", {
        description: error.message
      });
    }
  });

  const handleSave = () => {
    saveMutation.mutate(settings);
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS, id: dbSettings?.id });
    toast.info("Settings reset to SANS 10142-1:2020 defaults");
  };

  const updateSetting = <K extends keyof COCValidationSettingsData>(
    key: K, 
    value: COCValidationSettingsData[K]
  ) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Run test validation
  const handleTestValidation = async () => {
    if (!testDocumentId) {
      toast.error("Please select a document to test");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Get document details
      const { data: doc, error: docError } = await supabase
        .from('subsection_documents')
        .select('*, subsections:subsection_id(id, name)')
        .eq('id', testDocumentId)
        .single();

      if (docError || !doc) {
        throw new Error('Document not found');
      }

      // Call validate-coc edge function
      const { data, error } = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: testDocumentId,
          subsectionId: doc.subsection_id,
          // Pass current settings for testing
          testSettings: settings
        }
      });

      if (error) throw error;

      setTestResult(data);
      toast.success("Test validation completed", {
        description: `Status: ${data.status}`
      });
    } catch (error: any) {
      console.error('Test validation error:', error);
      setTestResult({ error: error.message });
      toast.error("Test validation failed", {
        description: error.message
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with save/reset buttons */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            COC Validation Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure validation rules based on SANS 10142-1:2020 standards
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" onClick={handleReset} size="sm">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button 
            onClick={handleSave} 
            size="sm" 
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Technical Thresholds Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Technical Thresholds
          </CardTitle>
          <CardDescription>
            Adjustable thresholds for electrical tests based on SANS 10142-1:2020
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Earth Continuity Max (Ω)</Label>
              <Input
                type="number"
                step="0.5"
                value={settings.earth_continuity_max_ohms ?? 5}
                onChange={(e) => updateSetting('earth_continuity_max_ohms', parseFloat(e.target.value) || 5)}
              />
              <p className="text-xs text-muted-foreground">Default: 5Ω</p>
            </div>
            <div className="space-y-2">
              <Label>Insulation Resistance Min (MΩ)</Label>
              <Input
                type="number"
                step="0.05"
                value={settings.insulation_resistance_min_mohms ?? 0.25}
                onChange={(e) => updateSetting('insulation_resistance_min_mohms', parseFloat(e.target.value) || 0.25)}
              />
              <p className="text-xs text-muted-foreground">Default: 0.25MΩ</p>
            </div>
            <div className="space-y-2">
              <Label>RCD Trip ×IΔn Max (ms)</Label>
              <Input
                type="number"
                step="10"
                value={settings.rcd_trip_1x_max_ms ?? 300}
                onChange={(e) => updateSetting('rcd_trip_1x_max_ms', parseInt(e.target.value) || 300)}
              />
              <p className="text-xs text-muted-foreground">Default: 300ms</p>
            </div>
            <div className="space-y-2">
              <Label>RCD Trip ×5IΔn Max (ms)</Label>
              <Input
                type="number"
                step="5"
                value={settings.rcd_trip_5x_max_ms ?? 150}
                onChange={(e) => updateSetting('rcd_trip_5x_max_ms', parseInt(e.target.value) || 150)}
              />
              <p className="text-xs text-muted-foreground">Default: 150ms</p>
            </div>
            <div className="space-y-2">
              <Label>RCD Trip Max (ms)</Label>
              <Input
                type="number"
                step="5"
                value={settings.rcd_trip_max_ms ?? 40}
                onChange={(e) => updateSetting('rcd_trip_max_ms', parseInt(e.target.value) || 40)}
              />
              <p className="text-xs text-muted-foreground">Default: 40ms</p>
            </div>
            <div className="space-y-2">
              <Label>COC Expiry Domestic (years)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={settings.coc_expiry_domestic_years ?? 5}
                onChange={(e) => updateSetting('coc_expiry_domestic_years', parseInt(e.target.value) || 5)}
              />
              <p className="text-xs text-muted-foreground">Default: 5 years</p>
            </div>
            <div className="space-y-2">
              <Label>COC Expiry Commercial (years)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                value={settings.coc_expiry_commercial_years ?? 2}
                onChange={(e) => updateSetting('coc_expiry_commercial_years', parseInt(e.target.value) || 2)}
              />
              <p className="text-xs text-muted-foreground">Default: 2 years</p>
            </div>
            <div className="space-y-2">
              <Label>AI Confidence Threshold (%)</Label>
              <Input
                type="number"
                step="5"
                min="0"
                max="100"
                value={settings.ai_confidence_threshold_percent ?? 30}
                onChange={(e) => updateSetting('ai_confidence_threshold_percent', parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">Default: 30%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Rules Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4" />
            Validation Rules
          </CardTitle>
          <CardDescription>
            Enable or disable specific validation checks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {/* Core validation checks */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Hierarchy Check (Supplementary/Temporary)</Label>
                <p className="text-sm text-muted-foreground">
                  Validate COC type hierarchy requirements
                </p>
              </div>
              <Switch
                checked={settings.hierarchy_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('hierarchy_check_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Earth Continuity Resistance Check</Label>
                <p className="text-sm text-muted-foreground">
                  Verify earth continuity resistance values
                </p>
              </div>
              <Switch
                checked={settings.earth_continuity_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('earth_continuity_check_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Insulation Resistance Check</Label>
                <p className="text-sm text-muted-foreground">
                  Verify insulation resistance values meet minimum
                </p>
              </div>
              <Switch
                checked={settings.insulation_resistance_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('insulation_resistance_check_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Protective Conductor Sizing Check</Label>
                <p className="text-sm text-muted-foreground">
                  Verify protective conductor sizing is adequate
                </p>
              </div>
              <Switch
                checked={settings.protective_conductor_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('protective_conductor_check_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Certificate Date Validation</Label>
                <p className="text-sm text-muted-foreground">
                  Check certificate dates are valid and not expired
                </p>
              </div>
              <Switch
                checked={settings.certificate_date_validation_enabled ?? true}
                onCheckedChange={(v) => updateSetting('certificate_date_validation_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">RCD Function Check</Label>
                <p className="text-sm text-muted-foreground">
                  Verify RCD trip times and functionality
                </p>
              </div>
              <Switch
                checked={settings.rcd_function_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('rcd_function_check_enabled', v)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Signature Check</Label>
                <p className="text-sm text-muted-foreground">
                  Verify required signatures are present
                </p>
              </div>
              <Switch
                checked={settings.signature_check_enabled ?? true}
                onCheckedChange={(v) => updateSetting('signature_check_enabled', v)}
              />
            </div>
          </div>

          <Separator />

          {/* Auto-fail rules */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Auto-Fail Conditions
            </h4>
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="space-y-0.5">
                  <Label className="font-medium">Auto-fail on Missing Initial COC Reference</Label>
                  <p className="text-sm text-muted-foreground">
                    Fail if Supplementary/Temporary missing Initial COC number
                  </p>
                </div>
                <Switch
                  checked={settings.auto_fail_missing_initial_ref ?? true}
                  onCheckedChange={(v) => updateSetting('auto_fail_missing_initial_ref', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="space-y-0.5">
                  <Label className="font-medium">Auto-fail on Invalid Certificate</Label>
                  <p className="text-sm text-muted-foreground">
                    Fail if certificate format or structure is invalid
                  </p>
                </div>
                <Switch
                  checked={settings.auto_fail_invalid_certificate ?? true}
                  onCheckedChange={(v) => updateSetting('auto_fail_invalid_certificate', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="space-y-0.5">
                  <Label className="font-medium">Auto-fail on Future-dated Certificate</Label>
                  <p className="text-sm text-muted-foreground">
                    Fail if certificate issue date is in the future
                  </p>
                </div>
                <Switch
                  checked={settings.auto_fail_future_dated ?? true}
                  onCheckedChange={(v) => updateSetting('auto_fail_future_dated', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="space-y-0.5">
                  <Label className="font-medium">Auto-fail on Earth Resistance &gt; Threshold</Label>
                  <p className="text-sm text-muted-foreground">
                    Fail if earth resistance exceeds configured threshold
                  </p>
                </div>
                <Switch
                  checked={settings.auto_fail_earth_resistance_threshold ?? true}
                  onCheckedChange={(v) => updateSetting('auto_fail_earth_resistance_threshold', v)}
                />
              </div>

              <div className="flex items-center justify-between p-3 border border-destructive/20 rounded-lg bg-destructive/5">
                <div className="space-y-0.5">
                  <Label className="font-medium">Auto-fail on Missing Signature</Label>
                  <p className="text-sm text-muted-foreground">
                    Fail if required installer/owner signatures are missing
                  </p>
                </div>
                <Switch
                  checked={settings.auto_fail_missing_signature ?? true}
                  onCheckedChange={(v) => updateSetting('auto_fail_missing_signature', v)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pass/Fail Status Determination */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Pass/Fail Status Determination
          </CardTitle>
          <CardDescription>
            Configure how many failures trigger a FAIL status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label>Mandatory Check Failures for FAIL Status</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={settings.mandatory_failures_for_fail ?? 2}
                onChange={(e) => updateSetting('mandatory_failures_for_fail', parseInt(e.target.value) || 2)}
              />
              <p className="text-sm text-muted-foreground">
                Number of mandatory check failures that trigger a FAIL status. Default: 2
              </p>
            </div>
            <div className="space-y-3">
              <Label>Safety-Critical Failures for FAIL Status</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={settings.safety_critical_failures_for_fail ?? 1}
                onChange={(e) => updateSetting('safety_critical_failures_for_fail', parseInt(e.target.value) || 1)}
              />
              <p className="text-sm text-muted-foreground">
                Number of safety-critical failures that trigger a FAIL status. Default: 1
              </p>
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <Info className="h-4 w-4 inline mr-2" />
              Safety-critical failures (earth resistance, insulation, RCD) are weighted more heavily than mandatory checks.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* AI Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            AI Model Configuration
          </CardTitle>
          <CardDescription>
            Configure the AI model used for COC analysis and validation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Validation Model</Label>
              <Select 
                value={settings.ai_model ?? 'google/gemini-3-pro-preview'} 
                onValueChange={(v) => updateSetting('ai_model', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">{model.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Temperature: {settings.ai_temperature ?? 0.1}</Label>
              <Slider
                value={[settings.ai_temperature ?? 0.1]}
                onValueChange={([v]) => updateSetting('ai_temperature', v)}
                min={0}
                max={1}
                step={0.1}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Lower = more consistent, Higher = more creative
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <p className="text-sm text-muted-foreground">
              Temperature of 0.1 is recommended for consistent, accurate validation results
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test Validation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TestTube className="h-4 w-4" />
            Test Validation
          </CardTitle>
          <CardDescription>
            Run validation on a document with current settings to test configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label>Select COC Document</Label>
              <Select value={testDocumentId} onValueChange={setTestDocumentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a document to test..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-60">
                    {cocDocuments?.map((doc: any) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        <div className="flex flex-col">
                          <span className="truncate max-w-[300px]">{doc.file_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {doc.subsections?.sites?.name} → {doc.subsections?.name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleTestValidation} 
              disabled={!testDocumentId || isTesting}
              className="min-w-[140px]"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Run Test
            </Button>
          </div>

          {/* Test Results */}
          {testResult && (
            <div className="mt-4">
              <Separator className="mb-4" />
              <h4 className="font-medium mb-3 flex items-center gap-2">
                {testResult.error ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : testResult.status === 'Pass' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                Test Results
              </h4>
              {testResult.error ? (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive">{testResult.error}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-4">
                    <Badge variant={testResult.status === 'Pass' ? 'default' : 'destructive'}>
                      {testResult.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      COC Type: {testResult.cocType || 'Unknown'}
                    </span>
                    {testResult.confidence && (
                      <span className="text-sm text-muted-foreground">
                        Confidence: {testResult.confidence}%
                      </span>
                    )}
                  </div>
                  {testResult.violations && testResult.violations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Violations ({testResult.violations.length}):</p>
                      <ul className="space-y-1">
                        {testResult.violations.slice(0, 5).map((v: any, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <XCircle className="h-3 w-3 mt-1 flex-shrink-0 text-destructive" />
                            <span>{v.message || v.description || JSON.stringify(v)}</span>
                          </li>
                        ))}
                        {testResult.violations.length > 5 && (
                          <li className="text-sm text-muted-foreground">
                            ... and {testResult.violations.length - 5} more
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Quick Reference
          </CardTitle>
          <CardDescription>
            Summary of key SANS 10142-1:2020 requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-medium">COC Hierarchy</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Initial COC required for all premises</li>
                <li>• Supplementary must reference Initial</li>
                <li>• Temporary has validity period</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="font-medium">Critical Auto-Fails</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Earth resistance &gt; {settings.earth_continuity_max_ohms ?? 5}Ω</li>
                <li>• Insulation resistance &lt; {settings.insulation_resistance_min_mohms ?? 0.25}MΩ</li>
                <li>• RCD no-trip at rated current</li>
                <li>• Missing signature/registration</li>
              </ul>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                <span className="font-medium">Status Mapping</span>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Pass → Approved (compliant)</li>
                <li>• Fail → Failed (non-compliant)</li>
                <li>• Incomplete → Pending (review)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
