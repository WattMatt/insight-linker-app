import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, FileCheck, FileWarning, Clock, Link, ShieldCheck } from "lucide-react";

export const COCComplianceRulesReference = () => {
  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">COC Compliance Rules Reference</CardTitle>
        </div>
        <CardDescription>
          Official validation hierarchy for Electrical Certificates of Compliance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {/* Initial COC */}
          <AccordionItem value="initial">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-green-600" />
                <span className="font-medium">1. Initial COC Requirement</span>
                <Badge variant="outline" className="ml-2 text-xs">Baseline</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Every premises <strong className="text-foreground">MUST</strong> have a valid Initial COC issued</li>
                <li>Without an Initial COC, no Supplementary or Temporary COC can render the premises compliant</li>
                <li>The Initial COC establishes the <strong className="text-foreground">baseline compliance state</strong> for the installation</li>
              </ul>
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-xs">
                <strong>Check ID:</strong> COC-INIT-001
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Supplementary COC */}
          <AccordionItem value="supplementary">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-blue-600" />
                <span className="font-medium">2. Supplementary COC Rules</span>
                <Badge variant="outline" className="ml-2 text-xs">Extension</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <p className="text-muted-foreground">A Supplementary COC may only be valid if:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>The Initial COC exists and is valid</li>
                <li>The Supplementary COC <strong className="text-foreground">explicitly references</strong> the Initial COC number</li>
              </ul>
              <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded">
                <p className="text-xs flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                  <span>If no Initial COC number is listed, the Supplementary COC is <strong>INVALID</strong></span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Use for: Additions, alterations, or modifications to existing installations
              </p>
              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs">
                <strong>Check ID:</strong> COC-SUPP-001
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Temporary COC */}
          <AccordionItem value="temporary">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="font-medium">3. Temporary COC Rules</span>
                <Badge variant="outline" className="ml-2 text-xs">Provisional</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>May be issued for provisional compliance (e.g., pending remedial work)</li>
                <li><strong className="text-foreground">MUST</strong> reference the Initial COC number</li>
                <li>Expires after defined validity period (typically 3 months)</li>
                <li><strong className="text-foreground">CANNOT</strong> establish compliance alone</li>
              </ul>
              <div className="mt-2 p-2 bg-orange-50 dark:bg-orange-950/30 rounded text-xs">
                <strong>Check ID:</strong> COC-TEMP-001
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Non-Compliance Conditions */}
          <AccordionItem value="non-compliance">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-red-600" />
                <span className="font-medium">4. Non-Compliance Conditions</span>
                <Badge variant="destructive" className="ml-2 text-xs">Automatic FAIL</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <p className="text-muted-foreground">Premises are considered <strong className="text-red-600">NON-COMPLIANT</strong> if:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>A Supplementary or Temporary COC exists <strong className="text-foreground">WITHOUT</strong> a valid Initial COC</li>
                <li>A Supplementary or Temporary COC does <strong className="text-foreground">NOT</strong> list the Initial COC reference number</li>
                <li>The Initial COC has expired (&gt;2 years commercial, &gt;5 years domestic) or been revoked</li>
                <li>A Temporary COC has exceeded its validity period</li>
              </ul>
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs">
                <strong>Check ID:</strong> COC-VALID-001
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Validation Flow */}
          <AccordionItem value="validation-flow">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-purple-600" />
                <span className="font-medium">5. Compliance Validation Flow</span>
                <Badge variant="secondary" className="ml-2 text-xs">Process</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Identify COC Type</strong> → Initial / Supplementary / Temporary</li>
                <li><strong className="text-foreground">If Initial</strong> → Validate status (valid/expired/revoked)</li>
                <li><strong className="text-foreground">If Supplementary/Temporary</strong> → Confirm Initial COC reference number exists</li>
                <li><strong className="text-foreground">Validate Initial COC</strong> reference is legitimate and not expired</li>
                <li><strong className="text-foreground">Confirm validity period</strong> for Temporary COCs</li>
                <li><strong className="text-foreground">Confirm scope</strong> aligns with Initial COC baseline</li>
                <li><strong className="text-foreground">Return compliance status</strong> with clause-specific reasoning</li>
              </ol>
            </AccordionContent>
          </AccordionItem>

          {/* Traceability */}
          <AccordionItem value="traceability">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                <span className="font-medium">6. Traceability Requirements</span>
                <Badge variant="secondary" className="ml-2 text-xs">Audit</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <p className="text-muted-foreground">Each compliance decision <strong className="text-foreground">MUST</strong> cite:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>COC Type applied (Initial / Supplementary / Temporary)</li>
                <li>Referenced COC numbers (Initial + current)</li>
                <li>Clause references for each decision</li>
                <li>Compliance hierarchy validation result</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
