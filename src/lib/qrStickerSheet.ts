import { buildLabeledQrSvg } from "./qrSvg";
import { qrRedirectUrl } from "./qrBaseUrl";
import { generatePdfBlob } from "./pdfMakeUtils";

interface StickerSubsection {
  id: string;
  name: string;
}

// A4 3-column grid of vector stickers. pdfmake renders `svg` nodes natively,
// so print output is crisp at any physical size.
export async function buildStickerSheetBlob(siteName: string, subsections: StickerSubsection[]): Promise<Blob> {
  const svgs = await Promise.all(
    subsections.map((s) => buildLabeledQrSvg({ url: qrRedirectUrl(s.id), siteName, subsectionName: s.name })),
  );

  const rows: any[] = [];
  for (let i = 0; i < svgs.length; i += 3) {
    rows.push({
      columns: svgs.slice(i, i + 3).map((svg) => ({ svg, width: 165, margin: [0, 0, 8, 12] })),
      columnGap: 8,
    });
  }

  const docDefinition: any = {
    pageSize: "A4",
    pageMargins: [24, 28, 24, 28],
    content: [
      { text: `${siteName} — QR sticker sheet`, bold: true, fontSize: 12, margin: [0, 0, 0, 10] },
      ...rows,
    ],
  };

  return generatePdfBlob(docDefinition);
}
