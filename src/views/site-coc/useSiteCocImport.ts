import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseDbSchedule, parseCertificateDetail, parseVerification, mergeCertificates } from "@/lib/siteCoc/parseWorkbooks";
import { assembleScheduleRows, assembleCertificateRows, summarize } from "@/lib/siteCoc/ingest";
import type { SubsectionLite } from "@/lib/siteCoc/types";

async function sheetGrid(file: File, sheetName: string): Promise<unknown[][] | null> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const name = wb.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase()) ?? wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
}

export function useSiteCocImport(siteId: string | undefined, onDone: () => void) {
  const [importing, setImporting] = useState(false);

  const runImport = async (scheduleFile: File, verificationFile: File) => {
    if (!siteId) return;
    setImporting(true);
    try {
      toast.info("Parsing workbooks...");

      const schedGrid = await sheetGrid(scheduleFile, "DB Schedule");
      const detailGrid = await sheetGrid(scheduleFile, "Certificate Detail");
      const verifGrid = await sheetGrid(verificationFile, "Verification");
      if (!schedGrid) throw new Error("Could not read the 'DB Schedule' sheet");

      const schedule = parseDbSchedule(schedGrid);
      const detail = detailGrid ? parseCertificateDetail(detailGrid) : [];
      const verification = verifGrid ? parseVerification(verifGrid) : [];
      const merged = mergeCertificates(detail, verification);

      const { data: subs, error: subsErr } = await supabase
        .from("subsections").select("id, name").eq("site_id", siteId);
      if (subsErr) throw subsErr;
      const subsLite: SubsectionLite[] = (subs ?? []) as SubsectionLite[];

      const { data: { user } } = await supabase.auth.getUser();
      const { data: batch, error: batchErr } = await supabase
        .from("coc_import_batches")
        .insert({ site_id: siteId, uploaded_by: user?.id ?? null, schedule_file_name: scheduleFile.name, verification_file_name: verificationFile.name })
        .select("id").single();
      if (batchErr || !batch) throw new Error(`Could not start import batch: ${batchErr?.message}`);

      const schedRows = assembleScheduleRows(schedule, subsLite, siteId, batch.id);
      const certRows = assembleCertificateRows(merged, subsLite, siteId, batch.id);
      const summary = summarize(schedRows, certRows);

      // Replace the site's set: delete prior rows (not this batch's), then insert the new batch.
      await supabase.from("coc_db_schedule").delete().eq("site_id", siteId).neq("import_batch_id", batch.id);
      await supabase.from("coc_certificates").delete().eq("site_id", siteId).neq("import_batch_id", batch.id);

      if (schedRows.length) {
        const { error } = await supabase.from("coc_db_schedule").insert(schedRows);
        if (error) throw error;
      }
      if (certRows.length) {
        const { error } = await supabase.from("coc_certificates").insert(certRows);
        if (error) throw error;
      }

      // Sync is_coc_required for matched shops (Y -> true, N/A/N -> false; blank left alone).
      for (const r of schedRows) {
        if (!r.subsection_id) continue;
        const v = r.coc_required.trim().toUpperCase();
        if (v === "Y") await supabase.from("subsections").update({ is_coc_required: true }).eq("id", r.subsection_id);
        else if (v === "N/A" || v === "N") await supabase.from("subsections").update({ is_coc_required: false }).eq("id", r.subsection_id);
      }

      await supabase.from("coc_import_batches").update(summary).eq("id", batch.id);

      toast.success(`Imported ${summary.certs_imported} certificates across ${summary.shops_imported} shops (${summary.unmatched_count} unmatched).`);
      onDone();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC import failed:", e);
      toast.error(e?.message || "Import failed", { duration: 6000 });
    } finally {
      setImporting(false);
    }
  };

  return { importing, runImport };
}
