"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { recordAuthEvent } from "@/lib/auth-audit";

// useOnboardingStatus — shared onboarding lookup for route protectors that
// gate access on whether the user has completed onboarding.
// Previously inlined three times across ProtectedRoute, ClientProtectedRoute,
// ContractorProtectedRoute (EC-7).
//
// Failure modes (STANDARD D4 — never silently skip):
//   - Missing profiles row (PGRST116 / no row): self-heal by INSERTing the row
//     (own-row INSERT policy exists since 20251014114352) and report
//     onboarding_completed: false so the wizard runs.
//   - Any other error: throw, so callers see isError and can fail SAFE
//     (don't redirect into the wizard, don't block the app).
export function useOnboardingStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["onboarding-status"],
    enabled,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (error) {
        // PGRST116 = zero rows for .single(). The profile row is missing
        // (trigger failure or pre-trigger account) — create it rather than
        // treating the user as onboarded.
        if (error.code === "PGRST116") {
          const { error: insertError } = await supabase
            .from("profiles")
            .insert({ id: user.id, email: user.email ?? "" });
          if (insertError) throw insertError;
          // Best-effort audit trail for the self-heal (fire-and-forget).
          recordAuthEvent("user_created", {
            method: "self",
            reason: "missing_profile_row_self_healed",
          });
          return { onboarding_completed: false };
        }
        throw error;
      }
      return data;
    },
  });
}
