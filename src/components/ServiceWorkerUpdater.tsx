"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Watches the PWA service worker for a new version and shows a one-tap "Reload" prompt.
 *
 * The app precaches itself via next-pwa/workbox, so once a tab is open it keeps running the
 * already-loaded JS until the page reloads — even after a new deploy. This component checks
 * for a newer service worker (on mount, on focus, and on an interval) and, when one has
 * installed, surfaces a persistent toast so the user can reload into the latest build instead
 * of having to manually clear caches.
 */
export function ServiceWorkerUpdater() {
  const promptedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const promptReload = () => {
      if (promptedRef.current) return;
      promptedRef.current = true;
      toast("A new version is available", {
        description: "Reload to get the latest updates.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => window.location.reload(),
        },
      });
    };

    let registration: ServiceWorkerRegistration | undefined;

    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // A new worker reaching "installed" while another already controls the page means an
        // update is ready (vs. the very first install, where there is no controller yet).
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          promptReload();
        }
      });
    };

    const onUpdateFound = () => watchInstalling(registration?.installing ?? null);

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg) return;
        registration = reg;
        // A worker already waiting/installing at mount is also an available update.
        if (reg.waiting && navigator.serviceWorker.controller) promptReload();
        watchInstalling(reg.installing);
        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {
        /* no registration yet — nothing to watch */
      });

    // Proactively poll for a new service worker so deploys are noticed without a manual refresh.
    const checkForUpdate = () =>
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(checkForUpdate, 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  return null;
}
