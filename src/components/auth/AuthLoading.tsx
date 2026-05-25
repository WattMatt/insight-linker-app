"use client";

import { Skeleton } from "@/components/ui/skeleton";

// AuthLoading — shared loading state for route protectors. Two variants
// match the existing UI: 'spinner' (used by ProtectedRoute, AuthOnlyRoute)
// and 'skeleton' (used by ClientProtectedRoute, ContractorProtectedRoute).
// Extracted as part of EC-7.
export function AuthLoading({ variant = "spinner" }: { variant?: "spinner" | "skeleton" }) {
  if (variant === "skeleton") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-md p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
