import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';

interface GenerateQRCodeOptions {
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  logoUrl?: string;
}

export async function generateAndUploadQRCode({
  subsectionId,
  siteName,
  subsectionName,
  logoUrl
}: GenerateQRCodeOptions): Promise<string | null> {
  try {
    // Get QR base URL from settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('qr_base_url')
      .single();
    
    console.log('Settings query result:', { settings, settingsError });
    
    const baseUrl = (settings?.qr_base_url || window.location.origin).replace(/\/$/, '');
    console.log('Using base URL for QR code:', baseUrl);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    const qrSize = 500;
    const padding = 40;
    const borderWidth = 3;
    const textHeight = 140;
    const totalHeight = qrSize + textHeight + (padding * 2);
    const totalWidth = qrSize + (padding * 2);

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');

    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Draw border
    ctx.strokeStyle = 'black';
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(borderWidth / 2, borderWidth / 2, totalWidth - borderWidth, totalHeight - borderWidth);

    // Generate QR code on temporary canvas
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, `${baseUrl}/public/subsections/${subsectionId}`, {
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: 'H'
    });

    // Draw QR code
    ctx.drawImage(qrCanvas, padding, padding, qrSize, qrSize);

    // If logo exists, overlay it in the center
    if (logoUrl) {
      await new Promise<void>((resolve) => {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          // Calculate logo size maintaining aspect ratio
          const maxLogoSize = qrSize * 0.2;
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

          // White background for logo
          ctx.fillStyle = 'white';
          ctx.fillRect(
            logoX - logoPadding,
            logoY - logoPadding,
            logoWidth + (logoPadding * 2),
            logoHeight + (logoPadding * 2)
          );

          // Draw logo
          ctx.drawImage(img, logoX, logoY, logoWidth, logoHeight);
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
    const textStartY = padding + qrSize + 40;
    ctx.fillStyle = 'black';
    ctx.font = 'bold 38px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(siteName.toUpperCase(), totalWidth / 2, textStartY);
    ctx.font = '32px Arial, sans-serif';
    ctx.fillText(subsectionName, totalWidth / 2, textStartY + 52);

    // Convert to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      }, 'image/png');
    });

    // Upload to Supabase storage
    const fileName = `${subsectionId}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('inspection-photos')
      .upload(`qr-codes/${fileName}`, blob, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('inspection-photos')
      .getPublicUrl(`qr-codes/${fileName}`);

    // Update subsection with QR code URL
    const { error: updateError } = await supabase
      .from('subsections')
      .update({ qr_code_url: urlData.publicUrl })
      .eq('id', subsectionId);

    if (updateError) throw updateError;

    console.log('QR code generated and uploaded:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    console.error('Details:', {
      subsectionId,
      siteName,
      subsectionName,
      hasLogo: !!logoUrl,
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}
