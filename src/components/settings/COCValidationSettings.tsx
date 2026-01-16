import { useState, useEffect, useMemo } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { SANSReferenceTab } from "./SANSReferenceTab";
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
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Copy,
  FileCheck,
  AlertCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Settings
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
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview", description: "Best vision for complex documents", tier: "premium" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "High quality, balanced speed", tier: "standard" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast processing, good accuracy", tier: "fast" },
];

// Preset configurations for quick setup
const PRESET_CONFIGS = {
  strict: {
    name: "Strict Compliance",
    description: "Maximum validation with all checks enabled",
    icon: Shield,
    settings: {
      ...DEFAULT_SETTINGS,
      ai_confidence_threshold_percent: 50,
      mandatory_failures_for_fail: 1,
      safety_critical_failures_for_fail: 1,
    }
  },
  standard: {
    name: "Standard",
    description: "Balanced validation for typical installations",
    icon: CheckCircle2,
    settings: DEFAULT_SETTINGS
  },
  relaxed: {
    name: "Relaxed",
    description: "Minimal validation for legacy systems",
    icon: Clock,
    settings: {
      ...DEFAULT_SETTINGS,
      ai_confidence_threshold_percent: 20,
      mandatory_failures_for_fail: 3,
      safety_critical_failures_for_fail: 2,
      protective_conductor_check_enabled: false,
    }
  }
};

interface COCValidationSettingsProps {
  className?: string;
}

export function COCValidationSettings({ className }: COCValidationSettingsProps) {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Partial<COCValidationSettingsData>>(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [testDocumentId, setTestDocumentId] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(["thresholds", "rules"]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testResultExpanded, setTestResultExpanded] = useState(true);

  // Fetch settings from database
  const { data: dbSettings, isLoading, refetch: refetchSettings } = useQuery({
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
  const { data: cocDocuments, isLoading: loadingDocs } = useQuery({
    queryKey: ['coc-documents-for-test'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subsection_documents')
        .select(`
          id,
          file_name,
          file_url,
          uploaded_at,
          subsection_id,
          coc_status,
          subsections:subsection_id (
            name,
            site_id,
            sites:site_id (name)
          )
        `)
        .or('file_name.ilike.%coc%,file_name.ilike.%certificate%')
        .order('uploaded_at', { ascending: false })
        .limit(100);
      
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

  // Calculate enabled checks count
  const enabledChecksCount = useMemo(() => {
    let count = 0;
    if (settings.hierarchy_check_enabled) count++;
    if (settings.earth_continuity_check_enabled) count++;
    if (settings.insulation_resistance_check_enabled) count++;
    if (settings.protective_conductor_check_enabled) count++;
    if (settings.certificate_date_validation_enabled) count++;
    if (settings.rcd_function_check_enabled) count++;
    if (settings.signature_check_enabled) count++;
    return count;
  }, [settings]);

  // Calculate auto-fail count
  const autoFailCount = useMemo(() => {
    let count = 0;
    if (settings.auto_fail_missing_initial_ref) count++;
    if (settings.auto_fail_invalid_certificate) count++;
    if (settings.auto_fail_future_dated) count++;
    if (settings.auto_fail_earth_resistance_threshold) count++;
    if (settings.auto_fail_missing_signature) count++;
    return count;
  }, [settings]);

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
    // Validate settings before saving
    const errors: string[] = [];
    
    if ((settings.earth_continuity_max_ohms ?? 0) <= 0) {
      errors.push("Earth continuity maximum must be greater than 0");
    }
    if ((settings.insulation_resistance_min_mohms ?? 0) <= 0) {
      errors.push("Insulation resistance minimum must be greater than 0");
    }
    if ((settings.mandatory_failures_for_fail ?? 0) < 1) {
      errors.push("Mandatory failures count must be at least 1");
    }
    if ((settings.safety_critical_failures_for_fail ?? 0) < 1) {
      errors.push("Safety-critical failures count must be at least 1");
    }
    
    if (errors.length > 0) {
      toast.error("Validation errors", {
        description: errors.join(". ")
      });
      return;
    }
    
    saveMutation.mutate(settings);
  };

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS, id: dbSettings?.id });
    toast.info("Settings reset to SANS 10142-1:2020 defaults");
  };

  const applyPreset = (presetKey: keyof typeof PRESET_CONFIGS) => {
    const preset = PRESET_CONFIGS[presetKey];
    setSettings({ ...preset.settings, id: dbSettings?.id });
    toast.success(`Applied "${preset.name}" preset`, {
      description: preset.description
    });
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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  // Run test validation
  const handleTestValidation = async () => {
    if (!testDocumentId) {
      toast.error("Please select a document to test");
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    setTestResultExpanded(true);

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

      const startTime = Date.now();

      // Call validate-coc edge function
      const { data, error } = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: testDocumentId,
          subsectionId: doc.subsection_id,
          testSettings: settings
        }
      });

      const duration = Date.now() - startTime;

      if (error) throw error;

      setTestResult({
        ...data,
        duration,
        documentName: doc.file_name,
        subsectionName: doc.subsections?.name
      });
      
      toast.success("Test validation completed", {
        description: `Status: ${data.status} (${(duration / 1000).toFixed(1)}s)`
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

  const copySettingsToClipboard = () => {
    const settingsJson = JSON.stringify(settings, null, 2);
    navigator.clipboard.writeText(settingsJson);
    toast.success("Settings copied to clipboard");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading validation settings...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("space-y-6", className)}>
        {/* Main Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              COC Validation
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configure validation rules and reference SANS 10142-1:2020 standards
            </p>
          </div>
        </div>

        {/* Sub-tabs for Configuration and SANS Reference */}
        <Tabs defaultValue="configuration" className="w-full">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="configuration" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="sans-reference" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              SANS Reference
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configuration" className="mt-6 space-y-6">
            {/* Configuration Header with save/reset buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {hasChanges && (
                <Badge variant="outline" className="text-amber-600 border-amber-600 animate-pulse">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Unsaved changes
                </Badge>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={copySettingsToClipboard}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy settings as JSON</TooltipContent>
              </Tooltip>
              <Button variant="outline" onClick={handleReset} size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Quick Presets
            </CardTitle>
            <CardDescription>
              Apply predefined configuration profiles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(PRESET_CONFIGS).map(([key, preset]) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={key}
                    onClick={() => applyPreset(key as keyof typeof PRESET_CONFIGS)}
                    className={cn(
                      "p-4 border rounded-lg text-left transition-all hover:border-primary hover:bg-primary/5",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium">{preset.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Status Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <CheckCircle2 className="h-4 w-4" />
              Enabled Checks
            </div>
            <div className="text-2xl font-bold">{enabledChecksCount}/7</div>
            <Progress value={(enabledChecksCount / 7) * 100} className="h-1 mt-2" />
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              Auto-Fail Rules
            </div>
            <div className="text-2xl font-bold">{autoFailCount}/5</div>
            <Progress value={(autoFailCount / 5) * 100} className="h-1 mt-2" />
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Zap className="h-4 w-4" />
              AI Confidence
            </div>
            <div className="text-2xl font-bold">{settings.ai_confidence_threshold_percent ?? 30}%</div>
            <Progress value={settings.ai_confidence_threshold_percent ?? 30} className="h-1 mt-2" />
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Settings2 className="h-4 w-4" />
              Model
            </div>
            <div className="text-sm font-medium truncate">
              {AI_MODELS.find(m => m.id === settings.ai_model)?.name?.split(' ').slice(0, 2).join(' ') || 'Not set'}
            </div>
            <Badge variant="outline" className="mt-2 text-xs">
              {AI_MODELS.find(m => m.id === settings.ai_model)?.tier || 'standard'}
            </Badge>
          </Card>
        </div>

        {/* Technical Thresholds Section */}
        <Collapsible 
          open={expandedSections.includes("thresholds")} 
          onOpenChange={() => toggleSection("thresholds")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Zap className="h-4 w-4" />
                      Technical Thresholds
                    </CardTitle>
                    <CardDescription>
                      Adjustable thresholds for electrical tests based on SANS 10142-1:2020
                    </CardDescription>
                  </div>
                  {expandedSections.includes("thresholds") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Earth Continuity Max (Ω)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Maximum earth continuity resistance per SANS 10142-1 Clause 8.4.3.3
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.1"
                      value={settings.earth_continuity_max_ohms ?? 5}
                      onChange={(e) => updateSetting('earth_continuity_max_ohms', parseFloat(e.target.value) || 5)}
                      className={cn(
                        (settings.earth_continuity_max_ohms ?? 5) !== 5 && "border-amber-500"
                      )}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 5Ω</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>Insulation Resistance Min (MΩ)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Minimum insulation resistance per SANS 10142-1 Clause 8.4.3.2
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.01"
                      value={settings.insulation_resistance_min_mohms ?? 0.25}
                      onChange={(e) => updateSetting('insulation_resistance_min_mohms', parseFloat(e.target.value) || 0.25)}
                      className={cn(
                        (settings.insulation_resistance_min_mohms ?? 0.25) !== 0.25 && "border-amber-500"
                      )}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 0.25MΩ</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>RCD Trip ×IΔn Max (ms)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Maximum RCD trip time at rated current
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      step="10"
                      min="10"
                      value={settings.rcd_trip_1x_max_ms ?? 300}
                      onChange={(e) => updateSetting('rcd_trip_1x_max_ms', parseInt(e.target.value) || 300)}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 300ms</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>RCD Trip ×5IΔn Max (ms)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Maximum RCD trip time at 5× rated current
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      type="number"
                      step="5"
                      min="5"
                      value={settings.rcd_trip_5x_max_ms ?? 150}
                      onChange={(e) => updateSetting('rcd_trip_5x_max_ms', parseInt(e.target.value) || 150)}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 150ms</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>RCD Trip Max (ms)</Label>
                    <Input
                      type="number"
                      step="5"
                      min="5"
                      value={settings.rcd_trip_max_ms ?? 40}
                      onChange={(e) => updateSetting('rcd_trip_max_ms', parseInt(e.target.value) || 40)}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 40ms</p>
                  </div>
                  <div className="space-y-2">
                    <Label>COC Expiry Domestic (years)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      max="10"
                      value={settings.coc_expiry_domestic_years ?? 5}
                      onChange={(e) => updateSetting('coc_expiry_domestic_years', parseInt(e.target.value) || 5)}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 5 years</p>
                  </div>
                  <div className="space-y-2">
                    <Label>COC Expiry Commercial (years)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      max="10"
                      value={settings.coc_expiry_commercial_years ?? 2}
                      onChange={(e) => updateSetting('coc_expiry_commercial_years', parseInt(e.target.value) || 2)}
                    />
                    <p className="text-xs text-muted-foreground">Standard: 2 years</p>
                  </div>
                  <div className="space-y-2">
                    <Label>AI Confidence Threshold (%)</Label>
                    <div className="flex items-center gap-2">
                      <Slider
                        value={[settings.ai_confidence_threshold_percent ?? 30]}
                        onValueChange={([v]) => updateSetting('ai_confidence_threshold_percent', v)}
                        min={10}
                        max={90}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-10 text-right">
                        {settings.ai_confidence_threshold_percent ?? 30}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Standard: 30%</p>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Validation Rules Section */}
        <Collapsible 
          open={expandedSections.includes("rules")} 
          onOpenChange={() => toggleSection("rules")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-4 w-4" />
                      Validation Rules
                      <Badge variant="secondary" className="ml-2">{enabledChecksCount} enabled</Badge>
                    </CardTitle>
                    <CardDescription>
                      Enable or disable specific validation checks
                    </CardDescription>
                  </div>
                  {expandedSections.includes("rules") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid gap-3">
                  {/* Core validation checks */}
                  <ValidationToggle
                    label="Hierarchy Check (Supplementary/Temporary)"
                    description="Validate COC type hierarchy requirements"
                    checked={settings.hierarchy_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('hierarchy_check_enabled', v)}
                  />

                  <ValidationToggle
                    label="Earth Continuity Resistance Check"
                    description="Verify earth continuity resistance values"
                    checked={settings.earth_continuity_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('earth_continuity_check_enabled', v)}
                    critical
                  />

                  <ValidationToggle
                    label="Insulation Resistance Check"
                    description="Verify insulation resistance values meet minimum"
                    checked={settings.insulation_resistance_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('insulation_resistance_check_enabled', v)}
                    critical
                  />

                  <ValidationToggle
                    label="Protective Conductor Sizing Check"
                    description="Verify protective conductor sizing is adequate"
                    checked={settings.protective_conductor_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('protective_conductor_check_enabled', v)}
                  />

                  <ValidationToggle
                    label="Certificate Date Validation"
                    description="Check certificate dates are valid and not expired"
                    checked={settings.certificate_date_validation_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('certificate_date_validation_enabled', v)}
                  />

                  <ValidationToggle
                    label="RCD Function Check"
                    description="Verify RCD trip times and functionality"
                    checked={settings.rcd_function_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('rcd_function_check_enabled', v)}
                    critical
                  />

                  <ValidationToggle
                    label="Signature Check"
                    description="Verify required signatures are present"
                    checked={settings.signature_check_enabled ?? true}
                    onCheckedChange={(v) => updateSetting('signature_check_enabled', v)}
                  />
                </div>

                <Separator />

                {/* Auto-fail rules */}
                <div className="space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Auto-Fail Conditions
                    <Badge variant="destructive" className="ml-2">{autoFailCount} active</Badge>
                  </h4>
                  <div className="grid gap-3">
                    <AutoFailToggle
                      label="Auto-fail on Missing Initial COC Reference"
                      description="Fail if Supplementary/Temporary missing Initial COC number"
                      checked={settings.auto_fail_missing_initial_ref ?? true}
                      onCheckedChange={(v) => updateSetting('auto_fail_missing_initial_ref', v)}
                    />

                    <AutoFailToggle
                      label="Auto-fail on Invalid Certificate"
                      description="Fail if certificate format or structure is invalid"
                      checked={settings.auto_fail_invalid_certificate ?? true}
                      onCheckedChange={(v) => updateSetting('auto_fail_invalid_certificate', v)}
                    />

                    <AutoFailToggle
                      label="Auto-fail on Future-dated Certificate"
                      description="Fail if certificate issue date is in the future"
                      checked={settings.auto_fail_future_dated ?? true}
                      onCheckedChange={(v) => updateSetting('auto_fail_future_dated', v)}
                    />

                    <AutoFailToggle
                      label="Auto-fail on Earth Resistance > Threshold"
                      description={`Fail if earth resistance exceeds ${settings.earth_continuity_max_ohms ?? 5}Ω`}
                      checked={settings.auto_fail_earth_resistance_threshold ?? true}
                      onCheckedChange={(v) => updateSetting('auto_fail_earth_resistance_threshold', v)}
                    />

                    <AutoFailToggle
                      label="Auto-fail on Missing Signature"
                      description="Fail if required installer/owner signatures are missing"
                      checked={settings.auto_fail_missing_signature ?? true}
                      onCheckedChange={(v) => updateSetting('auto_fail_missing_signature', v)}
                    />
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Pass/Fail Status Determination */}
        <Collapsible 
          open={expandedSections.includes("passfail")} 
          onOpenChange={() => toggleSection("passfail")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Database className="h-4 w-4" />
                      Pass/Fail Status Determination
                    </CardTitle>
                    <CardDescription>
                      Configure how many failures trigger a FAIL status
                    </CardDescription>
                  </div>
                  {expandedSections.includes("passfail") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label>Mandatory Check Failures for FAIL Status</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings.mandatory_failures_for_fail ?? 2]}
                        onValueChange={([v]) => updateSetting('mandatory_failures_for_fail', v)}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-2xl font-bold w-8 text-center">
                        {settings.mandatory_failures_for_fail ?? 2}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Number of mandatory check failures that trigger a FAIL status
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Label>Safety-Critical Failures for FAIL Status</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings.safety_critical_failures_for_fail ?? 1]}
                        onValueChange={([v]) => updateSetting('safety_critical_failures_for_fail', v)}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                      />
                      <span className="text-2xl font-bold w-8 text-center">
                        {settings.safety_critical_failures_for_fail ?? 1}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Number of safety-critical failures that trigger a FAIL status
                    </p>
                  </div>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    Safety-critical failures (earth resistance, insulation, RCD) are weighted more heavily than mandatory checks.
                  </p>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* AI Model Configuration */}
        <Collapsible 
          open={expandedSections.includes("ai")} 
          onOpenChange={() => toggleSection("ai")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Settings2 className="h-4 w-4" />
                      AI Model Configuration
                    </CardTitle>
                    <CardDescription>
                      Configure the AI model used for COC analysis and validation
                    </CardDescription>
                  </div>
                  {expandedSections.includes("ai") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <div className="flex items-center gap-2">
                              <span>{model.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {model.tier}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {AI_MODELS.find(m => m.id === settings.ai_model)?.description}
                    </p>
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
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>More consistent</span>
                      <span>More creative</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Temperature of 0.1 is recommended for consistent, accurate validation results
                  </p>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label>Select COC Document</Label>
                <Select value={testDocumentId} onValueChange={setTestDocumentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingDocs ? "Loading documents..." : "Select a document to test..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-72">
                      {cocDocuments?.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No COC documents found
                        </div>
                      ) : (
                        cocDocuments?.map((doc: any) => (
                          <SelectItem key={doc.id} value={doc.id}>
                            <div className="flex items-center gap-2">
                              <FileCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate max-w-[280px] text-sm">{doc.file_name}</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                                  {doc.subsections?.sites?.name} → {doc.subsections?.name}
                                </span>
                              </div>
                              {doc.coc_status && (
                                <Badge variant="outline" className="ml-auto text-xs flex-shrink-0">
                                  {doc.coc_status}
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setTestResult(null);
                    setTestDocumentId("");
                  }}
                  disabled={!testResult && !testDocumentId}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button 
                  onClick={handleTestValidation} 
                  disabled={!testDocumentId || isTesting}
                  className="min-w-[140px]"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Run Test
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Test Results */}
            {testResult && (
              <Collapsible open={testResultExpanded} onOpenChange={setTestResultExpanded}>
                <div className="mt-4 border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors">
                      <div className="flex items-center gap-3">
                        {testResult.error ? (
                          <XCircle className="h-5 w-5 text-destructive" />
                        ) : testResult.status === 'Pass' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                        )}
                        <div>
                          <h4 className="font-medium">Test Results</h4>
                          <p className="text-sm text-muted-foreground">
                            {testResult.documentName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {testResult.duration && (
                          <Badge variant="outline" className="text-xs">
                            {(testResult.duration / 1000).toFixed(1)}s
                          </Badge>
                        )}
                        {testResultExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 border-t">
                      {testResult.error ? (
                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <p className="text-sm text-destructive">{testResult.error}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-4">
                            <Badge 
                              variant={testResult.status === 'Pass' ? 'default' : 'destructive'}
                              className="text-sm px-3 py-1"
                            >
                              {testResult.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              COC Type: <span className="font-medium">{testResult.cocType || 'Unknown'}</span>
                            </span>
                            {testResult.confidence && (
                              <span className="text-sm text-muted-foreground">
                                Confidence: <span className="font-medium">{testResult.confidence}%</span>
                              </span>
                            )}
                            {testResult.cocNumber && (
                              <span className="text-sm text-muted-foreground">
                                COC #: <span className="font-medium">{testResult.cocNumber}</span>
                              </span>
                            )}
                          </div>

                          {/* Checks performed */}
                          {testResult.checks && testResult.checks.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Checks Performed ({testResult.checks.length}):</p>
                              <div className="grid gap-2">
                                {testResult.checks.map((check: any, i: number) => (
                                  <div 
                                    key={i} 
                                    className={cn(
                                      "flex items-start gap-2 p-2 rounded-md text-sm",
                                      check.passed ? "bg-green-500/10" : "bg-destructive/10"
                                    )}
                                  >
                                    {check.passed ? (
                                      <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-500" />
                                    ) : (
                                      <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                                    )}
                                    <div>
                                      <span className="font-medium">{check.name}</span>
                                      {check.message && (
                                        <p className="text-muted-foreground">{check.message}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Violations */}
                          {testResult.violations && testResult.violations.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-destructive">
                                Violations Found ({testResult.violations.length}):
                              </p>
                              <div className="space-y-2">
                                {testResult.violations.map((v: any, i: number) => (
                                  <div 
                                    key={i} 
                                    className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md"
                                  >
                                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-destructive" />
                                    <div className="space-y-1">
                                      <span className="text-sm font-medium">{v.rule || v.check || 'Violation'}</span>
                                      <p className="text-sm text-muted-foreground">
                                        {v.message || v.description || JSON.stringify(v)}
                                      </p>
                                      {v.clause && (
                                        <Badge variant="outline" className="text-xs">
                                          Clause {v.clause}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Recommendations */}
                          {testResult.recommendations && testResult.recommendations.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Recommendations:</p>
                              <ul className="space-y-1">
                                {testResult.recommendations.map((rec: string, i: number) => (
                                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <Info className="h-3 w-3 mt-1 flex-shrink-0 text-blue-500" />
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )}

            {hasChanges && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  You have unsaved changes. Save settings before testing to use the updated configuration.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Reference */}
        <Collapsible 
          open={expandedSections.includes("reference")} 
          onOpenChange={() => toggleSection("reference")}
        >
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" />
                      Quick Reference
                    </CardTitle>
                    <CardDescription>
                      Summary of key SANS 10142-1:2020 requirements
                    </CardDescription>
                  </div>
                  {expandedSections.includes("reference") ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
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
            </CollapsibleContent>
          </Card>
        </Collapsible>
          </TabsContent>

          <TabsContent value="sans-reference" className="mt-6">
            <SANSReferenceTab />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// Reusable validation toggle component
function ValidationToggle({
  label,
  description,
  checked,
  onCheckedChange,
  critical = false
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  critical?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 border rounded-lg transition-colors",
      checked ? "bg-background" : "bg-muted/30",
      critical && checked && "border-amber-500/50"
    )}>
      <div className="space-y-0.5 flex-1 mr-4">
        <div className="flex items-center gap-2">
          <Label className="font-medium cursor-pointer" onClick={() => onCheckedChange(!checked)}>
            {label}
          </Label>
          {critical && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
              Safety-Critical
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

// Reusable auto-fail toggle component
function AutoFailToggle({
  label,
  description,
  checked,
  onCheckedChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 border rounded-lg transition-colors",
      checked 
        ? "border-destructive/30 bg-destructive/5" 
        : "border-muted bg-muted/30"
    )}>
      <div className="space-y-0.5 flex-1 mr-4">
        <Label className="font-medium cursor-pointer" onClick={() => onCheckedChange(!checked)}>
          {label}
        </Label>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
