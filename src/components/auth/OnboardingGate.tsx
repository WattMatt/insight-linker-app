"use client";

import { useState, type ReactNode } from "react";
import { OnboardingWizard } from "@/components/OnboardingWizard";

interface Props {
  onboardingStatus: { onboarding_completed: boolean | null } | null | undefined;
  onComplete: () => void;
  children: ReactNode;
}

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
