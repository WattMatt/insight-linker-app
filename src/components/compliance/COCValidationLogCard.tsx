import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Target,
  RefreshCw,
  RotateCcw,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  MessageSquarePlus,
  Undo2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ValidationViolation {
  clause: string;
  description: string;
  reason?: string;
  riskLevel?: string;
  immediateAction?: string;
  evidence?: string;
  section?: string;
}

interface ViolationOverride {
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
}

export interface ValidationRecord {
  id: string;
  document_id: string;
  subsection_id: string;
  subsection_name: string;
  status: string;
  validated_at: string;
  violations: ValidationViolation[];
  report_data: Record<string, unknown> | null;
  document: {
    id: string;
    file_name: string;
    file_url: string;
    uploaded_at: string;
  } | null;
}

interface COCValidationLogCardProps {
  allValidations: ValidationRecord[];
  onPreview: (validation: ValidationRecord) => void;
  onRevalidate: (validation: ValidationRecord, mode: 'failed' | 'full') => void;
  revalidatingId: string | null;
  revalidationMode: 'failed' | 'full' | null;
  onValidationsChanged?: () => void;
  /** Called when user clicks Review/Verify COC on a validation entry */
  onReviewCoc?: (validation: ValidationRecord) => void;
  /** ID of the document currently being reviewed/extracted */
  reviewingDocId?: string | null;
}

export function COCValidationLogCard({
  allValidations,
  onPreview,
  onRevalidate,
  revalidatingId,
  revalidationMode,
  onValidationsChanged,
  onReviewCoc,
  reviewingDocId,
}: COCValidationLogCardProps) {
  const [validationFilter, setValidationFilter] = useState<'all' | 'passed' | 'failed'>('all');
  // Map of validationId -> { violationIndex -> override }
  const [overrides, setOverrides] = useState<Record<string, Record<number, ViolationOverride>>>({});
  // Which violation is currently being overridden (validationId:index)
  const [overridingKey, setOverridingKey] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  // Initialize overrides from report_data on first render per validation
  const getOverrides = useCallback((validation: ValidationRecord): Record<number, ViolationOverride> => {
    // Check local state first
    if (overrides[validation.id]) return overrides[validation.id];
    // Check persisted overrides in report_data
    const persisted = (validation.report_data as Record<string, unknown>)?.violationOverrides as Record<string, ViolationOverride> | undefined;
    if (persisted) {
      const parsed: Record<number, ViolationOverride> = {};
      Object.entries(persisted).forEach(([key, val]) => {
        parsed[Number(key)] = val;
      });
      return parsed;
    }
    return {};
  }, [overrides]);

  const handleStartOverride = (validationId: string, violationIndex: number) => {
    setOverridingKey(`${validationId}:${violationIndex}`);
    setOverrideReason("");
  };

  const handleCancelOverride = () => {
    setOverridingKey(null);
    setOverrideReason("");
  };

  const handleSaveOverride = async (validation: ValidationRecord, violationIndex: number) => {
    if (!overrideReason.trim()) {
      toast.error("Please provide a reason for the override");
      return;
    }

    setSavingOverride(true);
    try {
      const currentOverrides = getOverrides(validation);
      const newOverrides = {
        ...currentOverrides,
        [violationIndex]: {
          reason: overrideReason.trim(),
          overriddenBy: (await supabase.auth.getUser()).data.user?.email || 'Unknown',
          overriddenAt: new Date().toISOString(),
        },
      };

      // Persist to report_data
      const existingReportData = (validation.report_data || {}) as Record<string, unknown>;
      const updatedReportData = {
        ...existingReportData,
        violationOverrides: Object.fromEntries(
          Object.entries(newOverrides).map(([k, v]) => [String(k), v])
        ),
      };
      const { error } = await supabase
        .from('coc_validations')
        .update({
          report_data: updatedReportData as never,
        })
        .eq('id', validation.id);

      if (error) throw error;

      // Update local state
      setOverrides(prev => ({
        ...prev,
        [validation.id]: newOverrides,
      }));

      // Also update the validation object in-memory
      validation.report_data = {
        ...existingReportData,
        violationOverrides: newOverrides,
      };

      setOverridingKey(null);
      setOverrideReason("");
      toast.success("Violation overridden", { description: "Override saved with audit trail" });
      onValidationsChanged?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      toast.error("Override failed", { description: msg });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleRemoveOverride = async (validation: ValidationRecord, violationIndex: number) => {
    setSavingOverride(true);
    try {
      const currentOverrides = getOverrides(validation);
      const { [violationIndex]: _removed, ...remaining } = currentOverrides;

      const existingReportData = (validation.report_data || {}) as Record<string, unknown>;
      const updatedReportData = {
        ...existingReportData,
        violationOverrides: Object.fromEntries(
          Object.entries(remaining).map(([k, v]) => [String(k), v])
        ),
      };
      const { error } = await supabase
        .from('coc_validations')
        .update({
          report_data: updatedReportData as never,
        })
        .eq('id', validation.id);

      if (error) throw error;

      setOverrides(prev => ({
        ...prev,
        [validation.id]: remaining,
      }));

      validation.report_data = {
        ...existingReportData,
        violationOverrides: remaining,
      };

      toast.info("Override removed");
      onValidationsChanged?.();
    } catch (err) {
      toast.error("Failed to remove override");
    } finally {
      setSavingOverride(false);
    }
  };

  const filtered = allValidations.filter(v => {
    if (validationFilter === 'all') return true;
    if (validationFilter === 'passed') return v.status === 'Pass';
    if (validationFilter === 'failed') return ['Fail', 'Failed', 'Incomplete'].includes(v.status);
    return true;
  });

  if (allValidations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-medium mb-2">No Validation Results Yet</h3>
          <p className="text-muted-foreground mb-4">
            Run bulk COC validation above to check compliance of all certificates
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-muted-foreground" />
              COC Validation Log
              <Badge variant="outline" className="ml-2">
                {allValidations.length} records
              </Badge>
            </CardTitle>
            <CardDescription>
              Complete validation history • Override violations with reviewer comments
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={validationFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setValidationFilter('all')}
            >
              All ({allValidations.length})
            </Button>
            <Button
              variant={validationFilter === 'passed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setValidationFilter('passed')}
              className={validationFilter === 'passed' ? '' : 'text-green-600 border-green-600/30 hover:bg-green-500/10'}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Passed ({allValidations.filter(v => v.status === 'Pass').length})
            </Button>
            <Button
              variant={validationFilter === 'failed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setValidationFilter('failed')}
              className={validationFilter === 'failed' ? '' : 'text-destructive border-destructive/30 hover:bg-destructive/10'}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Failed ({allValidations.filter(v => ['Fail', 'Failed', 'Incomplete'].includes(v.status)).length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.map((validation) => {
          const isPassed = validation.status === 'Pass';
          const isFailed = ['Fail', 'Failed', 'Incomplete'].includes(validation.status);
          const validationOverrides = getOverrides(validation);
          const overriddenCount = Object.keys(validationOverrides).length;
          const activeViolations = validation.violations.filter((_, i) => !validationOverrides[i]);

          return (
            <div
              key={validation.id}
              className={`border rounded-lg p-4 transition-colors ${
                isPassed
                  ? 'bg-green-500/5 hover:bg-green-500/10 border-green-500/20'
                  : isFailed
                    ? 'bg-destructive/5 hover:bg-destructive/10 border-destructive/20'
                    : 'bg-muted/30 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {isPassed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : isFailed ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="font-semibold truncate">{validation.subsection_name}</span>
                    <Badge
                      variant={isPassed ? 'default' : isFailed ? 'destructive' : 'secondary'}
                      className={isPassed ? 'bg-green-600 hover:bg-green-700' : ''}
                    >
                      {validation.status}
                    </Badge>
                    {overriddenCount > 0 && (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">
                        <ShieldAlert className="h-3 w-3 mr-1" />
                        {overriddenCount} overridden
                      </Badge>
                    )}
                    {isFailed && activeViolations.length === 0 && overriddenCount > 0 && (
                      <Badge variant="outline" className="text-green-600 border-green-500/30 bg-green-500/10">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        All resolved
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">
                    Validated: {format(new Date(validation.validated_at), 'dd MMM yyyy, HH:mm')}
                    {validation.document && (
                      <span className="ml-2">• {validation.document.file_name}</span>
                    )}
                  </p>

                  {/* Active violations */}
                  {isFailed && activeViolations.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm font-medium text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {activeViolations.length} Active Issue{activeViolations.length !== 1 ? 's' : ''}:
                      </p>
                      <div className="space-y-1.5">
                        {validation.violations.map((v, idx) => {
                          if (validationOverrides[idx]) return null;
                          const isOverriding = overridingKey === `${validation.id}:${idx}`;

                          return (
                            <div key={idx} className="text-sm p-2 rounded bg-background/60 border border-destructive/20">
                              <div className="flex items-start gap-2">
                                <Target className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-destructive">
                                    Clause {v.clause}
                                  </span>
                                  {v.section && (
                                    <span className="text-muted-foreground text-xs ml-2">({v.section})</span>
                                  )}
                                  <p className="text-muted-foreground text-xs mt-0.5">{v.description}</p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                  onClick={() => handleStartOverride(validation.id, idx)}
                                >
                                  <MessageSquarePlus className="h-3 w-3 mr-1" />
                                  Override
                                </Button>
                              </div>

                              {isOverriding && (
                                <div className="mt-2 ml-5 space-y-2 border-t border-amber-500/20 pt-2">
                                  <Textarea
                                    placeholder="Explain why this violation is being overridden (e.g. 'Verified on-site — reading within tolerance')"
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    className="min-h-[60px] text-xs"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={!overrideReason.trim() || savingOverride}
                                      onClick={() => handleSaveOverride(validation, idx)}
                                    >
                                      {savingOverride ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                                      Confirm Override
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={handleCancelOverride}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Overridden violations */}
                  {overriddenCount > 0 && (
                    <div className="space-y-2 mt-3">
                      <p className="text-sm font-medium text-amber-600 flex items-center gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {overriddenCount} Overridden:
                      </p>
                      <div className="space-y-1.5">
                        {validation.violations.map((v, idx) => {
                          const override = validationOverrides[idx];
                          if (!override) return null;
                          return (
                            <div key={idx} className="text-sm p-2 rounded bg-amber-500/5 border border-amber-500/20">
                              <div className="flex items-start gap-2">
                                <ShieldCheck className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-amber-700 line-through">
                                    Clause {v.clause}
                                  </span>
                                  <p className="text-muted-foreground text-xs mt-0.5 line-through">{v.description}</p>
                                  <div className="mt-1 p-1.5 rounded bg-background/80 text-xs">
                                    <span className="font-medium text-foreground">Override: </span>
                                    <span className="text-muted-foreground">{override.reason}</span>
                                    <span className="text-muted-foreground/70 ml-2">
                                      — {override.overriddenBy}, {format(new Date(override.overriddenAt), 'dd MMM yyyy HH:mm')}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 h-7 text-xs text-muted-foreground hover:text-destructive"
                                  disabled={savingOverride}
                                  onClick={() => handleRemoveOverride(validation, idx)}
                                >
                                  <Undo2 className="h-3 w-3 mr-1" />
                                  Undo
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isPassed && (
                    <p className="text-sm text-green-600">✓ All compliance checks passed</p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-1.5 shrink-0 ml-2">
                  {validation.document && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => onPreview(validation)}
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                  )}

                  {/* Review / Verify COC button */}
                  {validation.document && onReviewCoc && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={reviewingDocId === validation.document_id}
                      onClick={() => onReviewCoc(validation)}
                    >
                      {reviewingDocId === validation.document_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileCheck className="h-3.5 w-3.5" />
                      )}
                      Review COC
                    </Button>
                  )}

                  {isFailed && validation.document && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-amber-600 border-amber-600/30 hover:bg-amber-500/10"
                        disabled={revalidatingId === validation.id}
                        onClick={() => onRevalidate(validation, 'failed')}
                      >
                        {revalidatingId === validation.id && revalidationMode === 'failed' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Re-check Failed
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground"
                        disabled={revalidatingId === validation.id}
                        onClick={() => onRevalidate(validation, 'full')}
                      >
                        {revalidatingId === validation.id && revalidationMode === 'full' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Full Re-scan
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No {validationFilter === 'all' ? '' : validationFilter} validations found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
