"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { HelpButton } from "@/components/HelpButton";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { NotificationListener } from "@/components/NotificationListener";
import { VerificationListener } from "@/components/VerificationListener";
import { SessionWatcher } from "@/components/SessionWatcher";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <HelpButton />
          <NotificationListener />
          <VerificationListener />
          <OfflineIndicator />
          <SessionWatcher />
          {children}
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
