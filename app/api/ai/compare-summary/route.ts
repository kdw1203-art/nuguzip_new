/**
 * POST /api/ai/compare-summary
 * 후보 단지 비교 하단 — 담긴 후보들의 지역 실시세 스냅샷(전월 대비·전세가율) 병합
 * + 종합 코멘트 생성 (LLM 가능 시 LLM, 아니면 규칙 기반 — mode 로 구분).
 *
 * body: { regions: string[] }  // 지역명 자유 표기 (예: "안양시 동안구", "강남구")
 * 사용량: AI 실행 10회/시간/IP (rateLimit — 임장노트 분석과 동일 예산 공유)
 */
import { NextResponse } from "next/server";
import {
  AI_DISCLAIMER,
  describeSnapshot,
  formatEokWon,
  resolveRegionSnapshotByName,
  tryLlmText,
  type AnalysisRegionSnapshot,
} from "@/lib/ai/market-insight";
import { getClientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

function ruleComment(snaps: AnalysisRegionSnapshot[]): string {
  if (snaps.length === 0) {
    return "비교 대상 지역의 실시세 데이터가 아직 없어요. 시세 수집 후 다시 확인해 주세요.";
  }
  const parts: string[] = [];
  const withChange = snaps.filter((s) => s.saleChangeMonthly !== null);
  if (withChange.length > 0) {
    const softest = [...withChange].sort(
      (a, b) => (a.saleChangeMonthly ?? 0) - (b.saleChangeMonthly ?? 0),
    )[0];
    const hottest = [...withChange].sort(
      (a, b) => (b.saleChangeMonthly ?? 0) - (a.saleChangeMonthly ?? 0),
    )[0];
    if ((softest.saleChangeMonthly ?? 0) < 0) {
      parts.push(
        `${softest.regionName}는 전월 대비 ${Math.abs(softest.saleChangeMonthly ?? 0).toFixed(1)}% 조정 중이라 가격 협상 여지가 상대적으로 큽니다`,
      );
    }
    if (hottest !== softest && (hottest.saleChangeMonthly ?? 0) > 0) {
      parts.push(
        `${hottest.regionName}는 ${((hottest.saleChangeMonthly ?? 0)).toFixed(1)}% 상승 흐름이라 추격 매수 부담을 함께 고려하세요`,
      );
    }
  }
  const withJr = snaps.filter((s) => s.jeonseRatio !== null);
  if (withJr.length > 0) {
    const best = [...withJr].sort((a, b) => (b.jeonseRatio ?? 0) - (a.jeonseRatio ?? 0))[0];
    parts.push(
      `전세가율은 ${best.regionName} ${((best.jeonseRatio ?? 0)).toFixed(0)}%가 가장 높아 갭 부담이 가장 작습니다`,
    );
  }
  if (parts.length === 0) {
    parts.push(
      snaps
        .map((s) =>
          s.avgSaleWon
            ? `${s.regionName} 평균 ${formatEokWon(s.avgSaleWon)}`
            : s.regionName,
        )
        .join(", ") + " 기준으로 예산 대비 후보를 좁혀 보세요",
    );
  }
  return parts.join(". ") + ".";
}

export async function POST(req: Request) {
  const rl = rateLimit(`ai-exec:${getClientIp(req)}`, {
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const body = (await req.json().catch(() => ({}))) as { regions?: unknown };
  const names = [
    ...new Set(
      (Array.isArray(body.regions) ? body.regions : [])
        .map((r) => String(r ?? "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (names.length === 0) {
    return NextResponse.json({ error: "regions가 비어 있습니다." }, { status: 400 });
  }

  const resolved = await Promise.all(names.map((n) => resolveRegionSnapshotByName(n)));
  // 동일 지역으로 매칭된 중복 제거
  const seen = new Set<string>();
  const snapshots: AnalysisRegionSnapshot[] = [];
  for (const snap of resolved) {
    if (!snap || seen.has(snap.regionId)) continue;
    seen.add(snap.regionId);
    snapshots.push(snap);
  }

  const fallback = ruleComment(snapshots);
  let comment = fallback;
  let mode: "llm" | "rule" = "rule";
  let engine: string | null = null;

  if (snapshots.length > 0) {
    const llm = await tryLlmText(
      "당신은 nuguzip.com의 한국어 부동산 비교 분석 보조 AI입니다. 과장·투자 권유 없이, 제공된 지역 실시세만 근거로 3~4문장 종합 코멘트를 평문 한 단락으로 작성하세요.",
      [
        "다음 후보 지역들의 실시세 스냅샷을 비교해 종합 코멘트를 작성해 주세요.",
        ...snapshots.map((s) => `- ${describeSnapshot(s)}`),
      ].join("\n"),
    );
    if (llm) {
      comment = llm.text;
      mode = "llm";
      engine = llm.engine;
    }
  }

  return NextResponse.json({
    items: snapshots.map((s) => ({
      regionId: s.regionId,
      regionName: s.regionName,
      period: s.period,
      source: s.source,
      avgSaleLabel: s.avgSaleWon ? formatEokWon(s.avgSaleWon) : null,
      saleChangeMonthly: s.saleChangeMonthly,
      jeonseRatio: s.jeonseRatio,
    })),
    comment,
    mode,
    engine,
    generatedAt: new Date().toISOString(),
    disclaimer: AI_DISCLAIMER,
  });
}
