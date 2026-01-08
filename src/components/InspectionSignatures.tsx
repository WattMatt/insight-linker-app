import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignatureCapture } from "./SignatureCapture";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, PenTool } from "lucide-react";

interface SignatureData {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_email: string | null;
  signature_data: string;
  signature_url: string | null;
  signed_at: string;
}

interface InspectionSignaturesProps {
  inspectionId: string;
  onSignaturesChange?: (signatures: SignatureData[]) => void;
}

export const InspectionSignatures = ({
  inspectionId,
  onSignaturesChange,
}: InspectionSignaturesProps) => {
  const [signatures, setSignatures] = useState<SignatureData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSignatures();
  }, [inspectionId]);

  const fetchSignatures = async () => {
    try {
      const { data, error } = await supabase
        .from("inspection_signatures")
        .select("*")
        .eq("inspection_id", inspectionId);

      if (error) throw error;

      setSignatures(data || []);
      if (onSignaturesChange) {
        onSignaturesChange(data || []);
      }
    } catch (error) {
      console.error("Error fetching signatures:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureSaved = (newSignature: SignatureData) => {
    setSignatures((prev) => {
      const filtered = prev.filter(
        (s) => s.signer_type !== newSignature.signer_type
      );
      const updated = [...filtered, newSignature];
      if (onSignaturesChange) {
        onSignaturesChange(updated);
      }
      return updated;
    });
  };

  const getSignatureByType = (type: string) => {
    return signatures.find((s) => s.signer_type === type) || null;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenTool className="h-5 w-5" />
          Sign-Off Signatures
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <SignatureCapture
            inspectionId={inspectionId}
            signerType="inspector"
            title="Inspector Signature"
            existingSignature={getSignatureByType("inspector")}
            onSignatureSaved={handleSignatureSaved}
          />
          <SignatureCapture
            inspectionId={inspectionId}
            signerType="contractor"
            title="Contractor Signature"
            existingSignature={getSignatureByType("contractor")}
            onSignatureSaved={handleSignatureSaved}
          />
          <SignatureCapture
            inspectionId={inspectionId}
            signerType="client"
            title="Client Representative"
            existingSignature={getSignatureByType("client")}
            onSignatureSaved={handleSignatureSaved}
          />
          <SignatureCapture
            inspectionId={inspectionId}
            signerType="witness"
            title="Witness Signature"
            existingSignature={getSignatureByType("witness")}
            onSignatureSaved={handleSignatureSaved}
          />
        </div>
      </CardContent>
    </Card>
  );
};
