"use client";

import { Suspense } from "react";
import { LoadingState } from "@/components/LoadingState";
import ClientProtectedRoute from "@/components/ClientProtectedRoute";
import { ClientPortalLayout } from "@/components/ClientPortalLayout";

function ClientPortalInner({ children }: { children: React.ReactNode }) {
  return (
    <ClientProtectedRoute>
      <ClientPortalLayout>
        {children}
      </ClientPortalLayout>
    </ClientProtectedRoute>
  );
}

export default function ClientPortalGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}>
      <ClientPortalInner>{children}</ClientPortalInner>
    </Suspense>
  );
}
