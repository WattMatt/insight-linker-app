import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  BookOpen, 
  Shield, 
  FileJson, 
  TestTube, 
  ChevronDown, 
  Copy, 
  Check,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info
} from "lucide-react";
import { toast } from "sonner";

const SANS_CHECKS = {
  safetyCritical: [
    { id: "EARTH-001", clause: "7.4", description: "Earth electrode resistance", threshold: "≤ 1Ω (TN-S), ≤ 10Ω (TT)" },
    { id: "INSUL-001", clause: "8.6.2", description: "Insulation resistance", threshold: "≥ 0.5MΩ @ 500V DC" },
    { id: "LOOP-001", clause: "8.6.3", description: "Earth loop impedance", threshold: "Zs ≤ Zs(max) for MCB rating" },
    { id: "RCD-001", clause: "8.8", description: "RCD trip time", threshold: "≤ 300ms @ IΔn, ≤ 40ms @ 5×IΔn" },
    { id: "POLAR-001", clause: "8.5", description: "Polarity verification", threshold: "Correct L-N-E termination" },
    { id: "CONT-001", clause: "8.6.1", description: "Continuity of protective conductors", threshold: "≤ 1Ω end-to-end" },
  ],
  hierarchy: [
    { id: "HIER-001", description: "Main incomer COC required for installation", rule: "Main COC must exist before sub-distribution" },
    { id: "HIER-002", description: "Sub-distribution linked to main", rule: "Sub-distribution COC references parent COC" },
    { id: "HIER-003", description: "Final circuit coverage", rule: "All final circuits must be covered by valid COC" },
  ],
  administrative: [
    { id: "ADMIN-001", description: "Registered person details", requirement: "Valid registration number, name, signature" },
    { id: "ADMIN-002", description: "Certificate validity", requirement: "Issue date within 5 years" },
    { id: "ADMIN-003", description: "Property identification", requirement: "Complete address, ERF number if applicable" },
  ]
};

const ZS_MAX_TABLE = [
  { mcb: "6A", typeB: "7.67Ω", typeC: "3.83Ω", typeD: "1.92Ω" },
  { mcb: "10A", typeB: "4.60Ω", typeC: "2.30Ω", typeD: "1.15Ω" },
  { mcb: "16A", typeB: "2.87Ω", typeC: "1.44Ω", typeD: "0.72Ω" },
  { mcb: "20A", typeB: "2.30Ω", typeC: "1.15Ω", typeD: "0.57Ω" },
  { mcb: "25A", typeB: "1.84Ω", typeC: "0.92Ω", typeD: "0.46Ω" },
  { mcb: "32A", typeB: "1.44Ω", typeC: "0.72Ω", typeD: "0.36Ω" },
  { mcb: "40A", typeB: "1.15Ω", typeC: "0.57Ω", typeD: "0.29Ω" },
  { mcb: "63A", typeB: "0.73Ω", typeC: "0.36Ω", typeD: "0.18Ω" },
];

const SAMPLE_INPUT = `{
  "cocNumber": "COC-2024-001234",
  "cocType": "ECA",
  "installationType": "New Installation",
  "premise": {
    "address": "123 Main Street, Sandton",
    "erfNumber": "ERF 1234",
    "supplyType": "LV",
    "voltage": "230V",
    "phases": 3
  },
  "testResults": {
    "earthResistance": { "value": 0.8, "unit": "Ω" },
    "insulationResistance": { "value": 150, "unit": "MΩ" },
    "earthLoopImpedance": { "value": 0.45, "unit": "Ω" },
    "rcdTripTime": { "value": 28, "unit": "ms" },
    "polarityCorrect": true,
    "continuity": { "value": 0.3, "unit": "Ω" }
  }
}`;

const SAMPLE_OUTPUT_PASS = `{
  "status": "PASS",
  "overallCompliance": true,
  "confidence": 0.95,
  "checks": [
    {
      "id": "EARTH-001",
      "status": "PASS",
      "measured": "0.8Ω",
      "threshold": "≤ 1Ω",
      "clause": "7.4"
    },
    {
      "id": "INSUL-001", 
      "status": "PASS",
      "measured": "150MΩ",
      "threshold": "≥ 0.5MΩ",
      "clause": "8.6.2"
    }
  ],
  "recommendations": [],
  "validatedAt": "2024-01-15T10:30:00Z"
}`;

const SAMPLE_OUTPUT_FAIL = `{
  "status": "FAIL",
  "overallCompliance": false,
  "confidence": 0.92,
  "checks": [
    {
      "id": "RCD-001",
      "status": "FAIL",
      "measured": "450ms",
      "threshold": "≤ 300ms",
      "clause": "8.8",
      "severity": "critical",
      "remediation": "RCD trip time exceeds maximum. Replace or repair RCD device."
    }
  ],
  "criticalFailures": ["RCD-001"],
  "recommendations": [
    "Immediate attention required for RCD protection",
    "Do not energize installation until rectified"
  ]
}`;

interface CodeBlockProps {
  code: string;
  title: string;
}

const CodeBlock = ({ code, title }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between bg-muted px-4 py-2 rounded-t-lg border border-b-0">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <pre className="bg-muted/50 p-4 rounded-b-lg border overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const COCDocumentationViewer = () => {
  const [openSections, setOpenSections] = useState<string[]>(["safety-critical"]);

  const toggleSection = (section: string) => {
    setOpenSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  return (
    <Tabs defaultValue="overview" className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-6">
        <TabsTrigger value="overview" className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </TabsTrigger>
        <TabsTrigger value="sans" className="flex items-center gap-2">
          <Shield className="h-4 w-4" />
          <span className="hidden sm:inline">SANS 10142-1</span>
        </TabsTrigger>
        <TabsTrigger value="schemas" className="flex items-center gap-2">
          <FileJson className="h-4 w-4" />
          <span className="hidden sm:inline">Schemas</span>
        </TabsTrigger>
        <TabsTrigger value="examples" className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          <span className="hidden sm:inline">Examples</span>
        </TabsTrigger>
        <TabsTrigger value="testing" className="flex items-center gap-2">
          <TestTube className="h-4 w-4" />
          <span className="hidden sm:inline">Testing</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>COC Verification Engine</CardTitle>
              <CardDescription>
                AI-powered validation of Electrical Certificates of Compliance against SANS 10142-1:2020
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    Key Features
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• PDF vision analysis for data extraction</li>
                    <li>• SANS 10142-1:2020 compliance validation</li>
                    <li>• COC hierarchy verification</li>
                    <li>• Automated safety-critical checks</li>
                    <li>• Detailed remediation guidance</li>
                  </ul>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-blue-600" />
                    Supported Documents
                  </h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• PDF certificates (scanned or digital)</li>
                    <li>• Image files (JPG, PNG)</li>
                    <li>• Text-based test reports</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Validation Flow</h4>
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Badge variant="outline">Upload COC</Badge>
                  <span>→</span>
                  <Badge variant="outline">AI Extraction</Badge>
                  <span>→</span>
                  <Badge variant="outline">SANS Validation</Badge>
                  <span>→</span>
                  <Badge variant="outline">Report Generation</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status Definitions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-green-50 dark:bg-green-950/20">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-medium">PASS</p>
                    <p className="text-sm text-muted-foreground">All checks compliant</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-red-50 dark:bg-red-950/20">
                  <XCircle className="h-6 w-6 text-red-600" />
                  <div>
                    <p className="font-medium">FAIL</p>
                    <p className="text-sm text-muted-foreground">Critical violations found</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                  <div>
                    <p className="font-medium">INCOMPLETE</p>
                    <p className="text-sm text-muted-foreground">Missing required data</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="sans">
        <ScrollArea className="h-[600px] pr-4">
          <div className="space-y-4">
            <Collapsible 
              open={openSections.includes("safety-critical")}
              onOpenChange={() => toggleSection("safety-critical")}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Shield className="h-5 w-5 text-red-600" />
                          Safety-Critical Checks
                        </CardTitle>
                        <CardDescription>Mandatory tests per SANS 10142-1:2020</CardDescription>
                      </div>
                      <ChevronDown className={`h-5 w-5 transition-transform ${openSections.includes("safety-critical") ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">Check ID</th>
                            <th className="text-left py-2 px-3 font-medium">Clause</th>
                            <th className="text-left py-2 px-3 font-medium">Description</th>
                            <th className="text-left py-2 px-3 font-medium">Threshold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SANS_CHECKS.safetyCritical.map((check) => (
                            <tr key={check.id} className="border-b last:border-0">
                              <td className="py-2 px-3"><Badge variant="outline">{check.id}</Badge></td>
                              <td className="py-2 px-3">{check.clause}</td>
                              <td className="py-2 px-3">{check.description}</td>
                              <td className="py-2 px-3 font-mono text-xs">{check.threshold}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible 
              open={openSections.includes("zs-table")}
              onOpenChange={() => toggleSection("zs-table")}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Zs Maximum Values</CardTitle>
                        <CardDescription>Earth loop impedance limits by MCB rating</CardDescription>
                      </div>
                      <ChevronDown className={`h-5 w-5 transition-transform ${openSections.includes("zs-table") ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3 font-medium">MCB Rating</th>
                            <th className="text-left py-2 px-3 font-medium">Type B</th>
                            <th className="text-left py-2 px-3 font-medium">Type C</th>
                            <th className="text-left py-2 px-3 font-medium">Type D</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ZS_MAX_TABLE.map((row) => (
                            <tr key={row.mcb} className="border-b last:border-0">
                              <td className="py-2 px-3 font-medium">{row.mcb}</td>
                              <td className="py-2 px-3 font-mono">{row.typeB}</td>
                              <td className="py-2 px-3 font-mono">{row.typeC}</td>
                              <td className="py-2 px-3 font-mono">{row.typeD}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible 
              open={openSections.includes("hierarchy")}
              onOpenChange={() => toggleSection("hierarchy")}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">COC Hierarchy Rules</CardTitle>
                        <CardDescription>Certificate chain validation requirements</CardDescription>
                      </div>
                      <ChevronDown className={`h-5 w-5 transition-transform ${openSections.includes("hierarchy") ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-3">
                      {SANS_CHECKS.hierarchy.map((rule) => (
                        <div key={rule.id} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary">{rule.id}</Badge>
                            <span className="font-medium">{rule.description}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{rule.rule}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            <Collapsible 
              open={openSections.includes("administrative")}
              onOpenChange={() => toggleSection("administrative")}
            >
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Administrative Checks</CardTitle>
                        <CardDescription>Documentation and certification requirements</CardDescription>
                      </div>
                      <ChevronDown className={`h-5 w-5 transition-transform ${openSections.includes("administrative") ? "rotate-180" : ""}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="space-y-3">
                      {SANS_CHECKS.administrative.map((check) => (
                        <div key={check.id} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">{check.id}</Badge>
                            <span className="font-medium">{check.description}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{check.requirement}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="schemas">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Input Schema</CardTitle>
              <CardDescription>JSON structure for COC validation requests</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={SAMPLE_INPUT} title="coc-input.json" />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="examples">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Passing Validation Response
              </CardTitle>
              <CardDescription>Example output when all checks pass</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={SAMPLE_OUTPUT_PASS} title="validation-pass.json" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                Failing Validation Response
              </CardTitle>
              <CardDescription>Example output with critical failures</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock code={SAMPLE_OUTPUT_FAIL} title="validation-fail.json" />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="testing">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Scenarios</CardTitle>
              <CardDescription>Standard test cases for validation engine</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 text-green-600">✓ Complete Pass</h4>
                    <p className="text-sm text-muted-foreground">All safety-critical and administrative checks pass with valid measurements within thresholds.</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 text-red-600">✗ Critical Safety Failure</h4>
                    <p className="text-sm text-muted-foreground">One or more safety-critical measurements exceed thresholds (e.g., RCD trip time &gt; 300ms).</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 text-yellow-600">⚠ Hierarchy Violation</h4>
                    <p className="text-sm text-muted-foreground">Sub-distribution COC exists without valid main incomer COC.</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2 text-orange-600">⚡ Expired Certificate</h4>
                    <p className="text-sm text-muted-foreground">COC issue date exceeds 5-year validity period.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Coverage Requirements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span>Safety-Critical Tests</span>
                  <Badge>100% Required</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span>Hierarchy Tests</span>
                  <Badge variant="secondary">95% Required</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span>Administrative Tests</span>
                  <Badge variant="secondary">90% Required</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span>Edge Cases</span>
                  <Badge variant="outline">60% Required</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
};
