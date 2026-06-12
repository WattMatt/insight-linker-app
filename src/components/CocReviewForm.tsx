import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CocReviewValue {
  coc_status: "Pass" | "Fail";
  coc_number: string;
  coc_issue_date: string | null;
  coc_expiry_date: string | null;
  coc_failure_reasons: string | null;
}

interface Props {
  subsectionId: string;
  initial?: Partial<CocReviewValue>;
  onSaved?: (v: CocReviewValue) => void;
}

export function CocReviewForm({ subsectionId, initial, onSaved }: Props) {
  const [verdict, setVerdict] = useState<"Pass" | "Fail">(
    initial?.coc_status === "Fail" ? "Fail" : "Pass"
  );
  const [number, setNumber] = useState(initial?.coc_number || "");
  const [issue, setIssue] = useState(initial?.coc_issue_date || "");
  const [expiry, setExpiry] = useState(initial?.coc_expiry_date || "");
  const [reasons, setReasons] = useState(initial?.coc_failure_reasons || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const value: CocReviewValue = {
      coc_status: verdict,
      coc_number: number.trim(),
      coc_issue_date: issue || null,
      coc_expiry_date: expiry || null,
      coc_failure_reasons: verdict === "Fail" ? (reasons.trim() || null) : null,
    };
    const { error } = await supabase.from("subsections").update({
      ...value,
      coc_reviewed_by: user?.id ?? null,
      coc_reviewed_at: new Date().toISOString(),
    }).eq("id", subsectionId);
    setSaving(false);
    if (error) {
      toast.error(`Failed to save COC review: ${error.message}`);
      return;
    }
    toast.success("COC review saved");
    onSaved?.(value);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Verdict</Label>
        <RadioGroup value={verdict} onValueChange={(v) => setVerdict(v as "Pass" | "Fail")} className="flex gap-6 mt-2">
          <div className="flex items-center gap-2"><RadioGroupItem value="Pass" id="coc-pass" /><Label htmlFor="coc-pass">Pass</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="Fail" id="coc-fail" /><Label htmlFor="coc-fail">Fail</Label></div>
        </RadioGroup>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div><Label htmlFor="coc-number">COC number</Label><Input id="coc-number" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div><Label htmlFor="coc-issue">Issue date</Label><Input id="coc-issue" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
        <div><Label htmlFor="coc-expiry">Expiry date</Label><Input id="coc-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
      </div>
      {verdict === "Fail" && (
        <div>
          <Label htmlFor="coc-reasons">Failure reasons</Label>
          <Textarea id="coc-reasons" rows={4} value={reasons} onChange={(e) => setReasons(e.target.value)} placeholder="List the items in the COC that cause it to fail…" />
        </div>
      )}
      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save COC review"}</Button>
    </div>
  );
}
