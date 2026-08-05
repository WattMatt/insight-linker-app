import QRCode from "qrcode";

interface LabeledQrOptions {
  url: string;
  siteName: string;
  subsectionName: string;
}

// Vector sticker: QR + border + REAL text labels (labels were previously
// rasterized into the PNG, which is why renames left stale artifacts).
// Layout mirrors qrCodeGenerator.ts proportions: 500 QR, 40 padding, text band.
export async function buildLabeledQrSvg({ url, siteName, subsectionName }: LabeledQrOptions): Promise<string> {
  const qrInner = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "H", margin: 1 });
  const inner = qrInner.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const qrViewBox = /viewBox="([^"]+)"/.exec(qrInner)?.[1] ?? "0 0 37 37";
  const W = 580, QR = 500, PAD = 40, TEXT_Y = PAD + QR + 48;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="720" viewBox="0 0 ${W} 720">
  <rect width="${W}" height="720" fill="white"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="717" fill="none" stroke="black" stroke-width="3"/>
  <svg x="${PAD}" y="${PAD}" width="${QR}" height="${QR}" viewBox="${qrViewBox}">${inner}</svg>
  <text x="${W / 2}" y="${TEXT_Y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="bold">${esc(siteName.toUpperCase())}</text>
  <text x="${W / 2}" y="${TEXT_Y + 42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30">${esc(subsectionName)}</text>
</svg>`;
}
