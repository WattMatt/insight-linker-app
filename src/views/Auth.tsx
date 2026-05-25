"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/LoadingState";

// Auth — backward-compatibility dispatcher.
//
// The /auth route used to be a 757-line god-page handling login, signup,
// forgot-password, invite-acceptance, and password-recovery in one component
// with state-driven conditional rendering. As of EC-1 (2026-05-25) those
// flows live at dedicated routes:
//
//   /auth/login              — sign-in form
//   /auth/signup             — invite-only notice (self-signup is locked)
//   /auth/forgot-password    — request reset
//   /auth/reset-password     — set new password (after recovery token verified)
//   /auth/set-password       — set initial password (after invite accepted)
//
// This component remains at /auth to handle in-flight email links pointing
// to the old URL shape:
//
//   /auth?type=invite&access_token=...   — invite link from invite-user fn
//   /auth?type=recovery&token=...        — recovery link from send-password-reset
//
// Plus the SDK auth state events (PASSWORD_RECOVERY) that can arrive on this
// page when Supabase auto-handles a recovery callback.
//
// Anything else just redirects to /auth/login.

const Auth = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get("type");
    const token = urlParams.get("token");
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hashParams.get("access_token");

    // 1. Invite link: /auth?type=invite + #access_token=...
    if (type === "invite" && accessToken) {
      void handleInviteToken(accessToken);
      return;
    }

    // 2. Recovery link: /auth?type=recovery&token=...
    if (type === "recovery" && token) {
      void handleRecoveryToken(token);
      return;
    }

    // 3. Otherwise — listen briefly for PASSWORD_RECOVERY (SDK auto-handler)
    //    then fall through to /auth/login.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        navigate("/auth/reset-password");
      }
    });

    // 4. Default: redirect to login (or dashboard if already authed —
    //    the /auth/login page handles that case in its own useEffect).
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.user_metadata?.requires_password_change) {
        navigate("/auth/reset-password");
        return;
      }
      navigate("/auth/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleInviteToken(accessToken: string) {
    setStatus("Verifying invite link...");
    // MED #6: scrub the token from window.location BEFORE the async
    // setSession runs. Any concurrent effect / analytics script / Sentry
    // breadcrumb that captures `window.location` during the await window
    // would otherwise see the token. Capture-then-clear-then-use.
    window.history.replaceState({}, document.title, "/auth");
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: accessToken,
    });

    if (error || !data.session) {
      toast.error("Invalid or expired invite link. Ask your admin for a new one.", {
        duration: 6000,
      });
      navigate("/auth/login");
      return;
    }

    navigate("/auth/set-password");
  }

  async function handleRecoveryToken(tokenHash: string) {
    setStatus("Verifying reset link...");
    // MED #6: same scrub-first pattern as handleInviteToken.
    window.history.replaceState({}, document.title, "/auth");
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (error || !data.session) {
      toast.error("Invalid or expired reset link. Request a new one below.", {
        duration: 8000,
      });
      navigate("/auth/forgot-password");
      return;
    }

    navigate("/auth/reset-password");
  }

  return <LoadingState variant="full-page" message={status} />;
};

export default Auth;
