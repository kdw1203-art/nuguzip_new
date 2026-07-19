import type { Breakpoint } from "@/lib/design/breakpoints";
import { BREAKPOINT_PX, inferInitialDevice } from "@/lib/design/breakpoints";

export type ViewportWidthBucket = 360 | 390 | 768 | 1024 | 1280 | 1440 | "other";

export type ViewportAnalyticsContext = {
  device_type: "mobile" | "tablet" | "desktop";
  viewport_group: Breakpoint;
  viewport_width: number;
  viewport_width_bucket: ViewportWidthBucket;
  entry_route: string;
};

const ENTRY_KEY = "nuguzip_entry_route";

export function viewportWidthBucket(width: number): ViewportWidthBucket {
  const targets = [360, 390, 768, 1024, 1280, 1440] as const;
  let best: (typeof targets)[number] | null = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = Math.abs(width - t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best != null && bestDist <= 40 ? best : "other";
}

export function breakpointFromWidth(width: number): Breakpoint {
  if (width >= BREAKPOINT_PX.desktopMin) return "desktop";
  if (width >= BREAKPOINT_PX.tabletMin) return "tablet";
  return "mobile";
}

export function buildViewportAnalyticsContext(
  width: number,
  userAgent?: string | null,
): Omit<ViewportAnalyticsContext, "entry_route"> {
  const viewport_group = breakpointFromWidth(width);
  const uaMobile = inferInitialDevice(userAgent ?? null) === "mobile";
  const device_type =
    viewport_group === "desktop"
      ? "desktop"
      : viewport_group === "tablet"
        ? "tablet"
        : uaMobile
          ? "mobile"
          : "mobile";

  return {
    device_type,
    viewport_group,
    viewport_width: width,
    viewport_width_bucket: viewportWidthBucket(width),
  };
}

export function getOrSetEntryRoute(pathname: string, search = ""): string {
  if (typeof window === "undefined") return pathname;
  try {
    const existing = sessionStorage.getItem(ENTRY_KEY);
    if (existing) return existing;
    const entry = `${pathname}${search}` || "/";
    sessionStorage.setItem(ENTRY_KEY, entry);
    return entry;
  } catch {
    return pathname;
  }
}

export function withViewportMetadata(
  metadata: Record<string, unknown> = {},
  ctx?: Partial<ViewportAnalyticsContext>,
): Record<string, unknown> {
  if (!ctx) return metadata;
  return {
    ...metadata,
    device_type: ctx.device_type,
    viewport_group: ctx.viewport_group,
    viewport_width: ctx.viewport_width,
    viewport_width_bucket: ctx.viewport_width_bucket,
    entry_route: ctx.entry_route,
  };
}
