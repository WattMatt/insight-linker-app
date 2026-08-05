"use client";

import { useState, type ReactNode } from "react";
import { OnboardingWizard } from "@/components/OnboardingWizard";

interface Props {
  onboardingStatus: { onboarding_completed: boolean | null } | null | undefined;
  onComplete: () => void;
  children: ReactNode;
}

/**
 * @deprecated Phase 2 (Onboarding Standard D2, 2026-08-05): the overlay-style
 * gate rendered children BENEATH a dismissable-in-DOM modal. It is replaced by
 * the redirect-style gate — ProtectedRoute / ClientProtectedRoute /
 * ContractorProtectedRoute now redirect to the dedicated /onboarding route
 * (src/app/onboarding/page.tsx) while profiles.onboarding_completed is false.
 * No production code imports this component any more; it is retained only as
 * a reference until the next cleanup pass.
 */
// OnboardingGate — wraps children with the OnboardingWizard when the user
// hasn't completed onboarding yet. Extracted from ProtectedRoute,
// ClientProtectedRoute, ContractorProtectedRoute (EC-7).
export function OnboardingGate({ onboardingStatus, onComplete, children }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const show = !!onboardingStatus && !onboardingStatus.onboarding_completed && !dismissed;
  return (
    <>
      {show && (
        <OnboardingWizard
          open={true}
          onComplete={() => {
            setDismissed(true);
            onComplete();
          }}
        />
      )}
      {children}
    </>
  );
}
