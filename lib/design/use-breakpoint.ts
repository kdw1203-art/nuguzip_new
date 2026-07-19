"use client";

import { useSyncExternalStore } from "react";
import {
  BREAKPOINT_MEDIA,
  type Breakpoint,
} from "@/lib/design/breakpoints";

function tierFromWidth(width: number): Breakpoint {
  if (width >= 1280) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mqls = [
    window.matchMedia(BREAKPOINT_MEDIA.mobile),
    window.matchMedia(BREAKPOINT_MEDIA.tablet),
    window.matchMedia(BREAKPOINT_MEDIA.desktop),
  ];
  mqls.forEach((m) => m.addEventListener("change", cb));
  window.addEventListener("resize", cb);
  return () => {
    mqls.forEach((m) => m.removeEventListener("change", cb));
    window.removeEventListener("resize", cb);
  };
}

function getSnapshot(): Breakpoint {
  if (typeof window === "undefined") return "mobile";
  return tierFromWidth(window.innerWidth);
}

function getServerSnapshot(): Breakpoint {
  return "mobile";
}

/**
 * matchMedia 기반 breakpoint — Mobile 0–767 / Tablet 768–1279 / Desktop 1280+
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function matchBreakpoint(tier: Breakpoint): boolean {
  if (typeof window === "undefined") return tier === "mobile";
  return window.matchMedia(BREAKPOINT_MEDIA[tier]).matches;
}
