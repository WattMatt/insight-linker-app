import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { parseDbSchedule, parseCertificateDetail, parseVerification, mergeCertificates } from "@/lib/siteCoc/parseWorkbooks";
import { assembleScheduleRows, assembleCertificateRows, summarize } from "@/lib/siteCoc/ingest";
import { applyPriorMatches } from "@/lib/siteCoc/reimport";
import { docStatusFromVerdict } from "@/lib/siteCoc/verdictMap";
import { reassignPendingPoolFiles } from "@/lib/coc/reassignPool";
import { normCert, normShop } from "@/lib/siteCoc/normalize";
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

      // Validate BEFORE anything destructive — a workbook that parses to nothing must not wipe the site.
      if (schedule.length === 0 && merged.length === 0) {
        throw new Error("No rows could be parsed from the workbooks — check the sheet names and format.");
      }

      const { data: subs, error: subsErr } = await supabase
        .from("subsections").select("id, name, tenant_name").eq("site_id", siteId);
      if (subsErr) throw subsErr;
      const subsLite: SubsectionLite[] = (subs ?? []) as SubsectionLite[];

      const { data: { user } } = await supabase.auth.getUser();
      const { data: batch, error: batchErr } = await supabase
        .from("coc_import_batches")
        .insert({ site_id: siteId, uploaded_by: user?.id ?? null, schedule_file_name: scheduleFile.name, verification_file_name: verificationFile.name })
        .select("id").single();
      if (batchErr || !batch) throw new Error(`Could not start import batch: ${batchErr?.message}`);

      // Snapshot prior resolutions (manual + auto) BEFORE anything is deleted, so a re-import does
      // not throw away matching work. Carry them onto rows the new auto-matcher leaves unmatched.
      const { data: priorRows } = await supabase
        .from("coc_db_schedule").select("shop_no_raw, subsection_id, match_status").eq("site_id", siteId);
      const priorMap = new Map<string, { id: string; status: "matched" | "manual" }>();
      for (const p of priorRows ?? []) {
        if (p.subsection_id) priorMap.set(normShop(p.shop_no_raw), { id: p.subsection_id, status: p.match_status === "manual" ? "manual" : "matched" });
      }
      const validSubIds = new Set(subsLite.map(s => s.id));

      const autoRows = assembleScheduleRows(schedule, subsLite, siteId, batch.id);
      const schedRows = applyPriorMatches(autoRows, priorMap, validSubIds);
      const certRows = assembleCertificateRows(merged, schedRows, siteId, batch.id);
      const summary = summarize(schedRows, certRows);

      // Insert the NEW set first; if this fails, the previous import is still intact (nothing deleted yet).
      if (schedRows.length) {
        const { error } = await supabase.from("coc_db_schedule").insert(schedRows);
        if (error) throw error;
      }
      let newCerts: { id: string; subsection_id: string | null; cert_no_norm: string; verdict: string | null }[] = [];
      if (certRows.length) {
        const { data, error } = await supabase.from("coc_certificates").insert(certRows).select("id, subsection_id, cert_no_norm, verdict");
        if (error) throw error;
        newCerts = (data ?? []) as typeof newCerts;
      }

      // Now remove the previous set. `.or` covers legacy NULL-batch rows that `.neq` alone would skip.
      const notThisBatch = `import_batch_id.is.null,import_batch_id.neq.${batch.id}`;
      await supabase.from("coc_db_schedule").delete().eq("site_id", siteId).or(notThisBatch);
      await supabase.from("coc_certificates").delete().eq("site_id", siteId).or(notThisBatch);

      // Re-link surviving uploaded documents to the new cert rows (re-import would otherwise drop the
      // coc_document_id / eval_document_id attachments). Match by subsection + normalised cert number.
      const matchedSubIds = Array.from(new Set(newCerts.filter(c => c.subsection_id).map(c => c.subsection_id))) as string[];
      let stamped = 0;
      if (matchedSubIds.length) {
        const { data: docs } = await supabase
          .from("subsection_documents")
          .select("id, subsection_id, coc_number, parent_document_id")
          .in("subsection_id", matchedSubIds);
        const cocByKey = new Map<string, string>();
        const evalByKey = new Map<string, string>();
        for (const d of docs ?? []) {
          if (!d.subsection_id || !d.coc_number) continue;
          const key = `${d.subsection_id}|${normCert(d.coc_number)}`;
          if (d.parent_document_id) { if (!evalByKey.has(key)) evalByKey.set(key, d.id); }
          else if (!cocByKey.has(key)) cocByKey.set(key, d.id);
        }
        for (const c of newCerts) {
          if (!c.subsection_id || !c.cert_no_norm) continue;
          const key = `${c.subsection_id}|${c.cert_no_norm}`;
          const cocDoc = cocByKey.get(key);
          const evalDoc = evalByKey.get(key);
          if (cocDoc || evalDoc) {
            await supabase.from("coc_certificates").update({
              ...(cocDoc ? { coc_document_id: cocDoc } : {}),
              ...(evalDoc ? { eval_document_id: evalDoc } : {}),
            }).eq("id", c.id);
          }
          // Register-truth: the new batch's verdict overwrites the attached COC
          // document's status (fires the DB rollup -> subsections.coc_status).
          if (cocDoc) {
            await supabase.from("subsection_documents")
              .update({ coc_status: docStatusFromVerdict(c.verdict) })
              .eq("id", cocDoc);
            stamped++;
          }
        }
      }

      // Sync is_coc_required for matched shops (Y -> true, N/A/N -> false; blank left alone).
      for (const r of schedRows) {
        if (!r.subsection_id) continue;
        const v = r.coc_required.trim().toUpperCase();
        if (v === "Y") await supabase.from("subsections").update({ is_coc_required: true }).eq("id", r.subsection_id);
        else if (v === "N/A" || v === "N") await supabase.from("subsections").update({ is_coc_required: false }).eq("id", r.subsection_id);
      }

      await supabase.from("coc_import_batches").update(summary).eq("id", batch.id);

      // Newly-imported certs may now place pool files that were waiting on the schedule.
      await reassignPendingPoolFiles(siteId);

      toast.success(`Imported ${summary.certs_imported} certificates across ${summary.shops_imported} shops (${summary.unmatched_count} unmatched). Re-stamped ${stamped} attached document(s) from the new verdicts.`);
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
