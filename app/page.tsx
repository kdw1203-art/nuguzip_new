import Link from "next/link";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { PersonalHome } from "./components/PersonalHome";
import { EmptyState } from "./components/ui/EmptyState";
import { JourneyBanner } from "./components/JourneyBanner";
import { HomeMiniMap } from "./components/HomeMiniMap";
import { AdSlot } from "./components/ads/AdSlot";
import { Footer } from "./components/Footer";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { getBaseRate } from "@/lib/market/base-rate";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getWeeklyDigest } from "@/lib/newui/digest";
import type { DeltaTone } from "@/lib/newui/home-data";

// 스케일 지침 #21: 비로그인 홈은 정적 캐시 (5분 재검증) — 접속마다 재계산 금지
export const revalidate = 300;

/* G10 / 사실 우선: 여기 있던 5개 예시 폴백을 삭제했다.
   - MOCK_REGIONS: "강남구 32.5억 ▼4.2%" — 실존 자치구에 지어낸 시세·변동률
   - MOCK_NOTES:   "공작아파트 302동 78점" — 존재하지 않는 노트(클릭 시 죽은 링크)
   - MOCK_POSTS:   "청년 82.6% 세입자 시대…" — 지어낸 통계가 박힌 가짜 헤드라인
   - MOCK_MEETINGS:"과천지식정보타운 · 토 10:00 · 4/6" — 실제 장소의 없는 모임(사람이 나갈 수 있다)
   - MOCK_REPORTS: "관양동 재건축 흐름 분석 · 9,900원" — 팔지 않는 상품
   "예시" 배지를 붙여도 홈 첫 화면에서는 실데이터와 같은 카드 모양으로 읽힌다.
   데이터가 없으면 없다고 말하고, 채우는 행동(CTA)으로 안내한다. */

const deltaClass: Record<DeltaTone, string> = {
  down: "delta-down",
  up: "delta-up",
  flat: "delta-flat",
};

export default async function Home() {
  const data = await loadNewHomeData();
  // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
  const freshness = await getMarketFreshnessDateLabel();
  // P1-9: 주간 다이제스트 진입 카드 티저 (1h 캐시, 실패 시 빈 섹션 폴백)
  const digest = await getWeeklyDigest();
  const digestTeaser =
    digest.news[0]?.title ??
    (digest.market.length > 0
      ? `${digest.market[0].name} 등 주요 지역 시세 요약`
      : "최근 7일 뉴스·시세·커뮤니티 요약");

  // 실데이터만 사용한다 — 0건이면 빈 상태를 그린다(가짜 카드로 채우지 않는다).
  const regions = data.regions;
  const notes = data.notes;
  const posts = data.posts;
  const meetings = data.meetings;
  const reports = data.reports;

  // 사실 기반 원칙: 실데이터 없는 수치는 허위 값 대신 "—" 표기
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  const loanRate = data.loanRate ?? "—";
  const notesToday = data.notesToday !== null ? `${data.notesToday}건` : "—";
  // 기준금리: ECOS(한국은행) 연동 시 실값, 미연동 시 "—" (허위 수치 금지)
  const baseRateData = await getBaseRate();
  const baseRate = baseRateData?.label ?? "—";

  // 홈 미니지도 마커용 시세 지역 (좌표 매핑은 HomeMiniMap 내부) — 실데이터만 마커로 표시
  const mapRegions = regions.slice(0, 4);

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 pb-32 pt-5 md:pb-16">
        {/* S13-13a 홈 이원화 — 로그인 시에만 개인화 섹션 렌더 + 아래 정적 히어로(data-static-hero) 숨김 */}
        <PersonalHome />

        {/* ================= 모바일 히어로 (5b · 트렌드 갱신) ================= */}
        <section className="flex flex-col gap-3 md:hidden">
          <h1 data-static-hero className="rise-in mt-2 text-[27px] font-extrabold leading-[1.25] tracking-[-0.6px] text-ink">
            오늘 본 집,
            <br />
            <span className="text-gradient">3분 만에 기록</span>하세요
          </h1>
          <p data-static-hero className="rise-in-1 text-sm text-text-2">
            AI가 장단점과 시세 맥락을 정리해 드립니다
          </p>
          <Link
            href="/notes/new"
            data-static-hero
            className="btn-primary glow press rise-in-2 rounded-2xl p-[15px] text-center text-base"
          >
            임장노트 쓰기
          </Link>
          <div data-static-hero className="rise-in-3 flex gap-2">
            <Link href="/map" className="glass press flex-1 rounded-xl p-[11px] text-center text-[13px] font-bold text-text-1">
              지도 보기
            </Link>
            <Link href="/discover" className="press flex-1 rounded-xl bg-[rgba(29,79,216,.1)] p-[11px] text-center text-[13px] font-bold text-primary">
              샘플 노트
            </Link>
          </div>
          <JourneyBanner />
          {/* 카테고리 숏컷은 상단 GNB 메뉴와 중복이라 제거 (사용자 요청) */}
          <div className="rise-in-4 flex gap-2">
            {[
              { label: "매매지수 서울", value: saleIndexSeoul, accent: false },
              // P1-10: 기준금리 실데이터 소스 미연동 — 허위 수치 대신 "—" (대출금리와 동일 원칙)
              { label: "기준금리", value: baseRate, accent: false },
              { label: "대출금리", value: loanRate, accent: true },
            ].map((s) => (
              <div key={s.label} className="glass min-w-0 flex-1 rounded-2xl px-3 py-2.5">
                <div className="whitespace-nowrap text-[11px] text-text-3">{s.label}</div>
                <div className={`t-num text-base ${s.accent ? "text-primary" : "text-ink"}`}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <p className="rise-in-4 -mt-1.5 text-[10px] text-text-3">
            공시 데이터 기준 — 미조회 항목은 “—”로 표시됩니다
          </p>

          {/* 관심지역 실지도 (모바일 · 컴팩트) */}
          <div className="rise-in-5">
            <HomeMiniMap regions={mapRegions} className="h-[208px]" />
          </div>

          <div className="rise-in-5 flex flex-col gap-3">
            {regions.length === 0 ? (
              <EmptyState
                icon="map"
                title="지역 시세를 아직 불러오지 못했어요"
                desc="실거래 스냅샷이 준비되면 여기에 표시됩니다."
                action={{ label: "지도에서 찾아보기", href: "/map" }}
              />
            ) : (
              regions.slice(0, 2).map((r) => (
                <div key={r.id} className="card card-hover flex items-center justify-between rounded-2xl px-4 py-3.5">
                  <div>
                    <div className="text-sm font-bold text-ink">{r.name}</div>
                    <div className="text-xs text-text-3">{r.meta}</div>
                  </div>
                  <div className="text-right">
                    <div className="t-num text-base text-ink">{r.price}</div>
                    <div className={`text-xs ${deltaClass[r.tone]}`}>{r.delta}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="rise-in-6">
            <AIPanel title="오늘의 시장 브리핑">
              {data.briefing ? (
                <>
                  {data.briefing.text}
                  <span className="ml-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[9px] font-semibold text-ai-muted">
                    {data.briefing.asOfLabel}
                  </span>
                </>
              ) : (
                /* G10: "수도권 하락 폭 3주 연속 둔화 · 거래량 +12%"는 근거 없이 고정된
                   문장이었다. 시장 판단 문구는 예시라도 사실처럼 읽히므로 삭제. */
                <>오늘 브리핑을 아직 만들지 못했어요. 실거래 데이터가 갱신되면 표시됩니다.</>
              )}
            </AIPanel>
          </div>
          {/* P1-9: 주간 다이제스트 진입 카드 (고아 라우트 해소) */}
          <Link
            href="/digest"
            className="rise-in-6 glass press flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-extrabold text-ink">
                주간 다이제스트 · {digest.weekLabel}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-text-3">
                {digestTeaser}
              </span>
            </span>
            <span className="shrink-0 text-sm font-extrabold text-primary">›</span>
          </Link>

          {/* H3 광고 슬롯 — 등록 배너 없으면 하우스 광고, 그것도 없으면 아무것도 안 그림.
              이 페이지는 revalidate=300 공유 캐시라 보는 사람의 플랜을 알 수 없다.
              그래서 plan={null} — 특정 플랜 겨냥 배너는 여기서 제외된다. */}
          <AdSlot placement="home_feed" seed={0} plan={null} className="rise-in-6" />
        </section>

        {/* ================= 데스크탑 홈 (9a 정보형 · 트렌드 갱신 bento) ================= */}
        <section className="hidden grid-cols-1 gap-4 md:grid lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {/* 히어로 — bento 틴트 + 그라데이션 헤드라인 */}
            <div
              data-static-hero
              className="rise-in bento bento-tint sheen flex flex-col items-start justify-between gap-6 px-7 py-7 xl:flex-row xl:items-center"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex flex-col gap-3">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[rgba(29,79,216,.08)] px-3 py-1 text-[11px] font-extrabold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary float-slow" /> AI 임장 기록 플랫폼
                </span>
                <h1 className="text-[30px] font-extrabold leading-[1.22] tracking-[-0.6px] text-ink">
                  임장 기록이{" "}
                  <span className="text-gradient">판단 근거</span>가 됩니다
                </h1>
                <p className="text-sm text-text-2">
                  3분 기록 → AI 정리 → 지도 비교. 로그인 없이 시작하세요.
                </p>
                <div className="mt-1 flex gap-2">
                  <Link href="/notes/new" className="btn-primary btn-cta press rounded-xl px-5 py-2.5 text-[13px]">
                    임장노트 쓰기
                  </Link>
                  <Link href="/discover" className="btn-ghost press rounded-xl px-5 py-2.5 text-[13px]">
                    샘플 보기
                  </Link>
                </div>
              </div>
              <div className="grid w-full shrink-0 grid-cols-2 gap-2.5 xl:w-[320px]">
                {[
                  { label: "매매지수 서울", value: <>{saleIndexSeoul}</>, accent: false },
                  // P1-10: 기준금리 미연동 — "—" 표기
                  { label: "기준 / 대출금리", value: <>{baseRate} / <span className="text-primary">{loanRate}</span></>, accent: false },
                  { label: "오늘 새 노트", value: <span className="text-primary">{notesToday}</span>, accent: true },
                  // platform_activity_events 최근 15분 집계 — 집계 불가 시 "—"
                  {
                    label: "접속 중",
                    value: (
                      <>{data.activeNow !== null ? `${data.activeNow}명` : "—"}</>
                    ),
                    accent: true,
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-[rgba(255,255,255,.7)] bg-white/70 px-4 py-3 backdrop-blur-sm"
                  >
                    <div className="text-[10px] text-text-3">{s.label}</div>
                    <div className="t-num mt-0.5 text-[15px] text-ink">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <JourneyBanner />

            {/* 관심지역 실지도 (bento · 데스크탑) */}
            <div className="rise-in-1">
              <HomeMiniMap regions={mapRegions} className="h-[248px]" />
            </div>

            {/* 지역 시세 카드 4열 — 라운드 확대 + 호버 리프트 */}
            {regions.length === 0 ? (
              <EmptyState
                className="rise-in-2"
                icon="map"
                title="지역 시세를 아직 불러오지 못했어요"
                desc="국토교통부 실거래 스냅샷이 적재되면 이 자리에 지역별 평균가와 변동률이 표시됩니다."
                action={{ label: "지도에서 찾아보기", href: "/map" }}
              />
            ) : (
              <div className="rise-in-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
                {regions.slice(0, 4).map((r) => (
                  <div key={r.id} className="card card-hover rounded-2xl px-4 py-4">
                    <div className="text-xs text-text-3">
                      {r.name} · {r.meta.split("· ")[1] ?? r.meta}
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="t-num text-[19px] text-ink">{r.price}</span>
                      <span className={`text-[11px] ${deltaClass[r.tone]}`}>
                        {r.delta.replace(" ", "")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 데이터 신선도 캡션(#21) — market_ingest_log 최근 성공 기준, null이면 미표시 */}
            {freshness && (
              <p className="t-caption -mt-2 text-text-3">
                실거래 기준: {freshness} (국토교통부)
              </p>
            )}

            {/* 공개 노트 · 동네이야기 */}
            <div className="rise-in-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="card card-hover flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <span className="accent-underline text-sm font-extrabold text-ink">공개 임장노트</span>
                  <Link href="/notes" className="text-[11px] text-text-3 transition-colors hover:text-primary">더보기</Link>
                </div>
                {notes.length === 0 ? (
                  <EmptyState
                    icon="notebook-pen"
                    title="아직 공개된 임장노트가 없어요"
                    desc="첫 노트를 남기면 여기에 소개됩니다."
                    action={{ label: "임장노트 쓰기", href: "/notes/new" }}
                  />
                ) : (
                  notes.map((n, i) => (
                    <div
                      key={n.id}
                      className={`flex items-center justify-between gap-3 py-[7px] text-xs ${
                        i < notes.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      <span className="truncate font-semibold text-text-1">{n.title}</span>
                      <span className={`shrink-0 font-extrabold ${n.hot ? "text-primary" : "text-text-3"}`}>
                        {n.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="card card-hover flex flex-col gap-2 rounded-2xl px-5 py-5">
                <div className="flex items-center justify-between">
                  <span className="accent-underline text-sm font-extrabold text-ink">동네이야기 · 자료</span>
                  <Link href="/town" className="text-[11px] text-text-3 transition-colors hover:text-primary">더보기</Link>
                </div>
                {posts.length === 0 ? (
                  <EmptyState
                    icon="messages-square"
                    title="아직 올라온 글이 없어요"
                    desc="동네 이야기를 먼저 시작해 보세요."
                    action={{ label: "글쓰기", href: "/town/write" }}
                  />
                ) : (
                  posts.map((p, i) => (
                    <div
                      key={p.id}
                      className={`py-[7px] text-xs font-semibold text-text-1 ${
                        i < posts.length - 1 ? "border-b border-[#f0f3f8]" : ""
                      }`}
                    >
                      {p.rank} {p.title}{" "}
                      <span className="font-normal text-text-3">댓글 {p.comments}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 사이드바 */}
          <aside className="flex flex-col gap-3">
            <div className="rise-in-1">
              <AIPanel title="오늘의 시장 브리핑">
                {data.briefing ? (
                  <>
                    {data.briefing.text}
                    <span className="ml-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[9px] font-semibold text-ai-muted">
                      {data.briefing.asOfLabel}
                    </span>
                  </>
                ) : (
                  <>오늘 브리핑을 아직 만들지 못했어요. 실거래 데이터가 갱신되면 표시됩니다.</>
                )}
              </AIPanel>
            </div>
            <div className="rise-in-2 card card-hover flex flex-col gap-2 rounded-2xl px-5 py-4">
              <div className="accent-underline text-[13px] font-extrabold text-ink">이번 주 임장 모임</div>
              {/* 없는 모임을 예시로라도 띄우면 실제로 그 장소에 나가는 사람이 생긴다. */}
              {meetings.length === 0 ? (
                <p className="py-1.5 text-xs leading-[1.6] text-text-3">
                  예정된 모임이 없어요.{" "}
                  <Link href="/town/groups" className="font-bold text-primary">
                    임장 모임 보기 ›
                  </Link>
                </p>
              ) : (
                meetings.map((m, i) => (
                  <div
                    key={m.id}
                    className={`py-1.5 text-xs text-text-1 ${
                      i < meetings.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    <span className="block truncate">{m.label}</span>
                  </div>
                ))
              )}
            </div>
            {/* 전세 안전 진단 진입 카드 (제언-전략 #9) */}
            <Link
              href="/safety"
              className="rise-in-3 card card-hover hover-rise ring-grad flex items-center justify-between gap-2 rounded-2xl px-5 py-4"
            >
              <span className="text-[13px] font-bold text-ink">
                전세 계약 전 안전 진단 —{" "}
                <span className="text-primary">보증보험 가능 여부 확인</span>
              </span>
              <span className="shrink-0 text-sm font-extrabold text-primary">›</span>
            </Link>
            <div className="rise-in-3 card card-hover flex flex-col gap-2 rounded-2xl px-5 py-4">
              <div className="accent-underline text-[13px] font-extrabold text-ink">인기 전문가 리포트</div>
              {/* 팔지 않는 리포트를 가격표까지 붙여 예시로 띄우지 않는다. */}
              {reports.length === 0 ? (
                <p className="text-xs leading-[1.6] text-text-3">
                  아직 발행된 리포트가 없어요.{" "}
                  <Link href="/town/market" className="font-bold text-primary">
                    전문가 마켓 ›
                  </Link>
                </p>
              ) : (
                reports.map((r) => (
                  <div key={r.id} className="flex justify-between gap-3 text-xs">
                    <span className="truncate font-semibold text-text-1">{r.title}</span>
                    <span className="shrink-0 font-extrabold text-ink">{r.priceLabel}</span>
                  </div>
                ))
              )}
            </div>
            {/* P1-9: 주간 다이제스트 진입 카드 (고아 라우트 해소) */}
            <Link
              href="/digest"
              className="rise-in-4 card card-hover flex flex-col gap-1 rounded-2xl px-5 py-4"
            >
              <span className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-ink">
                  주간 다이제스트 · {digest.weekLabel}
                </span>
                <span className="shrink-0 text-sm font-extrabold text-primary">›</span>
              </span>
              <span className="truncate text-xs text-text-3">{digestTeaser}</span>
            </Link>
            {/* P1-10: AdSense 점선 플레이스홀더는 제거된 상태 유지 — 광고 미송출 시 아무것도
                렌더하지 않는다. (외부 실광고는 layout의 AdSenseLoader Auto ads가 담당)
                H3: 여기 슬롯은 어드민 등록 배너 → 하우스 광고 순으로 채우고, 둘 다 없으면
                역시 아무것도 그리지 않는다. seed 를 모바일(0)과 다르게 줘서 같은 방문에
                같은 문구가 두 번 잡히지 않도록 한다. */}
            <AdSlot placement="home_feed" seed={1} plan={null} className="rise-in-4" />
          </aside>
        </section>
      </main>

      {/* P0-3: 공통 푸터 컴포넌트 — 사업자 고지·약관 링크·면책, 모바일 포함 */}
      <Footer />

      <TabBar />
    </>
  );
}
