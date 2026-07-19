import Link from "next/link";
import { PageShell } from "../../../components/PageShell";
import { AIPanel } from "../../../components/AIPanel";

/* 시안 9g — 뉴스 상세 v2: 원문 전체 + 사진 + 댓글 + 유사 기사 + 매물 연결 */

const COMMENTS = [
  {
    name: "관양토박이",
    badge: "✦ 플러스",
    badgeStyle: "rounded-full bg-ink text-[#7ea2ff]",
    time: "2시간 전",
    body: "현장 다녀왔는데 이주 시작한 구역도 있어요. 공작 쪽은 아직 추진위 단계라 온도차 큽니다.",
    likes: "좋아요 12",
    replies: "답글 3",
  },
  {
    name: "김OO 중개사",
    badge: "인증",
    badgeStyle: "rounded bg-[#edf2fe] text-primary",
    time: "1시간 전",
    body: "일반분양가 ㎡당 1,100만이면 공작 현 시세(940만)와 격차가 꽤 납니다. 구축 갭 메우기가 관전 포인트예요.",
    likes: "좋아요 24",
    replies: "답글 5",
  },
];

const NOTES = [
  {
    title: "공작 302동 — “재개발 소음 확인”",
    meta: "첫집준비중 · 07.12",
    score: "78점",
  },
  {
    title: "한가람 105동 — “구역 경계 도보 3분”",
    meta: "관양토박이 · 07.08",
    score: "72점",
  },
];

const SIMILAR = [
  { title: "1기 신도시 특별법 시행령 입법예고", meta: "OO일보 · 07.16" },
  { title: "평촌 리모델링 3개 단지 조합 설립", meta: "OO경제 · 07.14" },
  { title: "수도권 재개발 일반분양가 상승세", meta: "OO신문 · 07.11" },
];

export default async function TownNewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;

  return (
    <PageShell breadcrumb="자료 › 개발 › 관양동 재개발">
      <div className="mb-4 flex items-center justify-end gap-2 text-[13px]">
        <span className="btn-soft rounded-[10px] px-3.5 py-2">저장 28</span>
        <span className="rounded-[10px] bg-[rgba(255,255,255,.7)] px-3.5 py-2 font-semibold text-text-2">
          공유
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 기사 본문 ---------- */}
          <article className="rise-in card flex flex-col gap-4 rounded-[20px] p-7">
            <div className="flex items-center gap-2">
              <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                개발 · 매물 연관
              </span>
              <span className="text-xs text-text-3">
                자동 수집 · OO경제 · 2026.07.18 14:20 · 기자 김OO
              </span>
            </div>
            <h1 className="text-2xl font-extrabold leading-[1.4] text-ink">
              안양 관양 재개발 구역, 시공사 선정 임박 — 인근 구축 단지 재건축
              기대감 확산
            </h1>

            <AIPanel title="3줄 요약">
              ① 관양 재개발 8월 시공사 총회 ② 예상 일반분양가 ㎡당 1,100만 ③
              인근 공작·한가람 재건축 추진 기대감으로 문의 증가
            </AIPanel>

            {/* 원문 사진 플레이스홀더 */}
            <div className="relative flex h-[280px] items-end overflow-hidden rounded-[14px] bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]">
              <span className="rounded-tr-[10px] bg-[rgba(255,255,255,.85)] px-3 py-[5px] font-mono text-[11px] text-text-3">
                원문 기사 사진 — 관양 재개발 구역 전경 (출처: OO경제)
              </span>
            </div>

            <div className="flex flex-col gap-4 text-sm leading-[1.85] text-text-1">
              <p>
                안양시 동안구 관양동 일대 재개발 사업이 다음 달 시공사 선정
                총회를 앞두고 있다. 조합에 따르면 대형 건설사 2곳이
                입찰참여의향서를 제출했으며, 총 2,340세대 규모로 조성될
                예정이다.
              </p>
              <p>
                사업 구역과 도로 하나를 사이에 둔 공작아파트(1988년 준공)와
                한가람세경(1992년) 등 인근 구축 단지에서는 1기 신도시 특별법과
                맞물린 재건축 기대감이 커지고 있다. 관양동 A공인 관계자는
                &quot;재개발 발표 이후 매수 문의가 2배가량 늘었다&quot;고
                전했다.
              </p>
              <p>
                전문가들은 다만 시공사 선정 이후에도 관리처분·이주까지 최소
                4~5년이 소요되는 만큼 단기 시세보다는 장기 관점의 접근을
                권고했다.{" "}
                <span className="text-text-3">(원문 전체 1,240자 중 표시 — </span>
                <a
                  href="https://example.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-bold text-primary"
                >
                  원문 보기 ↗
                </a>
                <span className="text-text-3">)</span>
              </p>
            </div>

            <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3.5">
              <span className="text-[11px] text-[#adb5bd]">
                자동 수집 콘텐츠 · 저작권은 원 매체에 있음 · 오류 신고
              </span>
              <div className="flex gap-3.5 text-xs text-text-2">
                <span className="font-bold text-primary">도움돼요 42</span>
                <span>별로예요 3</span>
              </div>
            </div>
          </article>

          {/* ---------- 댓글 ---------- */}
          <section className="rise-in-1 card flex flex-col gap-3 rounded-[20px] px-[26px] py-[22px]">
            <div className="text-[15px] font-extrabold text-ink">댓글 17</div>
            {COMMENTS.map((c) => (
              <div key={c.name} className="flex gap-2.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-ink">
                      {c.name}
                    </span>
                    <span
                      className={`px-1.5 py-px text-[9px] font-extrabold ${c.badgeStyle}`}
                    >
                      {c.badge}
                    </span>
                    <span className="text-[10px] text-[#adb5bd]">{c.time}</span>
                  </div>
                  <p className="text-[13px] leading-[1.55] text-text-1">
                    {c.body}
                  </p>
                  <div className="flex gap-3 text-[11px] text-text-3">
                    <span>{c.likes}</span>
                    <span>{c.replies}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-xl bg-bg px-3.5 py-2.5">
              <span className="flex-1 text-[13px] text-text-3">
                댓글 남기기…
              </span>
              <span className="text-xs font-bold text-primary">등록</span>
            </div>
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-3.5">
          {/* 기사 속 위치 */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              기사 속 위치
            </div>
            <div className="relative h-[150px] overflow-hidden rounded-xl bg-gradient-to-br from-[#dfe7f5] to-[#c9d6ef]">
              <span className="absolute left-2 top-2 font-mono text-[10px] text-text-3">
                네이버/카카오 지도 SDK 영역
              </span>
              <div className="absolute left-10 top-[38px] rounded-lg bg-[#c07a3a] px-2 py-1 text-[10px] font-extrabold text-white">
                재개발 구역
              </div>
              <div
                className="absolute left-[130px] top-20 rounded-lg bg-primary px-2 py-1 text-[10px] font-extrabold text-white"
                style={{ boxShadow: "0 4px 10px rgba(29,79,216,.35)" }}
              >
                공작 8.4억
              </div>
              <Link
                href="/map"
                className="absolute bottom-2.5 right-2.5 rounded-lg bg-[rgba(255,255,255,.85)] px-2.5 py-[5px] text-[10px] font-bold text-primary"
              >
                지도에서 열기 ›
              </Link>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-2">연관 단지</span>
              <span className="font-bold text-ink">
                공작 · 한가람 · 인덕원대우
              </span>
            </div>
          </div>

          {/* 이 지역 임장노트 */}
          <div className="rise-in-3 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">
              이 지역 임장노트{" "}
              <span className="text-[11px] font-medium text-text-3">
                공개 38건
              </span>
            </div>
            {NOTES.map((n, i) => (
              <div
                key={n.title}
                className={`flex items-center justify-between py-2 ${
                  i < NOTES.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <div>
                  <div className="text-xs font-bold text-ink">{n.title}</div>
                  <div className="text-[10px] text-text-3">{n.meta}</div>
                </div>
                <span className="text-[11px] font-extrabold text-primary">
                  {n.score}
                </span>
              </div>
            ))}
            <Link
              href="/notes/new"
              className="btn-soft rounded-[10px] p-2.5 text-center text-xs"
            >
              이 지역 노트 쓰기
            </Link>
          </div>

          {/* 유사 기사 */}
          <div className="rise-in-4 card flex flex-col gap-1 rounded-[18px] p-[18px]">
            <div className="mb-1.5 text-[13px] font-extrabold text-ink">
              유사 기사
            </div>
            {SIMILAR.map((s, i) => (
              <Link
                key={s.title}
                href="/town/news"
                className={`flex gap-2.5 py-[7px] ${
                  i < SIMILAR.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <div className="h-[38px] w-[52px] shrink-0 rounded-lg bg-gradient-to-br from-[#e8edf5] to-[#f2f5fa]" />
                <div>
                  <div className="text-xs font-bold leading-[1.4] text-ink">
                    {s.title}
                  </div>
                  <div className="text-[10px] text-text-3">{s.meta}</div>
                </div>
              </Link>
            ))}
          </div>

          {/* AD 슬롯 */}
          <div className="rise-in-5 flex h-20 flex-col items-center justify-center gap-[3px] rounded-[14px] border border-dashed border-[#d8dfea] bg-surface">
            <span className="rounded border border-[#e2e7ee] px-1.5 py-px text-[9px] font-bold tracking-widest text-[#adb5bd]">
              AD
            </span>
            <span className="font-mono text-[11px] text-[#adb5bd]">
              AdSense 320×80
            </span>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
