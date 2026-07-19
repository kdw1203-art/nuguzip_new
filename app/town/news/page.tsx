import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { AIPanel } from "../../components/AIPanel";

/* 시안 8k — 자료(크롤링 뉴스) · 데스크탑 */

const LATEST = [
  {
    id: "1",
    badge: "개발",
    badgeStyle: "bg-[#fdf3e7] text-[#c07a3a]",
    title: "안양 관양 재개발 구역, 시공사 선정 임박 — 인근 구축 단지 재건축 기대감 확산",
    meta: "OO경제 · 07.18 · 댓글 17",
  },
  {
    id: "2",
    badge: "정책",
    badgeStyle: "bg-[#edf2fe] text-primary",
    title: "1기 신도시 특별법 시행령 입법예고",
    meta: "OO일보 · 07.16",
  },
  {
    id: "3",
    badge: "개발",
    badgeStyle: "bg-[#fdf3e7] text-[#c07a3a]",
    title: "평촌 리모델링 3개 단지 조합 설립",
    meta: "OO경제 · 07.14",
  },
  {
    id: "4",
    badge: "시장",
    badgeStyle: "bg-[#f2f4f8] text-text-2",
    title: "수도권 재개발 일반분양가 상승세",
    meta: "OO신문 · 07.11",
  },
];

export default function TownNewsPage() {
  return (
    <PageShell breadcrumb="동네이야기 › 자료 › 정책">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          뉴스 · 자료
        </h1>
        <div className="flex gap-2 text-[13px]">
          <span className="btn-soft rounded-[10px] px-3.5 py-2">저장 12</span>
          <span className="rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2">
            공유
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {/* 대표 자료 — 8k 본문 */}
          <article className="rise-in card flex flex-col gap-3.5 rounded-[20px] p-[26px]">
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[#edf2fe] px-2 py-[3px] text-[11px] font-extrabold text-primary">
                정책
              </span>
              <span className="text-xs text-text-3">
                자동 수집 · 국토교통부 보도자료 · 2026.07.17
              </span>
            </div>
            <h2 className="text-[22px] font-extrabold leading-[1.4] text-ink">
              월세 세액공제 최대 30% 상향 개정안 발의 — 무주택 세입자 주거안정
            </h2>

            <AIPanel title="3줄 요약">
              ① 월세 세액공제율 17% → 최대 30% 상향
              <br />② 대상: 연소득 8,000만 이하 무주택 세대주
              <br />③ 국회 통과 시 2027년 1월 지급분부터 적용
            </AIPanel>

            <p className="text-sm leading-[1.8] text-text-1">
              개정안은 청년·신혼부부 등 무주택 세입자의 월세 부담을 낮추기 위한
              것으로, 기존 공제 한도(750만원)도 1,000만원으로 확대하는 내용을
              담았다. 원문 전문은 출처 링크에서 확인할 수 있습니다…
            </p>

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              <a
                href="https://www.molit.go.kr"
                target="_blank"
                rel="noreferrer"
                className="text-[13px] font-bold text-primary"
              >
                원문 보기 (molit.go.kr) ↗
              </a>
              <span className="text-[11px] text-[#adb5bd]">
                자동 수집 콘텐츠 · 요약 오류 신고
              </span>
            </div>
          </article>

          {/* 최신 자료 목록 */}
          <section className="rise-in-1 card flex flex-col gap-1 rounded-[20px] px-6 py-5">
            <div className="mb-1 text-[15px] font-extrabold text-ink">
              최신 자료
            </div>
            {LATEST.map((n, i) => (
              <Link
                key={n.id}
                href={`/town/news/${n.id}`}
                className={`flex items-center gap-3.5 py-3 ${
                  i < LATEST.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <div className="h-[38px] w-[52px] shrink-0 rounded-lg bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded-[5px] px-1.5 py-px text-[10px] font-extrabold ${n.badgeStyle}`}
                    >
                      {n.badge}
                    </span>
                    <span className="truncate text-[13px] font-bold text-ink">
                      {n.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-3">{n.meta}</div>
                </div>
                <span className="text-[#c3cad6]">›</span>
              </Link>
            ))}
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-4">
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              나에게 미치는 영향
            </div>
            <div className="flex justify-between rounded-[10px] bg-bg px-3 py-2.5 text-xs">
              <span className="text-text-2">현재 월세 65만 기준</span>
              <span className="font-extrabold text-primary">
                연 234만 환급 예상
              </span>
            </div>
            <p className="text-[11px] leading-[1.5] text-text-3">
              내 프로필(무주택·연소득 7,000만) 기준 자동 계산
            </p>
          </div>

          <div className="rise-in-3 card flex flex-col gap-2 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">관련 이야기</div>
            <div className="border-b border-[#f0f3f8] py-2 text-xs text-text-1">
              “이 정도면 월세 유지가 낫나요?” 댓글 17
            </div>
            <div className="py-2 text-xs text-text-1">
              “매수 타이밍에 영향 있을까” 댓글 9
            </div>
          </div>

          <div className="rise-in-4 flex flex-col gap-1.5 rounded-[18px] bg-[rgba(29,79,216,.08)] p-4 text-center">
            <div className="text-xs font-extrabold text-primary">
              월세 vs 매수, 뭐가 유리할까?
            </div>
            <Link
              href="/analysis/scenario"
              className="btn-primary rounded-[10px] p-2.5 text-xs"
            >
              AI 시나리오로 비교
            </Link>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
