import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import {
  VERDICT_WORDS, RESULT_WORDS, issues, progress, filterRecords, indexAfterDecision,
  type ProposedVerdict, type ReviewStatus, type SignOffRecord,
} from "@/lib/siteCoc/signOff";
import { useSignOff, usePageUrls } from "./useSignOff";
import type { SubsectionOption } from "./useSiteCoc";

const VERDICT_TONE: Record<ProposedVerdict, string> = {
  PASS: "bg-emerald-600 text-white",
  FAIL: "bg-red-700 text-white",
  REVIEW: "bg-amber-600 text-white",
};
const NO_SHOP = "__none__";

/**
 * One-at-a-time sign-off of proposed re-verification verdicts. Pages on the left; verdict,
 * issues, flags and Accept / Reject on the right. Deciding saves and moves to the next record.
 * Only Admins can decide; everyone else sees the same screen read-only.
 */
export function SignOffSubTab({ siteId, subsections, canSign }: { siteId: string | undefined; subsections: SubsectionOption[]; canSign: boolean }) {
  const { records, loading, error, decide, setShop } = useSignOff(siteId);
  const [status, setStatus] = useState<ReviewStatus>("proposed");
  const [verdict, setVerdict] = useState<ProposedVerdict | "all">("all");
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => filterRecords(records, { status, verdict }), [records, status, verdict]);
  const current: SignOffRecord | undefined = shown[Math.min(index, Math.max(shown.length - 1, 0))];
  const p = progress(records);
  const pages = usePageUrls(current?.pages ?? []);

  useEffect(() => { setIndex(0); }, [status, verdict]);
  useEffect(() => { setPage(0); setNote(""); }, [current?.id]);

  const run = useCallback(async (decision: "accept" | "reject") => {
    if (!current || !canSign || busy) return;
    if (decision === "reject" && !note.trim()) { toast.error("Add a short reason before rejecting."); return; }
    setBusy(true);
    try {
      await decide(current.id, decision, note.trim());
      toast.success(decision === "accept" ? `Signed off ${current.certNo ?? current.recordKey}: ${current.verdict}` : `Rejected ${current.certNo ?? current.recordKey}`);
      setIndex((i) => indexAfterDecision(i, shown.length - 1));
    } catch (e) {
      toast.error((e as Error).message || "Could not save the decision");
    } finally {
      setBusy(false);
    }
  }, [current, canSign, busy, note, decide, shown.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable || t.getAttribute("role") === "combobox")) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (status === "proposed" && (e.key === "a" || e.key === "A")) void run("accept");
      else if (status === "proposed" && (e.key === "r" || e.key === "R")) void run("reject");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, shown.length, status]);

  const onShop = async (value: string) => {
    if (!current) return;
    try { await setShop(current.id, value === NO_SHOP ? null : value); toast.success("Shop saved"); }
    catch (e) { toast.error((e as Error).message || "Could not save the shop"); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-sm text-destructive">Could not load records: {(error as Error).message}</p>;
  if (!records.length) return <p className="text-sm text-muted-foreground">No re-verification records for this site.</p>;

  const issueList = current ? issues(current.rules) : [];
  const done = p.signedOff + p.rejected;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><strong>{p.signedOff}</strong> signed off · <strong>{p.rejected}</strong> rejected · <strong>{p.toReview}</strong> to review <span className="text-muted-foreground">of {p.total}</span></span>
          <div className="flex gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as ReviewStatus)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="proposed">To review</SelectItem>
                <SelectItem value="signed_off">Signed off</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verdict} onValueChange={(v) => setVerdict(v as ProposedVerdict | "all")}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verdicts</SelectItem>
                <SelectItem value="FAIL">FAIL</SelectItem>
                <SelectItem value="REVIEW">REVIEW</SelectItem>
                <SelectItem value="PASS">PASS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Progress value={p.total ? (done / p.total) * 100 : 0} />
        {!canSign && <p className="text-xs text-muted-foreground">View only — signing off needs the Admin role.</p>}
      </div>

      {!current ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nothing here for this filter.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/30 min-h-[420px] flex items-center justify-center overflow-hidden">
              {!current.pages.length ? <p className="text-sm text-muted-foreground">No page images for this record.</p>
                : pages.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                : pages.data?.[page] ? (
                  <a href={pages.data[page]} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={pages.data[page]} alt={`Page ${page + 1} of ${current.certNo ?? current.recordKey}`} className="max-h-[75vh] w-auto object-contain" />
                  </a>
                ) : <p className="text-sm text-destructive">Could not load the page image.</p>}
            </div>
            {current.pages.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {current.pages.map((_, i) => (
                  <Button key={i} size="sm" variant={i === page ? "default" : "outline"} onClick={() => setPage(i)}>Page {i + 1}</Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Record {Math.min(index, shown.length - 1) + 1} of {shown.length}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Previous" onClick={() => setIndex((i) => Math.max(i - 1, 0))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Next" onClick={() => setIndex((i) => Math.min(i + 1, shown.length - 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className={VERDICT_TONE[current.verdict]}>{current.verdict}</Badge>
                <span className="font-medium">{VERDICT_WORDS[current.verdict]}</span>
              </div>
              <p className="text-sm"><span className="font-semibold">{current.certNo ?? "No certificate number"}</span>
                {current.certType ? ` · ${current.certType}` : ""}{current.issuedDate ? ` · ${current.issuedDate}` : ""}</p>
              <p className="text-xs text-muted-foreground break-words">
                {current.dbName ? `DB: ${current.dbName} · ` : ""}{current.regPerson ? `Registered person: ${current.regPerson}${current.regNo ? ` (${current.regNo})` : ""} · ` : ""}
                Source: {current.sourceFile}
              </p>
              {current.verdictAlt && current.verdictAlt !== current.verdict && (
                <p className="text-xs">Under the judgement policy this would be <strong>{current.verdictAlt}</strong>.</p>
              )}
            </div>

            {issueList.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">What did not pass</p>
                <ul className="space-y-1 text-sm">
                  {issueList.map((r) => (
                    <li key={r.rule} className="flex gap-2">
                      <span className="font-mono text-xs w-9 shrink-0 pt-0.5">{r.rule}</span>
                      <span><span className="font-medium">{RESULT_WORDS[r.res] ?? r.res}</span>{r.note ? ` — ${r.note}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(current.flags.length > 0 || current.caveats.length > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs space-y-1 dark:bg-amber-950/30">
                {current.flags.map((f, i) => <p key={`f${i}`}>⚑ {f}</p>)}
                {current.caveats.map((c, i) => <p key={`c${i}`}>• {c}</p>)}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">Shop</p>
              <Select value={current.subsectionId ?? NO_SHOP} onValueChange={onShop} disabled={!canSign}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SHOP}>Not assigned</SelectItem>
                  {subsections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` — ${s.tenant_name}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {current.status === "proposed" ? (
              canSign && (
                <div className="space-y-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional to accept, required to reject)" rows={2} />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => run("accept")} disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Accept {current.verdict}
                    </Button>
                    <Button className="flex-1" variant="outline" onClick={() => run("reject")} disabled={busy}>
                      <X className="h-4 w-4 mr-2" />Reject
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Keys: A accept · R reject · ← → move</p>
                </div>
              )
            ) : (
              <p className="text-sm">
                {current.status === "signed_off" ? `Signed off ${current.signedOffAt ? new Date(current.signedOffAt).toLocaleString() : ""}` : "Rejected"}
                {current.signOffNote ? ` — ${current.signOffNote}` : ""}
              </p>
            )}

            {current.pages.length > 0 && pages.data?.[page] && (
              <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" href={pages.data[page]} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3" />Open page in a new tab
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
