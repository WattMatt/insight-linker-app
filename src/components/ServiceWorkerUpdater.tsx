"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Watches the PWA service worker for a new version and applies it with minimal disruption.
 *
 * The app precaches itself via next-pwa/workbox, so an open tab keeps running the already-loaded
 * JS until it reloads — even after a new deploy. A long-lived tab can therefore sit on stale code
 * indefinitely (a plain hard-refresh often does NOT update a service-worker-precached app).
 *
 * When a newer service worker is ready this component:
 *   1. shows a one-tap "Reload" toast so the user can update immediately, and
 *   2. auto-reloads the moment the tab is backgrounded (hidden) — a safe point that never
 *      interrupts active work — UNLESS a form field is focused (the user may be mid-edit), in
 *      which case it waits for the next safe moment.
 *
 * Updates are detected on mount, on focus, and on a 60s interval (which runs even while hidden,
 * so a backgrounded tab still picks up and applies new deploys).
 */
export function ServiceWorkerUpdater() {
  const promptedRef = useRef(false);
  const updateReadyRef = useRef(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const reload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    // Don't auto-reload out from under someone who is typing — their unsaved input would be lost.
    const isEditing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const onUpdateReady = () => {
      updateReadyRef.current = true;
      // If the tab is already backgrounded and nothing is being edited, apply it right away.
      if (document.visibilityState === "hidden" && !isEditing()) {
        reload();
        return;
      }
      // Foreground: offer an immediate manual reload (kept persistent until taken).
      if (!promptedRef.current) {
        promptedRef.current = true;
        toast("A new version is available", {
          description: "Reload to get the latest updates.",
          duration: Infinity,
          action: { label: "Reload", onClick: reload },
        });
      }
    };

    let registration: ServiceWorkerRegistration | undefined;

    const watchInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // A new worker reaching "installed" while another already controls the page means an
        // update is ready (vs. the very first install, where there is no controller yet).
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          onUpdateReady();
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
        if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();
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

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Tab backgrounded: a safe moment to apply a pending update (nothing on screen to disrupt).
        if (updateReadyRef.current && !isEditing()) reload();
      } else {
        checkForUpdate();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(checkForUpdate, 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
      registration?.removeEventListener("updatefound", onUpdateFound);
    };
  }, []);

  return null;
}
