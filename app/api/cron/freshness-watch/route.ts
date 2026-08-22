import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { loadSourceFreshness } from "@/lib/admin/source-freshness";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* [개선 #44, 2026-08-22] 데이터 신선도 감시 크론.
 *
 * 실측 배경: 입주물량이 한 달째 정지했는데 아무 경보가 없었다 — 크론 실패가
 * 로그에만 남는 "조용한 부패". 이 라우트가 매일 소스별 최신 적재 시각을 재서
 * 임계를 넘긴 소스를 **오류 로그**로 승격한다(logger.error 는 운영 오류
 * 수집·주간 브리핑이 이미 읽는 채널이다). 이메일·푸시 채널이 붙으면(로드맵
 * #8·#38) 이 판정 결과를 그쪽으로도 흘린다 — 판정은 lib/admin/data-freshness
 * 한 곳이라 채널만 늘리면 된다.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await loadSourceFreshness();
  const stale = rows.filter((r) => r.stale);
  for (const r of stale) {
    logger.error(
      `[freshness-watch] ${r.label}(${r.key}) 적재 정지 — 마지막 ${
        r.lastAt ?? "확인 불가"
      } (임계 ${r.thresholdHours}h). 경로: ${r.pipeline}`,
    );
  }
  return NextResponse.json({
    ok: true,
    checked: rows.length,
    stale: stale.map((r) => ({ key: r.key, lastAt: r.lastAt, ageHours: r.ageHours })),
  });
}
