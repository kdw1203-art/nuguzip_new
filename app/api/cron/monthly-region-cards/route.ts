/**
 * [#115] 월간 지역 리포트 소셜 카드 — 매월 2일, 직전 완결월 거래 상위 8개 지역의
 * 요약 카드를 소셜 큐(social_uploads)에 적재한다. 발행 자체는 기존 드레인 크론이
 * 하루 1건씩 소화한다(큐 원칙 유지 — 한 번에 쏟아붓지 않는다).
 * 멱등: sourceRef=monthly-card:{yyyymm}:{regionId} 부분 유니크가 중복을 막는다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getAllRegionSnapshots, getRegionMonthlyVolume } from "@/lib/market/store";
import { renderPromoFrames } from "@/lib/social/video/frames";
import { encodeSlideshow } from "@/lib/social/video/encode";
import { enqueueUpload } from "@/lib/social/store";
import { uploadVideoToStorage, assertCompliantCopy } from "@/lib/social/autopost";
import { formatKrwShort } from "@/lib/market/format";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function prevYm(): { ym: string; label: string } {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { ym, label: `${d.getFullYear()}년 ${d.getMonth() + 1}월` };
}

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: false, error: "no-db" }, { status: 503 });

  const { ym, label } = prevYm();
  const results: Array<Record<string, unknown>> = [];
  try {
    const snaps = [...(await getAllRegionSnapshots()).values()];
    // 직전 완결월 거래량으로 상위 8개 지역 선정
    const withVol = await Promise.all(
      snaps.slice(0, 62).map(async (s) => {
        const vol = await getRegionMonthlyVolume(s.regionId, s.regionName, 3).catch(() => []);
        const m = vol.find((v) => v.month === ym);
        return { s, count: m?.count ?? 0 };
      }),
    );
    const top = withVol
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    for (const { s, count } of top) {
      const sourceRef = `monthly-card:${ym}:${s.regionId}`;
      const { data: dup } = await sb
        .from("social_uploads")
        .select("id")
        .eq("source_ref", sourceRef)
        .maybeSingle();
      if (dup) {
        results.push({ region: s.regionId, skipped: "dup" });
        continue;
      }
      const headline = `${label}\n${s.regionName} 아파트 시장`;
      const sub = `월간 스냅샷 — nuguzip.com/region/${s.regionId}/report 에 월별로 고정 보관됩니다`;
      const statLabel = `${label} 매매 신고`;
      const statValue = `${count.toLocaleString("ko-KR")}건${s.avgSale && s.avgSale > 0 ? ` · 평균 ${formatKrwShort(s.avgSale)}` : ""}`;
      const title = `${label} ${s.regionName} 아파트 시장 정리`;
      const caption = `${label} ${s.regionName} 매매 신고 ${count.toLocaleString("ko-KR")}건. 월별 스냅샷은 nuguzip.com/region/${s.regionId}/report 에서. 국토교통부 신고 기준이며 투자 권유가 아닙니다.`;
      assertCompliantCopy(title, caption, headline, sub);

      const frames = await renderPromoFrames({
        headline,
        sub,
        statLabel,
        statValue,
        statAsOf: `${label} 기준`,
      });
      const mp4 = await encodeSlideshow(frames.map((png) => ({ png, seconds: 3.2 })));
      const videoUrl = await uploadVideoToStorage(mp4, `auto/monthly-${ym}-${s.regionId}.mp4`);
      const row = await enqueueUpload({
        videoUrl,
        title,
        caption,
        hashtags: ["부동산", "아파트", s.regionName.replace(/\s+/g, ""), "실거래가", "내집나우"],
        targets: { instagram: true, youtube: true },
        createdBy: "monthly-region-cards",
        sourceKind: "promo",
        sourceRef,
      });
      results.push({ region: s.regionId, uploadId: row.id });
    }

    await logIngest({
      source: "news",
      dataset: "월간 지역 소셜 카드",
      origin: "cron-fetch",
      rows: results.filter((r) => r.uploadId).length,
      status: "ok",
      message: `대상월 ${ym} · 적재 ${results.filter((r) => r.uploadId).length} · 중복 ${results.filter((r) => r.skipped).length}`,
    });
    return NextResponse.json({ ok: true, ym, results });
  } catch (err) {
    const message = ingestErrorMessage(err, "월간 소셜 카드 실패");
    await logIngest({
      source: "news",
      dataset: "월간 지역 소셜 카드",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message, results }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
