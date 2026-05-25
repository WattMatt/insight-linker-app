"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// useOnboardingStatus — shared onboarding lookup for route protectors that
// gate access on whether the user has completed onboarding.
// Previously inlined three times across ProtectedRoute, ClientProtectedRoute,
// ContractorProtectedRoute (EC-7).
export function useOnboardingStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["onboarding-status"],
    enabled,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();
      return data;
    },
  });
}
