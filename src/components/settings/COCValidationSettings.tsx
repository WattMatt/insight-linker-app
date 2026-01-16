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
import { toast } from "sonner";
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  Settings2, 
  Database, 
  FileText,
  Info,
  RefreshCw,
  Save,
  RotateCcw
} from "lucide-react";

// Default validation thresholds based on SANS 10142-1:2020
const DEFAULT_THRESHOLDS = {
  // Earth Resistance (Clause 8.4)
  earthResistance: {
    tnSystem: 1.0,      // TN-S, TN-C-S: ≤ 1Ω
    ttSystemRcd30: 20,  // TT with RCD ≤30mA: ≤ 20Ω
    ttSystemRcd100: 100, // TT with RCD ≤100mA: ≤ 100Ω
    criticalThreshold: 5.0 // Auto-fail if > 5Ω
  },
  // Insulation Resistance (Clause 8.6)
  insulationResistance: {
    selvPelv: 0.5,     // SELV/PELV: ≥ 0.5MΩ
    upTo500v: 1.0,     // ≤ 500V: ≥ 1.0MΩ
    above500v: 1.0,    // > 500V: ≥ 1.0MΩ
    criticalThreshold: 0.25 // Auto-fail if < 0.25MΩ
  },
  // RCD Protection (Clause 8.8)
  rcdTripTimes: {
    at1xIdn: 300,      // 1× IΔn: ≤ 300ms
    at2xIdn: 150,      // 2× IΔn: ≤ 150ms
    at5xIdn: 40        // 5× IΔn: ≤ 40ms
  },
  // Earth Loop Impedance (Clause 8.5) - Type B MCB at 0.4s
  earthLoopImpedance: {
    mcb6A: 7.67,
    mcb10A: 4.60,
    mcb16A: 2.87,
    mcb20A: 2.30,
    mcb25A: 1.84,
    mcb32A: 1.44,
    mcb40A: 1.15,
    mcb50A: 0.92,
    mcb63A: 0.73
  }
};

// Default validation behavior settings
const DEFAULT_BEHAVIOR = {
  strictHierarchy: true,          // Require valid hierarchy for Supplementary/Temporary
  autoFailUnmarkedType: true,     // Auto-fail if COC type checkbox not marked
  requireInitialForSupp: true,    // Require Initial COC reference for Supplementary
  requireInitialForTemp: true,    // Require Initial COC reference for Temporary
  allowFutureDates: false,        // Allow future-dated certificates
  confidenceThreshold: 70,        // Minimum confidence score (0-100)
  documentQualityMin: "Fair",     // Minimum acceptable document quality
  autoApproveHighConfidence: false, // Auto-approve if confidence > 90%
  failOnMissingTests: true,       // Fail if critical tests are missing
  warnOnOldCertificates: true,    // Warn for certificates > 2 years
  oldCertificateThresholdDays: 730, // Days before warning (2 years)
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
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [behavior, setBehavior] = useState(DEFAULT_BEHAVIOR);
  const [aiModel, setAiModel] = useState("google/gemini-3-pro-preview");
  const [temperature, setTemperature] = useState(0.1);
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const thresholdsChanged = JSON.stringify(thresholds) !== JSON.stringify(DEFAULT_THRESHOLDS);
    const behaviorChanged = JSON.stringify(behavior) !== JSON.stringify(DEFAULT_BEHAVIOR);
    const modelChanged = aiModel !== "google/gemini-3-pro-preview";
    const tempChanged = temperature !== 0.1;
    setHasChanges(thresholdsChanged || behaviorChanged || modelChanged || tempChanged);
  }, [thresholds, behavior, aiModel, temperature]);

  const handleSave = () => {
    // In a real implementation, this would save to the database
    toast.success("COC validation settings saved", {
      description: "Changes will apply to future validations"
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    setBehavior(DEFAULT_BEHAVIOR);
    setAiModel("google/gemini-3-pro-preview");
    setTemperature(0.1);
    toast.info("Settings reset to SANS 10142-1:2020 defaults");
  };

  const updateThreshold = (category: string, key: string, value: number) => {
    setThresholds(prev => ({
      ...prev,
      [category]: {
        ...prev[category as keyof typeof prev],
        [key]: value
      }
    }));
  };

  const updateBehavior = (key: string, value: boolean | number | string) => {
    setBehavior(prev => ({
      ...prev,
      [key]: value
    }));
  };

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
          <Button onClick={handleSave} size="sm" disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

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
              <Select value={aiModel} onValueChange={setAiModel}>
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
              <Label>Temperature: {temperature}</Label>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
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

      {/* Validation Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Validation Behavior
          </CardTitle>
          <CardDescription>
            Configure how the validation engine handles different scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {/* COC Hierarchy */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Strict COC Hierarchy</Label>
                <p className="text-sm text-muted-foreground">
                  Require valid Initial COC for Supplementary/Temporary certificates
                </p>
              </div>
              <Switch
                checked={behavior.strictHierarchy}
                onCheckedChange={(v) => updateBehavior('strictHierarchy', v)}
              />
            </div>

            {/* Auto-fail unmarked type */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Fail on Unmarked Type</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically fail if COC type checkbox is not marked
                </p>
              </div>
              <Switch
                checked={behavior.autoFailUnmarkedType}
                onCheckedChange={(v) => updateBehavior('autoFailUnmarkedType', v)}
              />
            </div>

            {/* Require Initial for Supplementary */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Require Initial Reference for Supplementary</Label>
                <p className="text-sm text-muted-foreground">
                  Supplementary COC must reference an Initial COC number
                </p>
              </div>
              <Switch
                checked={behavior.requireInitialForSupp}
                onCheckedChange={(v) => updateBehavior('requireInitialForSupp', v)}
              />
            </div>

            {/* Allow future dates */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Allow Future-Dated Certificates</Label>
                <p className="text-sm text-muted-foreground">
                  Accept certificates with issue dates in the future
                </p>
              </div>
              <Switch
                checked={behavior.allowFutureDates}
                onCheckedChange={(v) => updateBehavior('allowFutureDates', v)}
              />
            </div>

            {/* Fail on missing tests */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Fail on Missing Critical Tests</Label>
                <p className="text-sm text-muted-foreground">
                  Fail validation if safety-critical test results are missing
                </p>
              </div>
              <Switch
                checked={behavior.failOnMissingTests}
                onCheckedChange={(v) => updateBehavior('failOnMissingTests', v)}
              />
            </div>

            {/* Warn on old certificates */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label className="font-medium">Warn on Old Certificates</Label>
                <p className="text-sm text-muted-foreground">
                  Show warning for certificates older than {behavior.oldCertificateThresholdDays} days
                </p>
              </div>
              <Switch
                checked={behavior.warnOnOldCertificates}
                onCheckedChange={(v) => updateBehavior('warnOnOldCertificates', v)}
              />
            </div>
          </div>

          <Separator />

          {/* Confidence threshold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Minimum Confidence Score: {behavior.confidenceThreshold}%</Label>
              <Badge variant={behavior.confidenceThreshold >= 80 ? "default" : behavior.confidenceThreshold >= 60 ? "secondary" : "destructive"}>
                {behavior.confidenceThreshold >= 80 ? "High" : behavior.confidenceThreshold >= 60 ? "Medium" : "Low"}
              </Badge>
            </div>
            <Slider
              value={[behavior.confidenceThreshold]}
              onValueChange={([v]) => updateBehavior('confidenceThreshold', v)}
              min={0}
              max={100}
              step={5}
            />
            <p className="text-xs text-muted-foreground">
              Validations below this threshold will be flagged for manual review
            </p>
          </div>

          {/* Document quality */}
          <div className="space-y-2">
            <Label>Minimum Document Quality</Label>
            <Select 
              value={behavior.documentQualityMin} 
              onValueChange={(v) => updateBehavior('documentQualityMin', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Excellent">Excellent (Strictest)</SelectItem>
                <SelectItem value="Good">Good</SelectItem>
                <SelectItem value="Fair">Fair (Recommended)</SelectItem>
                <SelectItem value="Poor">Poor (Most lenient)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Technical Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" />
            Technical Thresholds (SANS 10142-1:2020)
          </CardTitle>
          <CardDescription>
            Adjust validation thresholds for electrical tests. Default values are from SANS 10142-1:2020.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {/* Earth Resistance */}
            <AccordionItem value="earth-resistance">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">EARTH-001</Badge>
                  Earth Resistance (Clause 8.4)
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>TN-S/TN-C-S System (Ω)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={thresholds.earthResistance.tnSystem}
                      onChange={(e) => updateThreshold('earthResistance', 'tnSystem', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 1.0Ω</p>
                  </div>
                  <div className="space-y-2">
                    <Label>TT System with RCD ≤30mA (Ω)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={thresholds.earthResistance.ttSystemRcd30}
                      onChange={(e) => updateThreshold('earthResistance', 'ttSystemRcd30', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 20Ω</p>
                  </div>
                  <div className="space-y-2">
                    <Label>TT System with RCD ≤100mA (Ω)</Label>
                    <Input
                      type="number"
                      step="1"
                      value={thresholds.earthResistance.ttSystemRcd100}
                      onChange={(e) => updateThreshold('earthResistance', 'ttSystemRcd100', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 100Ω</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Critical Threshold - Auto Fail (Ω)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={thresholds.earthResistance.criticalThreshold}
                      onChange={(e) => updateThreshold('earthResistance', 'criticalThreshold', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Any reading above this auto-fails</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Insulation Resistance */}
            <AccordionItem value="insulation-resistance">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">INSUL-001</Badge>
                  Insulation Resistance (Clause 8.6)
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>SELV/PELV Circuits (MΩ)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={thresholds.insulationResistance.selvPelv}
                      onChange={(e) => updateThreshold('insulationResistance', 'selvPelv', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≥ 0.5MΩ</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Circuits ≤500V (MΩ)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={thresholds.insulationResistance.upTo500v}
                      onChange={(e) => updateThreshold('insulationResistance', 'upTo500v', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≥ 1.0MΩ</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Circuits &gt;500V (MΩ)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={thresholds.insulationResistance.above500v}
                      onChange={(e) => updateThreshold('insulationResistance', 'above500v', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≥ 1.0MΩ</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Critical Threshold - Auto Fail (MΩ)</Label>
                    <Input
                      type="number"
                      step="0.05"
                      value={thresholds.insulationResistance.criticalThreshold}
                      onChange={(e) => updateThreshold('insulationResistance', 'criticalThreshold', parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">Any reading below this auto-fails</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* RCD Trip Times */}
            <AccordionItem value="rcd-protection">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">RCD-001</Badge>
                  RCD Protection (Clause 8.8)
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>At 1× IΔn (ms)</Label>
                    <Input
                      type="number"
                      step="10"
                      value={thresholds.rcdTripTimes.at1xIdn}
                      onChange={(e) => updateThreshold('rcdTripTimes', 'at1xIdn', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 300ms</p>
                  </div>
                  <div className="space-y-2">
                    <Label>At 2× IΔn (ms)</Label>
                    <Input
                      type="number"
                      step="10"
                      value={thresholds.rcdTripTimes.at2xIdn}
                      onChange={(e) => updateThreshold('rcdTripTimes', 'at2xIdn', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 150ms</p>
                  </div>
                  <div className="space-y-2">
                    <Label>At 5× IΔn (ms)</Label>
                    <Input
                      type="number"
                      step="5"
                      value={thresholds.rcdTripTimes.at5xIdn}
                      onChange={(e) => updateThreshold('rcdTripTimes', 'at5xIdn', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">SANS default: ≤ 40ms</p>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Earth Loop Impedance */}
            <AccordionItem value="earth-loop">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">LOOP-001</Badge>
                  Earth Loop Impedance (Clause 8.5)
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="p-3 bg-muted/50 rounded-lg mb-4">
                  <p className="text-sm text-muted-foreground">
                    Maximum Zs values for Type B MCB at 0.4s disconnection time. 
                    Type C: multiply by 0.5, Type D: multiply by 0.25
                  </p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(thresholds.earthLoopImpedance).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <Label>{key.replace('mcb', 'MCB ')} (Ω)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={(e) => updateThreshold('earthLoopImpedance', key, parseFloat(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
                <li>• Earth resistance &gt; 5Ω</li>
                <li>• Insulation resistance &lt; 0.25MΩ</li>
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
