/**
 * GET /api/og/complex-trend?region=서울%20강남구&name=단지명
 * [#114] 단지 24개월 시세 미니 차트 카드 — 신고가 자동 글의 썸네일.
 * 데이터: market_transactions 월평균(트레이드·취소 제외). 표본 3개월 미만이면
 * 차트 없이 단지명 카드로 폴백(없는 추세를 그리지 않는다).
 */
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { OG_SIZE } from "@/lib/og/theme";
import { OG_FONT_FAMILY, ogFonts } from "@/lib/og/font";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const revalidate = 21600; // 6h — 하루 1회 데이터에 충분

type Pt = { ym: string; avg: number };

async function loadSeries(region: string, name: string): Promise<Pt[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const from = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 23);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const { data, error } = await sb
    .from("market_transactions")
    .select("contract_ym, deal_amount_krw")
    .eq("region_name", region)
    .eq("complex_name", name)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gte("contract_ym", from)
    .not("deal_amount_krw", "is", null)
    .limit(2000);
  if (error || !data) return [];
  const byYm = new Map<string, { s: number; n: number }>();
  for (const r of data) {
    const ym = String(r.contract_ym ?? "");
    const v = Number(r.deal_amount_krw);
    if (!/^\d{6}$/.test(ym) || !Number.isFinite(v) || v <= 0) continue;
    const cur = byYm.get(ym) ?? { s: 0, n: 0 };
    cur.s += v;
    cur.n += 1;
    byYm.set(ym, cur);
  }
  return [...byYm.entries()]
    .map(([ym, { s, n }]) => ({ ym, avg: s / n }))
    .sort((a, b) => a.ym.localeCompare(b.ym));
}

const eok = (v: number) => `${(v / 1e8).toFixed(1).replace(/\.0$/, "")}억`;

export async function GET(req: NextRequest) {
  const region = (req.nextUrl.searchParams.get("region") ?? "").trim().slice(0, 30);
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 40);
  const series = region && name ? await loadSeries(region, name).catch(() => []) : [];

  const W = 1040;
  const H = 320;
  let chart: React.ReactElement | null = null;
  if (series.length >= 3) {
    const min = Math.min(...series.map((p) => p.avg));
    const max = Math.max(...series.map((p) => p.avg));
    const span = Math.max(1, max - min);
    const bw = Math.floor(W / series.length) - 6;
    chart = (
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: `${H}px`, marginTop: "26px" }}>
        {series.map((p, i) => (
          <div
            key={p.ym}
            style={{
              display: "flex",
              width: `${Math.max(14, bw)}px`,
              height: `${40 + Math.round(((p.avg - min) / span) * (H - 60))}px`,
              background: i === series.length - 1 ? "#ff6b6b" : "#3d5ba9",
              borderRadius: "6px 6px 0 0",
            }}
          />
        ))}
      </div>
    );
  }
  const last = series.length > 0 ? series[series.length - 1] : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #101726 0%, #1b2a4a 100%)",
          padding: "52px 64px",
          fontFamily: OG_FONT_FAMILY,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "24px", color: "#8fa3c8", fontWeight: 700 }}>
              {region || "단지 시세"}
            </div>
            <div style={{ display: "flex", fontSize: "46px", fontWeight: 800, marginTop: "4px" }}>
              {name || "내집나우"}
            </div>
          </div>
          {last && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", fontSize: "22px", color: "#8fa3c8" }}>최근 월평균</div>
              <div style={{ display: "flex", fontSize: "44px", fontWeight: 800, color: "#ffd166" }}>
                {eok(last.avg)}
              </div>
            </div>
          )}
        </div>
        {chart ?? (
          <div
            style={{
              display: "flex",
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              fontSize: "30px",
              color: "#8fa3c8",
            }}
          >
            최근 거래 표본이 적어 추세 차트를 생략합니다
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "22px" }}>
          <div style={{ display: "flex", fontSize: "20px", color: "#71829f" }}>
            국토교통부 실거래 신고 · 24개월 월평균 · 투자 권유 아님
          </div>
          <div style={{ display: "flex", fontSize: "24px", color: "#9db4dd", fontWeight: 700 }}>
            naezipnow.com
          </div>
        </div>
      </div>
    ),
    { width: OG_SIZE.width, height: OG_SIZE.height, ...ogFonts() },
  );
}
