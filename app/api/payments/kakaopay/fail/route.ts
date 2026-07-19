import { NextRequest, NextResponse } from "next/server";
import { markFailed } from "@/lib/payments/store";
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
  if (orderId) await markFailed(orderId);
  const q = orderId
    ? `?orderId=${encodeURIComponent(orderId)}&provider=kakaopay`
    : "?provider=kakaopay";
  return NextResponse.redirect(`${base}/payment/fail${q}`);
}
