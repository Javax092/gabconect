"use client";

import { useEffect } from "react";

const RESET_VERSION = "2026-05-20";
const RESET_FLAG = `gc-legacy-cache-reset:${RESET_VERSION}`;

export function LegacyCacheReset() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.sessionStorage.getItem(RESET_FLAG) === "done") {
      return;
    }

    const resetLegacyCaches = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ("caches" in window) {
          const cacheKeys = await window.caches.keys();
          await Promise.all(cacheKeys.map((cacheKey) => window.caches.delete(cacheKey)));
        }

        window.sessionStorage.setItem(RESET_FLAG, "done");
      } catch (error) {
        console.warn("[legacy-cache-reset] cleanup failed", error);
      }
    };

    void resetLegacyCaches();
  }, []);

  return null;
}
