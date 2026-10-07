// Bulk download of a site's saved reports as one zip, built in the browser.
// Layout: <Category>/<file> for site reports, <Category>/<Subsection>/<file> for subsection reports.
import JSZip from "jszip";
import { downloadDocumentBlob } from "@/lib/documents/documentUrl";
import type { SiteReportRow } from "./siteReportInventory";

const CONCURRENCY = 4;

/** Strip characters that are illegal or awkward in zip entry names on Windows/macOS. */
export function safeSegment(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.replace(/^\.+/, "") || "Untitled";
}

export function reportZipPath(row: Pick<SiteReportRow, "category" | "subsectionName" | "file_name">): string {
  const parts = [safeSegment(row.category)];
  if (row.subsectionName) parts.push(safeSegment(row.subsectionName));
  parts.push(safeSegment(row.file_name));
  return parts.join("/");
}

/** Make a path unique within `taken` by numbering the file name: "a.pdf" → "a (2).pdf". */
export function uniquePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) {
    taken.add(path);
    return path;
  }
  const slash = path.lastIndexOf("/");
  const dir = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${dir}${stem} (${n})${ext}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export interface ReportZipResult {
  blob: Blob;
  added: number;
  missing: SiteReportRow[];
}

export async function buildReportsZip(
  rows: SiteReportRow[],
  onProgress?: (done: number, total: number) => void,
): Promise<ReportZipResult> {
  const zip = new JSZip();
  const taken = new Set<string>();
  const missing: SiteReportRow[] = [];
  // Paths are fixed up front, in list order, so numbering is deterministic.
  const jobs = rows.map((row) => ({ row, path: uniquePath(reportZipPath(row), taken) }));

  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { row, path } = jobs[next++];
      const blob = await downloadDocumentBlob(row.file_url).catch(() => null);
      if (blob) zip.file(path, await blob.arrayBuffer(), { date: new Date(row.created_at) });
      else missing.push(row);
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  if (missing.length > 0) {
    zip.file(
      "_MISSING_FILES.txt",
      ["These reports could not be downloaded and are not in this zip:", "", ...missing.map(reportZipPath)].join("\n"),
    );
  }

  // PDFs are already compressed; STORE keeps the zip fast to build with no real size cost.
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, added: jobs.length - missing.length, missing };
}
