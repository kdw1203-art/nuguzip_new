/**
 * GET /api/cron/molit-transactions-ingest
 * vercel.json cron: "0 4 1 * *" (매월 1일 새벽 4시)
 *
 * 전달(yyyymm) 국토부 아파트 실거래가를 Supabase complex_transactions 에 캐시.
 * DB에 등록된 complexes 각각에 대해 MOLIT API를 호출 → 월별 집계를 upsert.
 * MOLIT_SERVICE_KEY 없으면 no-op.
 */
import { NextResponse } from "next/server";
import { fetchMolitDeals } from "@/lib/national-data/molit-api";
import { getServiceSupabase } from "@/lib/supabase/service";
import { upsertTransactions } from "@/lib/complex/complex-store";
import { isAdminApiRequest } from "@/lib/admin/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // 인증 확인
  const expected = process.env.CRON_SECRET?.trim();
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const fromVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorized =
    fromVercelCron || (expected ? provided === expected : true) || (await isAdminApiRequest());
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const molitKey = process.env.MOLIT_SERVICE_KEY?.trim();
  if (!molitKey) {
    return NextResponse.json({ skipped: true, reason: "MOLIT_SERVICE_KEY not set" });
  }

  const sb = getServiceSupabase();
  if (!sb) {
    return NextResponse.json({ skipped: true, reason: "Supabase not configured" });
  }

  // 처리할 yyyymm — 기본: 전달. ?yyyymm=202506 로 수동 지정 가능.
  const now = new Date();
  const target = url.searchParams.get("yyyymm") ?? (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  // DB에 등록된 단지 목록 가져오기
  const { data: complexes } = await sb
    .from("complexes")
    .select("id,district,name")
    .not("district", "is", null)
    .limit(500);

  if (!complexes || complexes.length === 0) {
    return NextResponse.json({ processed: 0, yyyymm: target, reason: "no complexes in DB" });
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const districtsDone = new Set<string>();

  // 구(district)별로 한 번씩만 MOLIT 호출 후 단지 ID를 매칭
  const districtGroups = new Map<string, typeof complexes>();
  for (const c of complexes) {
    const d = c.district as string;
    if (!d) continue;
    const g = districtGroups.get(d) ?? [];
    g.push(c);
    districtGroups.set(d, g);
  }

  for (const [district, group] of districtGroups) {
    if (districtsDone.has(district)) continue;
    districtsDone.add(district);

    try {
      const { deals, mode } = await fetchMolitDeals("apt-sale", {
        district,
        yyyymm: target,
        numOfRows: 300,
      });

      if (mode !== "live" || deals.length === 0) {
        skipped += group.length;
        continue;
      }

      // 단지명으로 deal 분류
      for (const complex of group) {
        const name = (complex.name as string) ?? "";
        const matching = deals.filter(
          (d) => d.name && name && (d.name.includes(name.slice(0, 3)) || name.includes(d.name?.slice(0, 3) ?? ""))
        );
        const pool = matching.length >= 3 ? matching : deals; // 매칭 부족 시 구 전체 평균 사용
        const valid = pool.filter((d) => typeof d.dealManwon === "number" && d.dealManwon > 0);
        if (valid.length === 0) { skipped++; continue; }

        const manwons = valid.map((d) => d.dealManwon as number);
        await upsertTransactions([{
          complex_id: complex.id as string,
          yyyymm: target,
          area_m2: null,
          avg_manwon: Math.round(manwons.reduce((a, b) => a + b, 0) / manwons.length),
          min_manwon: Math.min(...manwons),
          max_manwon: Math.max(...manwons),
          deal_count: valid.length,
          source: "molit",
        }]);
        processed++;
      }
    } catch (e) {
      errors++;
      console.warn(`[molit-ingest] ${district} ${target} error:`, e);
    }

    // API rate limit 방지 (구별 200ms 딜레이)
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    status: "ok",
    yyyymm: target,
    totalComplexes: complexes.length,
    processed,
    skipped,
    errors,
    finishedAt: new Date().toISOString(),
  });
}
