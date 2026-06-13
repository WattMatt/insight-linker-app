"use client";

import { WifiOff, RefreshCw } from "lucide-react";

// PWA offline fallback. The service worker serves this precached page when a navigation
// to an UNCACHED route fails while offline (otherwise the browser shows a blank/error
// page). Lives outside the auth route groups so it renders without a session check.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use. Pages and inspections you&apos;ve already
        opened are still available — anything you change is saved on this device and syncs
        automatically when you&apos;re back online.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
