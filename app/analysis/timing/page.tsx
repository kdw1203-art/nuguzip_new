import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { NextActions } from "../../components/NextActions";
import { SimulationNotice } from "../../components/ExampleBadge";

/* 시안 8c의 사이클 세그먼트 (absolute 위치·회전 그대로) */
const SEGMENTS = [
  { left: "0%", bottom: "20%", width: "14%", color: "#c9d4e5", rotate: 0 },
  { left: "14%", bottom: "32%", width: "16%", color: "#c9d4e5", rotate: -8 },
  { left: "30%", bottom: "52%", width: "18%", color: "#8fa8dd", rotate: -14 },
  { left: "48%", bottom: "66%", width: "16%", color: "#8fa8dd", rotate: 0 },
  { left: "64%", bottom: "56%", width: "16%", color: "#1d4fd8", rotate: 10 },
  { left: "80%", bottom: "46%", width: "14%", color: "#1d4fd8", rotate: 4 },
] as const;

const SIGNALS = [
  { label: "거래량 (3개월)", value: "▲ 회복 초기", accent: true },
  { label: "하락 폭", value: "둔화 (-4.1→-2.1%)", accent: true },
  { label: "금리 방향", value: "동결 전망", accent: false },
] as const;

const ALERTS = ["신호 70 도달 시 알림", "관양동 급매 등록 시 알림"];

export default function TimingPage() {
  return (
    <PageShell breadcrumb="AI 분석 › 시세·타이밍">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">시세·타이밍 분석</h1>
        <div className="flex gap-1.5 text-[13px]">
          <span className="chip chip-active px-3.5 py-2">관양동</span>
          <span className="chip bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-text-2">마포구</span>
          <span className="chip bg-[rgba(255,255,255,.7)] px-3.5 py-2 text-text-2">＋ 지역</span>
        </div>
      </div>

      <div className="rise-in mb-3">
        <SimulationNotice />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
        {/* 사이클 차트 */}
        <div className="rise-in-1 card flex flex-col gap-4 rounded-[20px] p-6">
          <div className="flex items-baseline justify-between">
            <div className="text-base font-extrabold text-ink">관양동 시세 사이클</div>
            <div className="flex gap-1.5 text-xs">
              <span className="chip chip-soft px-3 py-[5px]">3년</span>
              <span className="px-3 py-[5px] text-text-3">10년</span>
            </div>
          </div>
          <div className="relative h-[220px] border-b border-line">
            <div className="absolute inset-x-0 top-[30%] border-t border-dashed border-[#eef1f6]" />
            <div className="absolute inset-x-0 top-[60%] border-t border-dashed border-[#eef1f6]" />
            {SEGMENTS.map((s, i) => (
              <div
                key={i}
                className="absolute h-[3px] rounded-[2px]"
                style={{
                  left: s.left,
                  bottom: s.bottom,
                  width: s.width,
                  background: s.color,
                  transform: s.rotate ? `rotate(${s.rotate}deg)` : undefined,
                  transformOrigin: "left",
                }}
              />
            ))}
            <div className="absolute bottom-[40%] left-[86%] h-3.5 w-3.5 rounded-full border-[3px] border-white bg-primary shadow-[0_4px_12px_rgba(29,79,216,.4)]" />
            <div className="absolute left-[64%] top-[6%] rounded-lg bg-[rgba(25,31,40,.92)] px-2.5 py-1.5 text-[11px] font-bold text-white">
              현재: 하락 후반 → 바닥 다지기 구간
            </div>
          </div>
          <div className="flex justify-between text-[11px] text-[#adb5bd]">
            <span>2023</span>
            <span>2024</span>
            <span>2025</span>
            <span>2026</span>
          </div>
          <Link
            href="/analysis/cycle"
            className="self-start text-xs font-bold text-primary no-underline"
          >
            공작아파트 84㎡ 사이클 전망 상세 ›
          </Link>
        </div>

        {/* 우측 */}
        <div className="flex flex-col gap-4">
          <div className="rise-in-2 ai-panel flex flex-col gap-3 rounded-[20px] p-[22px] shadow-[0_14px_36px_rgba(16,28,54,.22)]">
            <div className="flex items-center gap-2">
              <span className="ai-chip h-[22px] w-[22px] rounded-[7px] text-[11px]">AI</span>
              <span className="text-sm font-extrabold text-white">타이밍 신호</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] text-base font-extrabold text-ai-accent"
                style={{
                  borderColor: "rgba(126,162,255,.25)",
                  borderTopColor: "#7ea2ff",
                  borderRightColor: "#7ea2ff",
                }}
              >
                62
              </div>
              <div className="text-xs leading-[1.6] text-ai-text">
                매수 신호 62/100 — 거래량 회복 초기 + 하락 폭 둔화.{" "}
                <b className="text-white">급할 필요는 없지만 후보를 좁힐 시기</b>입니다.
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {SIGNALS.map((s) => (
                <div
                  key={s.label}
                  className="flex justify-between rounded-lg bg-[rgba(255,255,255,.07)] px-3 py-2 text-xs"
                >
                  <span className="text-ai-muted">{s.label}</span>
                  <span className={`font-bold ${s.accent ? "text-ai-accent" : "text-ai-text"}`}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-[9px] leading-[1.5] text-ai-muted">
                본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.
              </div>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[20px] p-5">
            <div className="text-sm font-extrabold text-ink">알림 설정</div>
            {/* 장식용 가짜 토글 제거 — 실제 알림 설정으로 연결 */}
            {ALERTS.map((a) => (
              <div key={a} className="text-[13px] text-text-1">
                · {a}
              </div>
            ))}
            <Link
              href="/notifications"
              className="btn-soft mt-1 rounded-[10px] p-2.5 text-center text-xs no-underline"
            >
              알림 설정 열기
            </Link>
          </div>
        </div>
      </div>

      {/* 15h-44 분석→행동: 결과 끝 다음 행동 카드 */}
      <div className="mt-5">
        <NextActions
          actions={[
            { label: "알림 기준 설정", href: "/notifications", primary: true },
            { label: "시나리오 확인", href: "/analysis/scenario" },
          ]}
        />
      </div>
    </PageShell>
  );
}
