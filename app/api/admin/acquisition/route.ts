import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAcquisitionSignups } from "@/lib/admin/business-dashboards";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/** 조회가 실패한 것을 "0건"으로 그리지 않기 위한 안내. */
const UNAVAILABLE = "지금은 데이터를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await auth();
  if (!s?.user?.email || s.user.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
  }
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? "30")));
  /* 못 읽은 것을 "가입 유입 0건"으로 그리지 않는다 — 마케팅 판단이 뒤집힌다. */
  try {
    const rows = await listAcquisitionSignups(days);
    return NextResponse.json({ rows, days });
  } catch (err) {
    return dbUnavailable("유입 통계 조회 실패", err, UNAVAILABLE);
  }
}
