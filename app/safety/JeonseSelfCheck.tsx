"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/app/components/Icon";

/* 전세 안심 진단(자가진단) — 항목 F27 lite.
   순수 클라이언트 계산기. 외부 데이터·API·키 없음. 입력 기반으로
   전세가율·근저당비율·부채비율을 계산해 안전/주의/위험 3단계를 안내한다.
   판정 결과를 지어내지 않으며, 어디까지나 일반 참고용 자가진단임을 명시한다. */

type HousingType = "아파트" | "빌라·다세대" | "오피스텔";
type Level = "안전" | "주의" | "위험";

/* 주택유형별 기준선. 빌라·다세대는 시세 변동성·환금성 때문에 더 보수적으로 본다. */
const THRESHOLDS: Record<
  HousingType,
  { debtSafe: number; debtWarn: number; jeonseSafe: number; jeonseWarn: number }
> = {
  아파트: { debtSafe: 70, debtWarn: 90, jeonseSafe: 80, jeonseWarn: 90 },
  오피스텔: { debtSafe: 70, debtWarn: 90, jeonseSafe: 80, jeonseWarn: 90 },
  "빌라·다세대": { debtSafe: 60, debtWarn: 80, jeonseSafe: 70, jeonseWarn: 80 },
};

const LEVEL_STYLE: Record<
  Level,
  { color: string; soft: string; icon: string; headline: string }
> = {
  안전: {
    color: "var(--success)",
    soft: "var(--success-soft)",
    icon: "shield",
    headline: "비교적 안전한 편이에요",
  },
  주의: {
    color: "var(--warning)",
    soft: "var(--warning-soft)",
    icon: "warning",
    headline: "주의가 필요해요",
  },
  위험: {
    color: "var(--danger)",
    soft: "var(--danger-soft)",
    icon: "warning",
    headline: "깡통전세 위험 신호가 있어요",
  },
};

const TIPS = [
  "잔금 당일 전입신고 + 확정일자를 받아 대항력과 우선변제권을 확보하세요.",
  "전세보증금 반환보증(HUG·SGI) 가입 가능 여부와 요건을 미리 확인하세요.",
  "계약 직전과 잔금일에 등기부등본을 다시 열람해 근저당·가압류 변동을 확인하세요.",
  "임대인 국세·지방세 완납증명을 요청하고, 선순위 근저당 말소 특약을 넣으세요.",
] as const;

const fmt = (n: number) => n.toLocaleString("ko-KR");
const parseNum = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** 값이 safeMax 이하면 안전, warnMax 미만이면 주의, 그 외 위험 */
function classify(value: number, safeMax: number, warnMax: number): Level {
  if (value <= safeMax) return "안전";
  if (value < warnMax) return "주의";
  return "위험";
}

function LevelBadge({ level }: { level: Level }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: s.soft, color: s.color }}
    >
      <Icon name={level === "안전" ? "check" : "warning"} size={12} />
      {level}
    </span>
  );
}

export function JeonseSelfCheck() {
  const [deposit, setDeposit] = useState(""); // 전세보증금 (만원)
  const [price, setPrice] = useState(""); // 매매 시세 추정 (만원)
  const [lien, setLien] = useState(""); // 선순위 근저당 채권최고액 (만원)
  const [type, setType] = useState<HousingType>("아파트");

  const depositN = parseNum(deposit);
  const priceN = parseNum(price);
  const lienN = parseNum(lien);
  const ready = depositN > 0 && priceN > 0;

  const result = useMemo(() => {
    if (!ready) return null;
    const t = THRESHOLDS[type];
    const jeonseRatio = (depositN / priceN) * 100; // 전세가율
    const lienRatio = (lienN / priceN) * 100; // 근저당비율
    const debtRatio = ((depositN + lienN) / priceN) * 100; // 부채비율(깡통전세 핵심)

    // 종합 등급: 부채비율·전세가율 중 나쁜 쪽을 따른다
    let overall: Level = "안전";
    if (debtRatio >= t.debtWarn || jeonseRatio >= t.jeonseWarn) overall = "위험";
    else if (debtRatio > t.debtSafe || jeonseRatio > t.jeonseSafe)
      overall = "주의";

    return {
      t,
      overall,
      indicators: [
        {
          key: "전세가율",
          value: jeonseRatio,
          level: classify(jeonseRatio, t.jeonseSafe, t.jeonseWarn),
          formula: "보증금 ÷ 시세",
          explain:
            "매매 시세 대비 보증금 비율이에요. 높을수록 집값이 내렸을 때 보증금을 온전히 돌려받기 어려워요.",
        },
        {
          key: "근저당비율",
          value: lienRatio,
          level: classify(lienRatio, 30, 60),
          formula: "선순위 근저당 ÷ 시세",
          explain:
            "집에 이미 잡혀 있는 대출(근저당) 규모예요. 경매로 넘어가면 근저당이 내 보증금보다 먼저 변제돼요.",
        },
        {
          key: "부채비율",
          value: debtRatio,
          level: classify(debtRatio, t.debtSafe, t.debtWarn),
          formula: "(보증금 + 근저당) ÷ 시세",
          explain:
            "보증금과 선순위 근저당을 합친 총부담이 시세에서 차지하는 비율이에요. 깡통전세를 가늠하는 핵심 지표로, 통상 90%를 넘으면 위험이 커요.",
        },
      ] as const,
    };
  }, [ready, type, depositN, priceN, lienN]);

  const inputCls =
    "w-full rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-text-3 focus:border-primary";

  return (
    <section className="mt-5">
      <div className="card flex flex-col gap-4 rounded-[20px] p-[22px]">
        {/* 헤더 */}
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
          >
            <Icon name="shield" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="text-[15px] font-extrabold text-ink">
              전세 안심 진단{" "}
              <span className="text-[11px] font-medium text-text-3">자가진단</span>
            </div>
            <p className="text-[12px] leading-[1.6] text-text-2">
              보증금·시세·선순위 근저당을 입력하면 전세가율·근저당비율·부채비율을
              계산해 깡통전세 위험도를 안전·주의·위험으로 알려드려요.
            </p>
          </div>
        </div>

        {/* 입력 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              전세보증금 <span className="text-text-3">(만원)</span>
            </span>
            <input
              inputMode="numeric"
              value={depositN ? fmt(depositN) : ""}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="예: 30,000"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              매매 시세(추정) <span className="text-text-3">(만원)</span>
            </span>
            <input
              inputMode="numeric"
              value={priceN ? fmt(priceN) : ""}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="예: 40,000"
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-bold text-text-1">
              선순위 근저당 <span className="text-text-3">(채권최고액·만원)</span>
            </span>
            <input
              inputMode="numeric"
              value={lienN ? fmt(lienN) : ""}
              onChange={(e) => setLien(e.target.value)}
              placeholder="없으면 0"
              className={inputCls}
            />
          </label>
        </div>

        {/* 주택유형 (선택) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-text-1">
            주택유형 <span className="font-medium text-text-3">(선택)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["아파트", "빌라·다세대", "오피스텔"] as HousingType[]).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setType(h)}
                className={`chip px-3 py-1.5 text-[12px] ${
                  type === h ? "chip-active" : "chip-soft"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          {type === "빌라·다세대" && (
            <span className="text-[11px] text-text-3">
              환금성이 낮아 기준을 더 보수적으로 적용해요
            </span>
          )}
        </div>

        {/* 결과 */}
        {!result ? (
          <div className="rounded-[14px] border border-dashed border-line px-4 py-6 text-center text-[12px] text-text-3">
            전세보증금과 매매 시세를 입력하면 위험도가 계산돼요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 종합 등급 배너 */}
            <div
              className="flex items-center gap-3 rounded-[14px] px-4 py-3.5"
              style={{
                background: LEVEL_STYLE[result.overall].soft,
                color: LEVEL_STYLE[result.overall].color,
              }}
            >
              <Icon name={LEVEL_STYLE[result.overall].icon} size={24} />
              <div className="flex flex-col">
                <span className="text-[16px] font-extrabold">
                  종합 {result.overall}
                </span>
                <span className="text-[12px] font-medium leading-[1.5] opacity-90">
                  {LEVEL_STYLE[result.overall].headline} · {type} 기준(부채비율{" "}
                  {result.t.debtSafe}% 이하 안전 / {result.t.debtWarn}% 이상 위험)
                </span>
              </div>
            </div>

            {/* 지표별 값 + 설명 */}
            <div className="flex flex-col gap-2.5">
              {result.indicators.map((ind) => (
                <div
                  key={ind.key}
                  className="rounded-[12px] border border-line bg-surface px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-text-1">
                        {ind.key}
                      </span>
                      <span className="text-[10px] text-text-3">
                        {ind.formula}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[15px] font-extrabold"
                        style={{ color: LEVEL_STYLE[ind.level].color }}
                      >
                        {ind.value.toFixed(1)}%
                      </span>
                      <LevelBadge level={ind.level} />
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] leading-[1.6] text-text-2">
                    {ind.explain}
                  </p>
                </div>
              ))}
            </div>

            {/* 실행 팁 */}
            <div className="rounded-[12px] bg-bg px-4 py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-extrabold text-ink">
                <Icon name="check" size={14} /> 계약 전 실행 팁
              </div>
              <ul className="flex flex-col gap-1.5">
                {TIPS.map((tip) => (
                  <li
                    key={tip}
                    className="flex gap-1.5 text-[12px] leading-[1.6] text-text-2"
                  >
                    <span className="text-primary">·</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 면책 */}
        <div
          className="flex items-start gap-1.5 rounded-[10px] px-3 py-2.5 text-[11px] leading-[1.6]"
          style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
        >
          <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
          <span>
            본 진단은 일반 참고용 자가진단이며 법적 효력이 없습니다. 실제 계약 전
            등기부·건축물대장 확인과 전문가 상담이 필요합니다.
          </span>
        </div>
      </div>
    </section>
  );
}
