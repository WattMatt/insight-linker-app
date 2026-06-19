import { PDFDocument } from "pdf-lib";

type Bytes = ArrayBuffer | Uint8Array;

/** Build a new PDF = [report cover (page 0)] + [all guideline pages] + [remaining report pages]. */
export async function mergeGuidelineAfterCover(reportBytes: Bytes, guidelineBytes: Bytes): Promise<Uint8Array> {
  const report = await PDFDocument.load(reportBytes);
  const guide = await PDFDocument.load(guidelineBytes);
  const out = await PDFDocument.create();

  const reportCount = report.getPageCount();
  const [cover] = await out.copyPages(report, [0]);
  out.addPage(cover);

  const guidePages = await out.copyPages(guide, guide.getPageIndices());
  guidePages.forEach(p => out.addPage(p));

  if (reportCount > 1) {
    const restIdx = Array.from({ length: reportCount - 1 }, (_, i) => i + 1);
    const rest = await out.copyPages(report, restIdx);
    rest.forEach(p => out.addPage(p));
  }

  return out.save();
}
