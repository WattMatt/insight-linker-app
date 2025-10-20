import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LabeledQRCodeProps {
  url: string;
  siteName: string;
  subsectionName: string;
  logoUrl?: string;
  onGenerated?: (dataUrl: string) => void;
}

export const LabeledQRCode = ({ 
  url, 
  siteName, 
  subsectionName, 
  logoUrl,
  onGenerated 
}: LabeledQRCodeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    generateLabeledQRCode();
  }, [url, siteName, subsectionName, logoUrl]);

  const generateLabeledQRCode = async () => {
    if (!canvasRef.current) return;
    
    setIsGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // Canvas dimensions
      const qrSize = 500;
      const padding = 40;
      const borderWidth = 3;
      const textHeight = 120;
      const totalHeight = qrSize + textHeight + (padding * 2);
      const totalWidth = qrSize + (padding * 2);

      canvas.width = totalWidth;
      canvas.height = totalHeight;

      // Fill white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // Draw border
      ctx.strokeStyle = 'black';
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(borderWidth / 2, borderWidth / 2, totalWidth - borderWidth, totalHeight - borderWidth);

      // Generate QR code on temporary canvas
      const qrCanvas = document.createElement('canvas');
      await QRCode.toCanvas(qrCanvas, url, {
        width: qrSize,
        margin: 1,
        errorCorrectionLevel: 'H'
      });

      // Draw QR code
      ctx.drawImage(qrCanvas, padding, padding, qrSize, qrSize);

      // If logo exists, overlay it
      if (logoUrl) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          img.onload = () => {
            const logoSize = qrSize * 0.18;
            const logoX = padding + (qrSize - logoSize) / 2;
            const logoY = padding + (qrSize - logoSize) / 2;
            const logoPadding = logoSize * 0.15;

            // White background for logo
            ctx.fillStyle = 'white';
            ctx.fillRect(
              logoX - logoPadding,
              logoY - logoPadding,
              logoSize + (logoPadding * 2),
              logoSize + (logoPadding * 2)
            );

            // Draw logo
            ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
            resolve();
          };

          img.onerror = () => {
            console.error('Failed to load logo');
            resolve();
          };

          img.src = logoUrl;
        });
      }

      // Draw text labels below QR code
      const textY = padding + qrSize + 35;
      
      // Site name (larger, bold, uppercase)
      ctx.fillStyle = 'black';
      ctx.font = 'bold 36px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const siteNameUpper = siteName.toUpperCase();
      ctx.fillText(siteNameUpper, totalWidth / 2, textY);

      // Subsection name (slightly smaller)
      ctx.font = '30px Arial, sans-serif';
      ctx.fillText(subsectionName, totalWidth / 2, textY + 50);

      const dataUrl = canvas.toDataURL('image/png');
      setGeneratedUrl(dataUrl);
      if (onGenerated) {
        onGenerated(dataUrl);
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate QR code',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedUrl) return;
    
    const link = document.createElement('a');
    link.download = `${siteName}-${subsectionName}-QR.png`;
    link.href = generatedUrl;
    link.click();
    
    toast({
      title: 'Success',
      description: 'QR code downloaded',
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className="border-2 border-border rounded-lg shadow-md bg-white"
        style={{ 
          maxWidth: '100%', 
          height: 'auto',
          display: 'block'
        }}
      />
      {isGenerating && (
        <p className="text-sm text-muted-foreground">Generating QR code...</p>
      )}
      {generatedUrl && !isGenerating && (
        <Button onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download QR Code
        </Button>
      )}
    </div>
  );
};
