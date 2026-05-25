"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// useAuthSession — shared session-state hook for route protectors.
// Subscribes to Supabase auth state changes and exposes:
//   session    — current session (or null when signed out)
//   isLoading  — true until the first auth state check completes
//
// Previously inlined four times across ProtectedRoute, AuthOnlyRoute,
// ClientProtectedRoute, ContractorProtectedRoute (EC-7).
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setIsLoading(false);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { session, isLoading };
}
