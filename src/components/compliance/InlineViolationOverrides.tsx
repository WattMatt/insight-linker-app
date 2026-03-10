import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquarePlus,
  Undo2,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface Violation {
  clause: string;
  description: string;
  reason?: string;
  riskLevel?: string;
  immediateAction?: string;
  evidence?: string;
}

interface ViolationOverride {
  reason: string;
  overriddenBy: string;
  overriddenAt: string;
}

interface InlineViolationOverridesProps {
  /** The coc_validations row id */
  validationId: string;
  violations: Violation[];
  reportData: Record<string, unknown> | null;
  /** Called after any override change so parent can refresh */
  onChanged?: () => void;
}

export function InlineViolationOverrides({
  validationId,
  violations,
  reportData,
  onChanged,
}: InlineViolationOverridesProps) {
  const [overrides, setOverrides] = useState<Record<number, ViolationOverride>>(() => {
    const persisted = (reportData as Record<string, unknown>)?.violationOverrides as Record<string, ViolationOverride> | undefined;
    if (persisted) {
      const parsed: Record<number, ViolationOverride> = {};
      Object.entries(persisted).forEach(([key, val]) => {
        parsed[Number(key)] = val;
      });
      return parsed;
    }
    return {};
  });
  const [overridingIndex, setOverridingIndex] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);

  const activeViolations = violations.filter((_, i) => !overrides[i]);
  const overriddenViolations = violations.filter((_, i) => !!overrides[i]);

  const handleSaveOverride = useCallback(async (index: number) => {
    if (!overrideReason.trim()) {
      toast.error("Please provide a reason for the override");
      return;
    }
    setSaving(true);
    try {
      const newOverrides = {
        ...overrides,
        [index]: {
          reason: overrideReason.trim(),
          overriddenBy: (await supabase.auth.getUser()).data.user?.email || 'Unknown',
          overriddenAt: new Date().toISOString(),
        },
      };

      const existingReportData = (reportData || {}) as Record<string, unknown>;
      const updatedReportData = {
        ...existingReportData,
        violationOverrides: Object.fromEntries(
          Object.entries(newOverrides).map(([k, v]) => [String(k), v])
        ),
      };

      const { error } = await supabase
        .from('coc_validations')
        .update({ report_data: updatedReportData as never })
        .eq('id', validationId);

      if (error) throw error;

      setOverrides(newOverrides);
      setOverridingIndex(null);
      setOverrideReason("");
      toast.success("Violation overridden", { description: "Override saved with audit trail" });
      onChanged?.();
    } catch (err) {
      toast.error("Override failed", { description: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  }, [overrideReason, overrides, reportData, validationId, onChanged]);

  const handleRemoveOverride = useCallback(async (index: number) => {
    setSaving(true);
    try {
      const { [index]: _removed, ...remaining } = overrides;

      const existingReportData = (reportData || {}) as Record<string, unknown>;
      const updatedReportData = {
        ...existingReportData,
        violationOverrides: Object.fromEntries(
          Object.entries(remaining).map(([k, v]) => [String(k), v])
        ),
      };

      const { error } = await supabase
        .from('coc_validations')
        .update({ report_data: updatedReportData as never })
        .eq('id', validationId);

      if (error) throw error;

      setOverrides(remaining);
      toast.success("Override removed");
      onChanged?.();
    } catch (err) {
      toast.error("Failed to remove override");
    } finally {
      setSaving(false);
    }
  }, [overrides, reportData, validationId, onChanged]);

  if (!violations || violations.length === 0) return null;

  return (
    <details className="mt-2 text-sm" open>
      <summary className="cursor-pointer font-medium flex items-center gap-2">
        {activeViolations.length > 0 ? (
          <span className="text-destructive">
            ⚠️ {activeViolations.length} SANS 10142-1 violation(s) found
          </span>
        ) : (
          <span className="text-emerald-600 flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" /> All violations resolved via override
          </span>
        )}
        {overriddenViolations.length > 0 && activeViolations.length > 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-500/30 text-xs">
            {overriddenViolations.length} overridden
          </Badge>
        )}
      </summary>

      {/* Active violations */}
      {activeViolations.length > 0 && (
        <ul className="mt-2 ml-4 space-y-3">
          {violations.map((v, i) => {
            if (overrides[i]) return null;
            const isOverriding = overridingIndex === i;

            return (
              <li key={i} className="border-l-2 border-destructive pl-3 py-1">
                <div className="flex items-center gap-2 mb-1">
                  <strong className="text-foreground">Clause {v.clause}:</strong>
                  <span className="text-destructive font-medium">{v.description}</span>
                  {v.riskLevel && (
                    <Badge variant={v.riskLevel === 'High' ? 'destructive' : v.riskLevel === 'Medium' ? 'secondary' : 'outline'} className="text-xs">
                      {v.riskLevel} Risk
                    </Badge>
                  )}
                </div>
                {v.reason && (
                  <div className="text-sm text-muted-foreground mt-1">{v.reason}</div>
                )}
                {v.immediateAction && (
                  <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                    <strong>Action Required:</strong> {v.immediateAction}
                  </div>
                )}
                {v.evidence && (
                  <div className="text-xs mt-1 italic text-muted-foreground">Evidence: {v.evidence}</div>
                )}

                {/* Override controls */}
                {!isOverriding ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 text-xs h-7 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                    onClick={() => { setOverridingIndex(i); setOverrideReason(""); }}
                  >
                    <MessageSquarePlus className="h-3 w-3 mr-1" />
                    Override this finding
                  </Button>
                ) : (
                  <div className="mt-2 space-y-2 p-2 border border-amber-300/50 rounded-md bg-amber-50/50 dark:bg-amber-950/20">
                    <Textarea
                      placeholder="Reason for override (e.g., 'Verified on-site — meter reads 0.8Ω, within tolerance')"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleSaveOverride(i)}
                        disabled={saving || !overrideReason.trim()}
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Save Override
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => { setOverridingIndex(null); setOverrideReason(""); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Overridden violations */}
      {overriddenViolations.length > 0 && (
        <div className="mt-3 ml-4">
          <p className="text-xs font-medium text-amber-700 mb-2">Overridden findings:</p>
          <ul className="space-y-2">
            {violations.map((v, i) => {
              const override = overrides[i];
              if (!override) return null;
              return (
                <li key={i} className="border-l-2 border-amber-400 pl-3 py-1 bg-amber-50/50 dark:bg-amber-950/20 rounded-r-md">
                  <div className="flex items-center gap-2">
                    <span className="line-through text-muted-foreground text-xs">
                      Clause {v.clause}: {v.description}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveOverride(i)}
                      disabled={saving}
                      title="Undo override"
                    >
                      <Undo2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-amber-700 mt-1">
                    <strong>Override:</strong> {override.reason}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    by {override.overriddenBy} on {format(new Date(override.overriddenAt), 'dd MMM yyyy HH:mm')}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </details>
  );
}
