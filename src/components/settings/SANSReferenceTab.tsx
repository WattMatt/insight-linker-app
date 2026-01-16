import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Shield, 
  Zap, 
  AlertTriangle, 
  CheckCircle2, 
  FileText,
  Info,
  BookOpen,
  Scale,
  Wrench,
  Users,
  ClipboardCheck,
  Clock,
  AlertCircle,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";

// SANS 10142-1:2020 Reference Data
const CLAUSE_REFERENCES = {
  mandatory: [
    { clause: "8.4.3.2", name: "Insulation Resistance Test", description: "Minimum insulation resistance between live conductors and earth", criteria: "≥ 0.25 MΩ (250V test voltage for SELV, ≥ 1MΩ for other circuits)", category: "Testing" },
    { clause: "8.4.3.3", name: "Earth Continuity Test", description: "Continuity of protective conductors including main and supplementary bonding", criteria: "≤ 5Ω (typically < 1Ω for good installations)", category: "Testing" },
    { clause: "8.4.3.4", name: "Earth Fault Loop Impedance", description: "Verification that protective devices will operate within required time", criteria: "Zs ≤ Zs(max) for circuit protective device", category: "Testing" },
    { clause: "8.4.3.5", name: "RCD Functional Test", description: "Verification of RCD operation at rated residual current", criteria: "Trip time ≤ 300ms at IΔn, ≤ 40ms at 5×IΔn", category: "Testing" },
    { clause: "8.4.3.6", name: "Polarity Test", description: "Verification of correct polarity of all circuits", criteria: "All switching devices in phase conductors only", category: "Testing" },
    { clause: "6.1", name: "Certificate Requirements", description: "Valid COC must be issued for all new installations and alterations", criteria: "Signed by registered person", category: "Administrative" },
    { clause: "6.2", name: "COC Hierarchy", description: "Supplementary/Temporary COCs must reference Initial COC", criteria: "Initial COC number must be present", category: "Administrative" },
  ],
  safety_critical: [
    { clause: "5.1.4", name: "Earth Electrode Resistance", description: "Earth electrode resistance for TT systems", criteria: "RA × IΔn ≤ 50V (or 25V in special locations)", category: "Earthing" },
    { clause: "5.2.3", name: "Protective Conductor Sizing", description: "Minimum cross-sectional area of protective conductors", criteria: "Based on phase conductor size per Table 5.1", category: "Conductors" },
    { clause: "5.3.1", name: "Fault Current Protection", description: "Protection against fault currents", criteria: "I²t ≤ k²S² for protective conductors", category: "Protection" },
    { clause: "4.4.1", name: "Protection Against Electric Shock", description: "Basic and fault protection measures", criteria: "Both basic and fault protection required", category: "Safety" },
  ],
  additional: [
    { clause: "7.1", name: "Marking Requirements", description: "Identification of conductors and equipment", criteria: "Standard color coding and labeling", category: "Documentation" },
    { clause: "7.2", name: "Warning Notices", description: "Required warning and information notices", criteria: "At distribution boards and isolation points", category: "Documentation" },
    { clause: "8.1", name: "Initial Verification", description: "Visual inspection before testing", criteria: "Check for damage, correct installation", category: "Verification" },
    { clause: "8.2", name: "Periodic Verification", description: "Ongoing verification requirements", criteria: "Based on installation type and use", category: "Verification" },
  ]
};

const COC_TYPES = [
  {
    type: "Initial",
    description: "Issued for new electrical installations",
    requirements: [
      "Complete installation inspection and testing",
      "All mandatory tests must pass",
      "Registered electrician signature",
      "Owner/occupant acknowledgment"
    ],
    validity: "Required for all new premises"
  },
  {
    type: "Supplementary",
    description: "Issued for alterations or additions to existing installations",
    requirements: [
      "Must reference the Initial COC number",
      "Testing of altered/added circuits only",
      "Confirmation of compatibility with existing installation",
      "Registered electrician signature"
    ],
    validity: "Linked to Initial COC"
  },
  {
    type: "Temporary",
    description: "Issued for temporary installations (events, construction)",
    requirements: [
      "Limited validity period (max 3 months typical)",
      "Full testing of temporary installation",
      "Clear scope definition",
      "Must be replaced or removed after event"
    ],
    validity: "Time-limited (typically 1-3 months)"
  }
];

const TEST_INSTRUMENTS = [
  { test: "Insulation Resistance", instrument: "Insulation Resistance Tester", voltage: "250V, 500V, or 1000V DC", accuracy: "±5%" },
  { test: "Earth Continuity", instrument: "Low Resistance Ohmmeter", voltage: "4-24V AC/DC", accuracy: "±2%" },
  { test: "Earth Fault Loop", instrument: "Loop Impedance Tester", voltage: "Mains voltage", accuracy: "±5%" },
  { test: "RCD", instrument: "RCD Tester", voltage: "Mains voltage", accuracy: "Trip time ±2ms" },
  { test: "Polarity", instrument: "Multimeter/Voltage Tester", voltage: "N/A", accuracy: "±1%" },
];

const EXPIRY_GUIDELINES = [
  { type: "Domestic (owned)", period: "5 years recommended", requirement: "Upon sale/transfer" },
  { type: "Domestic (rental)", period: "2 years", requirement: "Mandatory per regulations" },
  { type: "Commercial", period: "2 years", requirement: "Mandatory per regulations" },
  { type: "Industrial", period: "1-2 years", requirement: "Based on risk assessment" },
  { type: "High-risk environments", period: "6-12 months", requirement: "As per OHS requirements" },
];

interface SANSReferenceTabProps {
  className?: string;
}

export function SANSReferenceTab({ className }: SANSReferenceTabProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            SANS 10142-1:2020 Reference
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Comprehensive reference for South African electrical installation standards
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Edition 3.1 (2020)
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <ClipboardCheck className="h-4 w-4" />
            Mandatory Checks
          </div>
          <div className="text-2xl font-bold">{CLAUSE_REFERENCES.mandatory.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4" />
            Safety-Critical
          </div>
          <div className="text-2xl font-bold">{CLAUSE_REFERENCES.safety_critical.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <FileText className="h-4 w-4" />
            COC Types
          </div>
          <div className="text-2xl font-bold">{COC_TYPES.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Wrench className="h-4 w-4" />
            Test Methods
          </div>
          <div className="text-2xl font-bold">{TEST_INSTRUMENTS.length}</div>
        </Card>
      </div>

      {/* Clause Reference Sections */}
      <Accordion type="multiple" defaultValue={["mandatory"]} className="space-y-4">
        {/* Mandatory Checks */}
        <AccordionItem value="mandatory" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-semibold">Mandatory Verification Checks</span>
              <Badge className="ml-2">{CLAUSE_REFERENCES.mandatory.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              These checks are required for all COC validations. Failure in any of these checks may result in certificate rejection.
            </p>
            <div className="space-y-3">
              {CLAUSE_REFERENCES.mandatory.map((clause) => (
                <ClauseCard key={clause.clause} clause={clause} type="mandatory" />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Safety-Critical Checks */}
        <AccordionItem value="safety" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-semibold">Safety-Critical Requirements</span>
              <Badge variant="destructive" className="ml-2">{CLAUSE_REFERENCES.safety_critical.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Safety-critical failures result in automatic COC rejection and require immediate remediation before re-testing.
            </p>
            <div className="space-y-3">
              {CLAUSE_REFERENCES.safety_critical.map((clause) => (
                <ClauseCard key={clause.clause} clause={clause} type="safety" />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Additional Checks */}
        <AccordionItem value="additional" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Additional Verification Requirements</span>
              <Badge variant="secondary" className="ml-2">{CLAUSE_REFERENCES.additional.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Additional checks that support comprehensive compliance verification.
            </p>
            <div className="space-y-3">
              {CLAUSE_REFERENCES.additional.map((clause) => (
                <ClauseCard key={clause.clause} clause={clause} type="additional" />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* COC Types */}
        <AccordionItem value="coc-types" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              <span className="font-semibold">COC Types & Hierarchy</span>
              <Badge variant="outline" className="ml-2">{COC_TYPES.length} types</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Understanding the COC hierarchy is essential for proper validation. Each type has specific requirements and relationships.
            </p>
            <div className="grid gap-4">
              {COC_TYPES.map((coc) => (
                <COCTypeCard key={coc.type} coc={coc} />
              ))}
            </div>
            <Separator className="my-4" />
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <Info className="h-4 w-4 text-blue-500" />
                Hierarchy Rules
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Every premises must have an Initial COC before any Supplementary COCs can be issued</li>
                <li>• Supplementary COCs must always reference the Initial COC number</li>
                <li>• Temporary COCs have a maximum validity period and cannot be renewed indefinitely</li>
                <li>• Multiple Supplementary COCs can reference the same Initial COC</li>
              </ul>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Test Instruments */}
        <AccordionItem value="instruments" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-amber-500" />
              <span className="font-semibold">Test Instruments & Methods</span>
              <Badge variant="outline" className="ml-2">{TEST_INSTRUMENTS.length} tests</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Approved test instruments and their specifications for SANS 10142-1:2020 compliance testing.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test</TableHead>
                    <TableHead>Instrument</TableHead>
                    <TableHead>Test Voltage</TableHead>
                    <TableHead>Accuracy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TEST_INSTRUMENTS.map((item) => (
                    <TableRow key={item.test}>
                      <TableCell className="font-medium">{item.test}</TableCell>
                      <TableCell>{item.instrument}</TableCell>
                      <TableCell>{item.voltage}</TableCell>
                      <TableCell>{item.accuracy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                All test instruments must be calibrated according to manufacturer specifications and traceable to national standards.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Expiry Guidelines */}
        <AccordionItem value="expiry" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-green-500" />
              <span className="font-semibold">COC Validity & Expiry Guidelines</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Recommended and mandatory re-inspection periods for different installation types.
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Installation Type</TableHead>
                    <TableHead>Recommended Period</TableHead>
                    <TableHead>Requirement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {EXPIRY_GUIDELINES.map((item) => (
                    <TableRow key={item.type}>
                      <TableCell className="font-medium">{item.type}</TableCell>
                      <TableCell>{item.period}</TableCell>
                      <TableCell>{item.requirement}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Red Flags */}
        <AccordionItem value="red-flags" className="border rounded-lg border-destructive/30">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-semibold">Automatic Failure Conditions (Red Flags)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              The following conditions result in automatic COC rejection regardless of other test results:
            </p>
            <div className="grid gap-3">
              <RedFlagItem 
                title="Earth Resistance Exceeds Threshold" 
                description="Earth continuity resistance greater than 5Ω indicates serious safety risk"
                clause="8.4.3.3"
              />
              <RedFlagItem 
                title="Insulation Resistance Below Minimum" 
                description="Insulation resistance less than 0.25MΩ indicates deteriorated insulation"
                clause="8.4.3.2"
              />
              <RedFlagItem 
                title="RCD Fails to Trip" 
                description="RCD not tripping at rated current or exceeding maximum trip time"
                clause="8.4.3.5"
              />
              <RedFlagItem 
                title="Missing Signatures" 
                description="Certificate lacking required installer or owner/occupant signatures"
                clause="6.1"
              />
              <RedFlagItem 
                title="Invalid Registration" 
                description="Installer not registered with DoEL or registration expired"
                clause="6.1"
              />
              <RedFlagItem 
                title="Future-Dated Certificate" 
                description="Certificate issue date in the future indicating potential fraud"
                clause="6.1"
              />
              <RedFlagItem 
                title="Missing Initial COC Reference" 
                description="Supplementary/Temporary COC without reference to Initial COC"
                clause="6.2"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Footer Reference */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium mb-1">Official Reference</h4>
              <p className="text-sm text-muted-foreground">
                This reference is based on SANS 10142-1:2020 Edition 3.1 "The wiring of premises - Part 1: Low-voltage installations". 
                For complete and authoritative information, consult the official SABS standards document.
              </p>
              <a 
                href="https://www.sabs.co.za" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1 mt-2"
              >
                Visit SABS <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Clause Card Component
function ClauseCard({ 
  clause, 
  type 
}: { 
  clause: { clause: string; name: string; description: string; criteria: string; category: string }; 
  type: "mandatory" | "safety" | "additional" 
}) {
  return (
    <div className={cn(
      "p-4 border rounded-lg",
      type === "mandatory" && "bg-primary/5 border-primary/20",
      type === "safety" && "bg-destructive/5 border-destructive/20",
      type === "additional" && "bg-muted/50"
    )}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">
              Clause {clause.clause}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {clause.category}
            </Badge>
          </div>
          <h4 className="font-medium">{clause.name}</h4>
          <p className="text-sm text-muted-foreground">{clause.description}</p>
          <div className="mt-2 pt-2 border-t">
            <p className="text-sm">
              <span className="font-medium">Criteria: </span>
              <span className="text-muted-foreground">{clause.criteria}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// COC Type Card Component
function COCTypeCard({ 
  coc 
}: { 
  coc: { type: string; description: string; requirements: string[]; validity: string } 
}) {
  const getTypeColor = (type: string) => {
    switch (type) {
      case "Initial": return "text-green-500 bg-green-500/10 border-green-500/20";
      case "Supplementary": return "text-blue-500 bg-blue-500/10 border-blue-500/20";
      case "Temporary": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default: return "bg-muted";
    }
  };

  return (
    <div className={cn("p-4 border rounded-lg", getTypeColor(coc.type))}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h4 className="font-semibold text-lg">{coc.type} COC</h4>
          <p className="text-sm text-muted-foreground">{coc.description}</p>
        </div>
        <Badge variant="outline">{coc.validity}</Badge>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Requirements:</p>
        <ul className="text-sm text-muted-foreground space-y-1">
          {coc.requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 mt-1 flex-shrink-0" />
              {req}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Red Flag Item Component
function RedFlagItem({ 
  title, 
  description, 
  clause 
}: { 
  title: string; 
  description: string; 
  clause: string 
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
      <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="font-medium">{title}</h4>
          <Badge variant="outline" className="font-mono text-xs">
            Clause {clause}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
    </div>
  );
}
