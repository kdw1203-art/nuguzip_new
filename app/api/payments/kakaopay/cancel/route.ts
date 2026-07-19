import { NextRequest, NextResponse } from "next/server";
import { desktopBaseUrl, resolvePublicOriginFromHeaders } from "@/lib/platform-shell";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const base = (() => {
    try {
      return resolvePublicOriginFromHeaders(req.headers);
    } catch {
      return desktopBaseUrl();
    }
  })();
  const orderId = new URL(req.url).searchParams.get("order_id");
  return NextResponse.redirect(
    `${base}/pricing${orderId ? `?checkout=cancel&orderId=${encodeURIComponent(orderId)}` : ""}`,
  );
}
