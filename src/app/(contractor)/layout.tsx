"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import ContractorProtectedRoute from "@/components/ContractorProtectedRoute";

function ContractorInner({ children }: { children: React.ReactNode }) {
  return (
    <ContractorProtectedRoute>
      {children}
    </ContractorProtectedRoute>
  );
}

export default function ContractorGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}>
      <ContractorInner>{children}</ContractorInner>
    </Suspense>
  );
}
