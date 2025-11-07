import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { VerificationDialog } from "./VerificationDialog";

interface PendingVerification {
  id: string;
  type: 'issue' | 'suggestion';
  title: string;
  description: string;
  resolved_at: string;
}

export function VerificationListener() {
  const [pendingVerifications, setPendingVerifications] = useState<PendingVerification[]>([]);
  const [currentVerification, setCurrentVerification] = useState<PendingVerification | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    checkPendingVerifications();
  }, []);

  const checkPendingVerifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_pending_verifications', {
        user_uuid: user.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const verifications = data.map(v => ({
          ...v,
          type: v.type as 'issue' | 'suggestion'
        }));
        setPendingVerifications(verifications);
        setCurrentVerification(verifications[0]);
        setDialogOpen(true);
      }
    } catch (error) {
      console.error('Error checking pending verifications:', error);
    }
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleVerified = () => {
    // Remove current verification and show next one if available
    const remaining = pendingVerifications.slice(1);
    setPendingVerifications(remaining);
    
    if (remaining.length > 0) {
      setCurrentVerification(remaining[0]);
      setDialogOpen(true);
    } else {
      setCurrentVerification(null);
      setDialogOpen(false);
    }
  };

  return (
    <VerificationDialog
      verification={currentVerification}
      open={dialogOpen}
      onClose={handleClose}
      onVerified={handleVerified}
    />
  );
}
