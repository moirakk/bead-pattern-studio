"use client";

import { useEffect } from "react";

export function PwaInstaller() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains fully usable if registration is blocked by the browser.
    });
  }, []);

  return null;
}
