"use client";

import { useLayoutEffect, useState } from "react";

/** Muss zur Breakpoint-Erkennung in `MobileAgentPicker` (`use-is-mobile`) passen */
const MOBILE_MQ = "(max-width: 767px)";

export type ResponsiveBreakpoint = "pending" | "mobile" | "desktop";

/**
 * Hydration-safe: SSR + erste Client-Paint-Phase sind immer `pending`, danach echtes Layout.
 */
export function useResponsiveBreakpoint(): ResponsiveBreakpoint {
  const [bp, setBp] = useState<ResponsiveBreakpoint>("pending");

  useLayoutEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = () => setBp(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return bp;
}
