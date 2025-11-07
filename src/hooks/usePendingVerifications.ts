import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function usePendingVerifications() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  return useQuery({
    queryKey: ['pending-verifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      const { data, error } = await supabase.rpc('get_pending_verifications', {
        user_uuid: userId
      });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    refetchInterval: 30000, // Check every 30 seconds
  });
}
