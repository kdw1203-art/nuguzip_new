import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAcquisitionSignups } from "@/lib/admin/business-dashboards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "30")));
  const rows = await listAcquisitionSignups(days);
  return NextResponse.json({ rows, days });
}
