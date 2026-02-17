import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, QrCode } from "lucide-react";
import { LabeledQRCode } from "@/components/LabeledQRCode";
import { Subsection, Site } from "@/types/site";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateAndUploadQRCode } from "@/lib/qrCodeGenerator";
import JSZip from 'jszip';
import { generatePdfBlob, DEFAULT_STYLES } from "@/lib/pdfMakeUtils";

interface QRAnalyticsProps {
    site: Site;
    subsections: Subsection[];
    companyLogo: string | null;
    generatingAll: boolean;
    setGeneratingAll: (val: boolean) => void;
    downloadingAll: boolean;
    setDownloadingAll: (val: boolean) => void;
    fetchSiteData: () => void;
}

export const QRAnalytics: React.FC<QRAnalyticsProps> = ({
    site,
    subsections,
    companyLogo,
    generatingAll,
    setGeneratingAll,
    downloadingAll,
    setDownloadingAll,
    fetchSiteData
}) => {
    const handleGenerateAll = async () => {
        setGeneratingAll(true);
        toast.info("Regenerating QR codes for all subsections...");

        let successCount = 0;
        let failCount = 0;

        for (const subsection of subsections) {
            try {
                const result = await generateAndUploadQRCode({
                    subsectionId: subsection.id,
                    siteName: site.name,
                    subsectionName: subsection.name,
                    logoUrl: companyLogo || undefined
                });
                if (result) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(`Failed to generate QR for ${subsection.name}:`, error);
                failCount++;
            }
        }

        setGeneratingAll(false);

        if (failCount === 0) {
            toast.success(`Successfully regenerated ${successCount} QR codes!`);
        } else {
            toast.warning(`Regenerated ${successCount} QR codes, ${failCount} failed`);
        }

        fetchSiteData();
    };

    const handleDownloadAll = async () => {
        setDownloadingAll(true);
        toast.info("Generating all QR codes and PDF...");

        try {
            // Import dynamically to keep bundle size small for this specific feature
            const QRCode = await import('qrcode');
            const zip = new JSZip();

            // Get QR base URL from settings
            const { data: qrSettings } = await supabase
                .from('settings')
                .select('qr_base_url')
                .single();

            const baseUrl = (qrSettings?.qr_base_url || window.location.origin).replace(/\/$/, '');
            const qrCodeDataUrls: { dataUrl: string; name: string }[] = [];

            for (const subsection of subsections) {
                try {
                    const canvas = document.createElement('canvas');
                    const qrSize = 500;
                    const padding = 40;
                    const textHeight = 140;
                    const totalHeight = qrSize + textHeight + (padding * 2);
                    const totalWidth = qrSize + (padding * 2);

                    canvas.width = totalWidth;
                    canvas.height = totalHeight;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) continue;

                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, totalWidth, totalHeight);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 3;
                    ctx.strokeRect(1.5, 1.5, totalWidth - 3, totalHeight - 3);

                    const tempCanvas = document.createElement('canvas');
                    await QRCode.default.toCanvas(tempCanvas, `${baseUrl}/public/subsections/${subsection.id}`, {
                        width: qrSize,
                        margin: 1,
                        errorCorrectionLevel: 'H'
                    });

                    ctx.drawImage(tempCanvas, padding, padding, qrSize, qrSize);

                    if (companyLogo) {
                        await new Promise<void>((resolve) => {
                            const img = document.createElement('img');
                            img.crossOrigin = 'anonymous';
                            img.onload = () => {
                                const maxLogoSize = qrSize * 0.3;
                                let logoWidth = img.width;
                                let logoHeight = img.height;

                                if (logoWidth > logoHeight) {
                                    if (logoWidth > maxLogoSize) {
                                        logoHeight = (logoHeight * maxLogoSize) / logoWidth;
                                        logoWidth = maxLogoSize;
                                    }
                                } else {
                                    if (logoHeight > maxLogoSize) {
                                        logoWidth = (logoWidth * maxLogoSize) / logoHeight;
                                        logoHeight = maxLogoSize;
                                    }
                                }

                                const logoX = padding + (qrSize - logoWidth) / 2;
                                const logoY = padding + (qrSize - logoHeight) / 2;
                                const logoPadding = Math.min(logoWidth, logoHeight) * 0.15;

                                ctx.fillStyle = 'white';
                                ctx.fillRect(logoX - logoPadding, logoY - logoPadding, logoWidth + (logoPadding * 2), logoHeight + (logoPadding * 2));
                                ctx.drawImage(img, logoX, logoY, logoWidth, logoHeight);
                                resolve();
                            };
                            img.onerror = () => resolve();
                            img.src = companyLogo;
                        });
                    }

                    const textStartY = padding + qrSize + 40;
                    ctx.fillStyle = 'black';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    const maxTextWidth = totalWidth - (padding * 2);

                    // fitText helper — shrinks font until text fits
                    const fitText = (text: string, startSize: number, bold: boolean): number => {
                        let fontSize = startSize;
                        const prefix = bold ? 'bold ' : '';
                        while (fontSize > 16) {
                            ctx.font = `${prefix}${fontSize}px Arial, sans-serif`;
                            if (ctx.measureText(text).width <= maxTextWidth) break;
                            fontSize -= 2;
                        }
                        return fontSize;
                    };

                    const siteNameUpper = site.name.toUpperCase();
                    const siteFontSize = fitText(siteNameUpper, 38, true);
                    ctx.font = `bold ${siteFontSize}px Arial, sans-serif`;
                    ctx.fillText(siteNameUpper, totalWidth / 2, textStartY);

                    const subFontSize = fitText(subsection.name, 32, false);
                    ctx.font = `${subFontSize}px Arial, sans-serif`;
                    ctx.fillText(subsection.name, totalWidth / 2, textStartY + siteFontSize + 14);

                    const dataUrl = canvas.toDataURL('image/png');
                    qrCodeDataUrls.push({ dataUrl, name: subsection.name });

                    const blob = await new Promise<Blob>((resolve) => {
                        canvas.toBlob((blob) => resolve(blob!), 'image/png');
                    });

                    const fileName = `${site.name}-${subsection.name}-QR.png`.replace(/[^a-zA-Z0-9.-]/g, '_');
                    zip.file(fileName, blob);
                } catch (error) {
                    console.error(`Error generating QR for ${subsection.name}:`, error);
                }
            }

            // Generate PDF using pdfmake
            const cols = 3;
            const qrImagesPerRow: any[] = [];
            
            // Build rows of QR code images
            for (let i = 0; i < qrCodeDataUrls.length; i += cols) {
                const rowImages = qrCodeDataUrls.slice(i, i + cols).map(({ dataUrl }) => ({
                    image: dataUrl,
                    width: 170,
                    margin: [5, 5, 5, 5] as [number, number, number, number]
                }));
                
                // Pad row if needed
                while (rowImages.length < cols) {
                    rowImages.push({ text: '', width: 170 } as any);
                }
                
                qrImagesPerRow.push({
                    columns: rowImages,
                    columnGap: 10
                });
            }

            const docDefinition: any = {
                pageSize: 'A4',
                pageMargins: [20, 20, 20, 20],
                content: [
                    { text: `${site.name} - QR Codes`, style: 'header', alignment: 'center', margin: [0, 0, 0, 20] },
                    ...qrImagesPerRow
                ],
                styles: DEFAULT_STYLES
            };

            const pdfBlob = await generatePdfBlob(docDefinition);
            zip.file(`${site.name}-All-QR-Codes.pdf`.replace(/[^a-zA-Z0-9.-]/g, '_'), pdfBlob);

            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `${site.name}-All-QR-Codes.zip`.replace(/[^a-zA-Z0-9.-]/g, '_');
            link.click();

            toast.success("All QR codes and PDF downloaded!");
        } catch (error) {
            console.error('Error in handleDownloadAll:', error);
            toast.error("Failed to generate download");
        } finally {
            setDownloadingAll(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>QR Codes for All Subsections</CardTitle>
                    <CardDescription>
                        Generate and download QR codes for all subsections on {site.name}
                    </CardDescription>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={handleGenerateAll}
                        disabled={generatingAll || subsections.length === 0}
                        variant="secondary"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${generatingAll ? 'animate-spin' : ''}`} />
                        {generatingAll ? "Generating..." : "Generate All"}
                    </Button>
                    <Button
                        onClick={handleDownloadAll}
                        disabled={downloadingAll || subsections.length === 0}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        {downloadingAll ? "Generating..." : `Download All (${subsections.length})`}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {subsections.length === 0 ? (
                    <div className="text-center py-12">
                        <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No subsections found. Create a subsection to generate QR codes.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {subsections.map((subsection) => (
                            <Card key={subsection.id} className="overflow-hidden">
                                <CardContent className="p-4">
                                    <div className="bg-muted rounded-lg mb-3 flex items-center justify-center relative">
                                        <LabeledQRCode
                                            url={`${window.location.origin.replace(/\/$/, '')}/public/subsections/${subsection.id}`}
                                            siteName={site.name}
                                            subsectionName={subsection.name}
                                            logoUrl={companyLogo || undefined}
                                        />
                                    </div>
                                    <h3 className="font-semibold text-sm mb-1">{subsection.name}</h3>
                                    {subsection.tenant_name && (
                                        <p className="text-xs text-muted-foreground mb-2">{subsection.tenant_name}</p>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={() => {
                                                if (subsection.qr_code_url) {
                                                    const link = document.createElement('a');
                                                    link.href = subsection.qr_code_url;
                                                    link.download = `${site.name}-${subsection.name}-QR.png`;
                                                    link.click();
                                                } else {
                                                    toast.error("QR Code image not available yet. Please generate all QR codes first.");
                                                }
                                            }}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
