"use client";

import { Suspense } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { LoadingState } from "@/components/LoadingState";
import ProtectedRoute from "@/components/ProtectedRoute";

function AdminInner({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <main className="flex-1 flex flex-col w-full max-h-screen overflow-hidden">
            <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6 flex-shrink-0">
              <SidebarTrigger className="h-10 w-10" />
              <h1 className="text-lg font-semibold md:text-xl">Electrical Compliance</h1>
              <div className="flex-1 flex justify-end">
                <GlobalSearch />
              </div>
            </header>
            <div
              className="flex-1 p-3 md:p-4 lg:p-6 overflow-x-hidden overflow-y-auto overscroll-y-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </ProtectedRoute>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}>
      <AdminInner>{children}</AdminInner>
    </Suspense>
  );
}
