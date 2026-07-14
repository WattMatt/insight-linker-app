/**
 * Single source of truth for online/offline state.
 *
 * Five hooks currently each register their own online/offline/focus/visibilitychange
 * listeners and keep private copies of navigator.onLine (useOfflineSync,
 * useOfflineInspectionDetail, useOfflinePhotos, useOfflineSubsections,
 * useOfflineFloorPlanAnnotations). This hook replaces all of those copies with one
 * useSyncExternalStore subscription — same value everywhere, one set of listeners,
 * and correct SSR behaviour (assumes online on the server, matching current code).
 */
import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);
  // Browsers can miss transitions while the tab is backgrounded (common on the
  // Capacitor WebView when the device sleeps mid-inspection) — re-read on return.
  window.addEventListener("focus", onStoreChange);
  document.addEventListener("visibilitychange", onStoreChange);
  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
    document.removeEventListener("visibilitychange", onStoreChange);
  };
}

export function getOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getOnline, () => true);
}
