import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google API endpoints
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1/documents';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface InspectionSection {
  title: string;
  items: Array<{
    label: string;
    value: string;
    notes?: string;
    photos?: string[];
  }>;
}

interface InspectionData {
  inspectionId: string;
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  sections?: InspectionSection[];
  subsectionName?: string;
}

// Generate JWT for Google API authentication
async function generateGoogleJWT(serviceAccount: ServiceAccount, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: scope,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: exp,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signInput = `${headerB64}.${payloadB64}`;

  // Import the private key
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  let pemContents = serviceAccount.private_key;
  pemContents = pemContents.replace(pemHeader, '').replace(pemFooter, '').replace(/\\n/g, '\n').replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signInput}.${signatureB64}`;
}

// Get access token from JWT
async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const scope = 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file';
  const jwt = await generateGoogleJWT(serviceAccount, scope);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token error:', error);
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Create a new Google Doc using Drive API (service accounts have better permission here)
async function createGoogleDoc(accessToken: string, title: string): Promise<string> {
  console.log('Attempting to create Google Doc via Drive API with title:', title);
  
  // Use Drive API to create a Google Doc (more reliable for service accounts)
  const response = await fetch(GOOGLE_DRIVE_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    }),
  });

  console.log('Google Drive API response status:', response.status);
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Google Drive API error response:', error);
    throw new Error(`Failed to create doc: ${error}`);
  }

  const file = await response.json();
  console.log('Created Google Doc via Drive:', file.id);
  return file.id;
}

// Upload image to Google Drive and get inline object ID
async function uploadImageToDrive(accessToken: string, imageUrl: string, fileName: string): Promise<string | null> {
  try {
    console.log(`Uploading image: ${fileName}`);
    
    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.warn(`Failed to fetch image: ${imageUrl}`);
      return null;
    }
    
    const imageBlob = await imageResponse.blob();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    // Create file metadata
    const metadata = {
      name: fileName,
      mimeType: contentType,
    };

    // Upload to Drive using resumable upload
    const initResponse = await fetch(`${GOOGLE_UPLOAD_API}?uploadType=resumable`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': contentType,
      },
      body: JSON.stringify(metadata),
    });

    if (!initResponse.ok) {
      console.warn(`Failed to init upload: ${await initResponse.text()}`);
      return null;
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      console.warn('No upload URL returned');
      return null;
    }

    // Upload the actual file
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: imageBlob,
    });

    if (!uploadResponse.ok) {
      console.warn(`Failed to upload: ${await uploadResponse.text()}`);
      return null;
    }

    const file = await uploadResponse.json();
    console.log(`Uploaded image: ${file.id}`);
    
    // Make the file publicly accessible for embedding
    await fetch(`${GOOGLE_DRIVE_API}/${file.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    });

    return file.id;
  } catch (error) {
    console.error(`Error uploading image:`, error);
    return null;
  }
}

// Build document content with images
async function buildDocumentContent(
  accessToken: string,
  docId: string,
  inspection: InspectionData,
  siteName: string,
  clientName?: string
): Promise<void> {
  const requests: any[] = [];
  let currentIndex = 1; // Start after the initial newline

  // Helper to add text
  const addText = (text: string, bold = false, fontSize = 11) => {
    const endIndex = currentIndex + text.length;
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: text,
      },
    });
    if (bold || fontSize !== 11) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: currentIndex, endIndex },
          textStyle: {
            bold: bold,
            fontSize: { magnitude: fontSize, unit: 'PT' },
          },
          fields: bold ? 'bold,fontSize' : 'fontSize',
        },
      });
    }
    currentIndex = endIndex;
  };

  const addNewline = () => {
    requests.push({
      insertText: {
        location: { index: currentIndex },
        text: '\n',
      },
    });
    currentIndex += 1;
  };

  // Title
  addText('ELECTRICAL INSPECTION REPORT', true, 18);
  addNewline();
  addNewline();

  // Header info
  addText(`Site: ${siteName}`, true, 14);
  addNewline();
  if (clientName) {
    addText(`Client: ${clientName}`, false, 12);
    addNewline();
  }
  if (inspection.subsectionName) {
    addText(`Location: ${inspection.subsectionName}`, false, 12);
    addNewline();
  }
  if (inspection.templateName) {
    addText(`Template: ${inspection.templateName}`, false, 12);
    addNewline();
  }
  if (inspection.inspectorName) {
    addText(`Inspector: ${inspection.inspectorName}`, false, 12);
    addNewline();
  }
  if (inspection.inspectionDate) {
    addText(`Date: ${inspection.inspectionDate}`, false, 12);
    addNewline();
  }
  addNewline();

  // Sections
  if (inspection.sections) {
    for (const section of inspection.sections) {
      addText(section.title, true, 14);
      addNewline();
      addNewline();

      for (const item of section.items) {
        addText(`${item.label}: `, true, 11);
        addText(`${item.value}`, false, 11);
        addNewline();

        if (item.notes) {
          addText(`  Notes: ${item.notes}`, false, 10);
          addNewline();
        }

        // Handle photos - we'll add placeholders and insert images after
        if (item.photos && item.photos.length > 0) {
          addText(`  Photos: ${item.photos.length} attached`, false, 10);
          addNewline();
        }

        addNewline();
      }
    }
  }

  // Execute text requests first
  if (requests.length > 0) {
    console.log(`Executing ${requests.length} text requests`);
    const response = await fetch(`${GOOGLE_DOCS_API}/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Doc update error:', error);
      throw new Error(`Failed to update doc: ${error}`);
    }
  }

  // Now add images
  const imageRequests: any[] = [];
  let imageIndex = currentIndex;

  if (inspection.sections) {
    for (const section of inspection.sections) {
      for (const item of section.items) {
        if (item.photos && item.photos.length > 0) {
          for (const photoUrl of item.photos.slice(0, 2)) { // Limit to 2 per item
            // Upload image to Drive first
            const fileId = await uploadImageToDrive(
              accessToken,
              photoUrl,
              `photo_${Date.now()}.jpg`
            );

            if (fileId) {
              imageRequests.push({
                insertInlineImage: {
                  location: { index: imageIndex },
                  uri: `https://drive.google.com/uc?id=${fileId}`,
                  objectSize: {
                    height: { magnitude: 150, unit: 'PT' },
                    width: { magnitude: 200, unit: 'PT' },
                  },
                },
              });
              imageIndex += 1;
            }
          }
        }
      }
    }
  }

  // Execute image requests
  if (imageRequests.length > 0) {
    console.log(`Inserting ${imageRequests.length} images`);
    const imgResponse = await fetch(`${GOOGLE_DOCS_API}/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: imageRequests }),
    });

    if (!imgResponse.ok) {
      console.warn('Image insertion warning:', await imgResponse.text());
      // Don't fail on image errors
    }
  }
}

// Export Google Doc as PDF
async function exportAsPdf(accessToken: string, docId: string): Promise<Uint8Array> {
  const response = await fetch(
    `${GOOGLE_DRIVE_API}/${docId}/export?mimeType=application/pdf`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to export PDF: ${error}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

// Delete temp Google Doc
async function deleteGoogleDoc(accessToken: string, docId: string): Promise<void> {
  await fetch(`${GOOGLE_DRIVE_API}/${docId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  console.log('Deleted temp doc:', docId);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
    }

    const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
    console.log('Using service account:', serviceAccount.client_email);

    const body = await req.json();
    const { inspection, siteName, clientName, siteLogoUrl } = body;

    if (!inspection) {
      throw new Error('Missing inspection data');
    }

    console.log('Generating PDF for:', siteName);
    console.log('Sections:', inspection.sections?.length || 0);

    // Count total photos
    let totalPhotos = 0;
    if (inspection.sections) {
      for (const section of inspection.sections) {
        for (const item of section.items || []) {
          totalPhotos += (item.photos?.length || 0);
        }
      }
    }
    console.log('Total photos to embed:', totalPhotos);

    // Get access token
    const accessToken = await getAccessToken(serviceAccount);
    console.log('Got access token');

    // Create Google Doc
    const docTitle = `Inspection_${siteName}_${new Date().toISOString().split('T')[0]}`;
    const docId = await createGoogleDoc(accessToken, docTitle);

    // Build document content with images
    await buildDocumentContent(accessToken, docId, inspection, siteName, clientName);

    // Export as PDF
    console.log('Exporting as PDF...');
    const pdfBytes = await exportAsPdf(accessToken, docId);
    console.log('PDF size:', Math.round(pdfBytes.length / 1024), 'KB');

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fileName = `Inspection_Report_${siteName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: publicUrl } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log('PDF saved to:', publicUrl.publicUrl);

    // Clean up temp Google Doc
    await deleteGoogleDoc(accessToken, docId);

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl.publicUrl,
        filename: fileName,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
