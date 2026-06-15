"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useUnresolvedOrphans,
  type OrphanRow,
} from "@/hooks/useUnresolvedOrphans";

/**
 * Blocks the rest of the app while the current inspector has any
 * orphan inspections (subsection_id IS NULL) that need a shop attached.
 *
 * Server-side guards (RPC SECURITY DEFINER) enforce:
 *   - inspection.inspector_id = auth.uid()
 *   - chosen subsection lives at the inspection's site
 *   - idempotency: can't double-resolve
 *
 * So this component just surfaces the rows and sends RPCs — the
 * security model is server-side.
 *
 * Render this from inside a contractor's authenticated layout (e.g.
 * ContractorProtectedRoute). Auto-hides when count reaches zero.
 */
export function OrphanResolutionModal() {
  const { rows, isLoading } = useUnresolvedOrphans();

  // Don't surface anything while the initial fetch is in flight or
  // when there are no orphans — the modal stays closed.
  if (isLoading || rows.length === 0) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {rows.length} inspection{rows.length === 1 ? "" : "s"} need
            your attention
          </AlertDialogTitle>
          <AlertDialogDescription>
            You completed these inspections, but they aren&apos;t attached
            to a shop yet. Please pick the correct shop for each one, or
            mark it as &ldquo;Not mine&rdquo; to archive.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {rows.map((row) => (
            <OrphanRowCard key={row.inspection_id} row={row} />
          ))}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrphanRowCard({ row }: { row: OrphanRow }) {
  const { resolve, archive } = useUnresolvedOrphans();

  const suggestedId =
    row.best_guess && row.best_guess.similarity >= 0.6
      ? row.best_guess.id
      : "";
  const [pick, setPick] = useState<string>(suggestedId);
  const [busy, setBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reason, setReason] = useState("");

  const handleResolve = async () => {
    if (!pick) {
      toast.error("Pick a shop first");
      return;
    }
    setBusy(true);
    try {
      await resolve({
        inspection_id: row.inspection_id,
        subsection_id: pick,
      });
      const picked = row.candidate_subsections?.find((s) => s.id === pick);
      toast.success(`Attached to ${picked?.name ?? "shop"}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Could not save: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      await archive({
        inspection_id: row.inspection_id,
        reason: reason.trim() || null,
      });
      toast.success("Archived");
      setArchiveOpen(false);
      setReason("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error(`Could not archive: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const createdDate = new Date(row.created_at).toLocaleDateString();
  const orphanTyped = [row.shop_name_orphan, row.shop_number_orphan]
    .filter(Boolean)
    .join(" / ");

  return (
    <Card className="p-4 space-y-3">
      <div>
        <div className="font-medium text-sm">
          {row.inspection_title || "Untitled inspection"}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.site_name ?? "Unknown site"} · {createdDate}
        </div>
        {orphanTyped && (
          <div className="mt-1 text-sm">
            <span className="text-muted-foreground">You typed: </span>
            <span className="font-mono">{orphanTyped}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Select value={pick} onValueChange={setPick} disabled={busy}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Pick the correct shop…" />
          </SelectTrigger>
          <SelectContent>
            {(row.candidate_subsections ?? []).map((s) => {
              const isSuggested =
                row.best_guess?.id === s.id &&
                row.best_guess.similarity >= 0.6;
              return (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {isSuggested ? " — suggested" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button onClick={handleResolve} disabled={busy || !pick}>
          Save
        </Button>
        <Button
          variant="outline"
          onClick={() => setArchiveOpen(true)}
          disabled={busy}
        >
          Not mine
        </Button>
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be hidden from your list. Optional: a short reason
              (e.g. &ldquo;test&rdquo;, &ldquo;duplicate&rdquo;).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            disabled={busy}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={handleArchive} disabled={busy}>
              Archive
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
