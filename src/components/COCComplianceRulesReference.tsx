// Rules defined in docs/COC_VALIDATION_SPEC.md
// Runtime logic in supabase/functions/validate-coc/index.ts
// Prompt in supabase/functions/validate-coc/prompt.ts
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, FileCheck, FileWarning, Clock, Link, ShieldCheck, ListChecks } from "lucide-react";

export const COCComplianceRulesReference = () => {
  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">COC Compliance Validation Engine</CardTitle>
        </div>
        <CardDescription>
          Rule hierarchy for evaluating premises compliance based on Electrical Certificates of Compliance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full" defaultValue="initial">
          {/* Initial COC */}
          <AccordionItem value="initial">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-green-600" />
                <span className="font-medium">1. Initial COC Requirement</span>
                <Badge variant="outline" className="ml-2 text-xs bg-green-50 text-green-700 border-green-200">
                  Baseline
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>
                  Every premises <strong className="text-foreground">must have a valid Initial COC issued</strong>
                </li>
                <li>
                  Without an Initial COC,{" "}
                  <strong className="text-foreground">
                    no Supplementary or Temporary COC can render the premises compliant
                  </strong>
                </li>
                <li>
                  The Initial COC establishes the <strong className="text-foreground">baseline compliance state</strong>
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Supplementary COC */}
          <AccordionItem value="supplementary">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-blue-600" />
                <span className="font-medium">2. Supplementary COC Rules</span>
                <Badge variant="outline" className="ml-2 text-xs bg-blue-50 text-blue-700 border-blue-200">
                  Extension
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-3 pl-6">
              <p className="text-muted-foreground">A Supplementary COC may only be valid if:</p>
              <ul className="list-[lower-alpha] list-inside space-y-1 text-muted-foreground ml-2">
                <li>The Initial COC exists and is valid</li>
                <li>
                  The Supplementary COC{" "}
                  <strong className="text-foreground">explicitly references the Initial COC number</strong>
                </li>
              </ul>
              <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200">
                <p className="text-xs flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-600" />
                  <span>
                    If no Initial COC number is listed, the Supplementary COC is{" "}
                    <strong className="text-red-600">invalid</strong>
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Supplementary COCs extend or modify compliance but cannot replace the Initial COC.
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Temporary COC */}
          <AccordionItem value="temporary">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="font-medium">3. Temporary COC Rules</span>
                <Badge variant="outline" className="ml-2 text-xs bg-orange-50 text-orange-700 border-orange-200">
                  Provisional
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-2 pl-6">
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>
                  A Temporary COC may be issued for <strong className="text-foreground">provisional compliance</strong>{" "}
                  (e.g., pending remedial work)
                </li>
                <li>
                  Temporary COCs <strong className="text-foreground">must also reference the Initial COC number</strong>
                </li>
                <li>
                  Temporary COCs <strong className="text-foreground">expire after their defined validity period</strong>{" "}
                  and cannot establish compliance alone
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Non-Compliance Conditions */}
          <AccordionItem value="non-compliance">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-red-600" />
                <span className="font-medium">4. Non-Compliance Conditions</span>
                <Badge variant="destructive" className="ml-2 text-xs">
                  Automatic FAIL
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-3 pl-6">
              <p className="text-muted-foreground">
                Premises are considered <strong className="text-red-600">NON-COMPLIANT</strong> if:
              </p>
              <ul className="list-[lower-alpha] list-inside space-y-1 text-muted-foreground ml-2">
                <li>
                  A Supplementary or Temporary COC exists{" "}
                  <strong className="text-foreground">without a valid Initial COC</strong>
                </li>
                <li>
                  A Supplementary or Temporary COC{" "}
                  <strong className="text-foreground">does not list the Initial COC number</strong>
                </li>
                <li>
                  The Initial COC has <strong className="text-foreground">expired or been revoked</strong>
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* Validation Flow */}
          <AccordionItem value="validation-flow">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-purple-600" />
                <span className="font-medium">5. Compliance Validation Flow</span>
                <Badge variant="secondary" className="ml-2 text-xs">
                  Process
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-3 pl-6">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs min-w-[60px] justify-center">
                    Step 1
                  </Badge>
                  <span className="text-muted-foreground">
                    Check for Initial COC → If absent → <strong className="text-red-600">Non-compliant</strong>
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs min-w-[60px] justify-center">
                    Step 2
                  </Badge>
                  <span className="text-muted-foreground">Validate Initial COC status (valid/expired/revoked)</span>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs min-w-[60px] justify-center">
                    Step 3
                  </Badge>
                  <div className="text-muted-foreground">
                    For each Supplementary/Temporary COC:
                    <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                      <li>Confirm Initial COC reference number</li>
                      <li>Confirm validity period</li>
                      <li>Confirm scope aligns with Initial COC baseline</li>
                    </ul>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="text-xs min-w-[60px] justify-center">
                    Step 4
                  </Badge>
                  <div className="text-muted-foreground">
                    Return compliance status:
                    <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                      <li>
                        <strong className="text-green-600">"Compliant"</strong> if Initial COC is valid and all
                        Supplementary/Temporary COCs meet reference + validity rules
                      </li>
                      <li>
                        <strong className="text-red-600">"Non-compliant"</strong> otherwise, with clause-specific reason
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Traceability */}
          <AccordionItem value="traceability">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                <span className="font-medium">6. Traceability</span>
                <Badge variant="secondary" className="ml-2 text-xs">
                  Audit Trail
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm space-y-3 pl-6">
              <p className="text-muted-foreground">
                Each compliance decision must cite the clause applied (Initial, Supplementary, Temporary,
                Non-compliance).
              </p>
              <p className="text-muted-foreground font-medium">Output must include:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                <li>
                  Compliance status (<strong className="text-green-600">Compliant</strong> /{" "}
                  <strong className="text-red-600">Non-compliant</strong>)
                </li>
                <li>Referenced COC numbers</li>
                <li>Clause references for each decision</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
