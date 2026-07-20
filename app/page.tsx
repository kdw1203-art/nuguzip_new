import Link from "next/link";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { PersonalHome } from "./components/PersonalHome";
import { JourneyBanner } from "./components/JourneyBanner";
import { Footer } from "./components/Footer";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { getWeeklyDigest } from "@/lib/newui/digest";
import type {
  DeltaTone,
  HomeMeetingItem,
  HomeNoteItem,
  HomePostItem,
  HomeRegionCard,
  HomeReportItem,
} from "@/lib/newui/home-data";

// 스케일 지침 #21: 비로그인 홈은 정적 캐시 (5분 재검증) — 접속마다 재계산 금지
export const revalidate = 300;

/* ── 목업 폴백 (실데이터 없거나 조회 실패 시) ── */
const MOCK_REGIONS: HomeRegionCard[] = [
  { id: "gangnam", name: "강남구", meta: "서울 · 37건", price: "32.5억", delta: "▼ 4.2%", tone: "down" },
  { id: "mapo", name: "마포구", meta: "서울 · 27건", price: "11.4억", delta: "▼ 10.3%", tone: "down" },
  { id: "songpa", name: "송파구", meta: "서울 · 50건", price: "17.6억", delta: "▼ 6.4%", tone: "down" },
  { id: "namyangju", name: "남양주", meta: "경기 · 387건", price: "5.84억", delta: "▼ 0.5%", tone: "flat" },
];

const MOCK_NOTES: HomeNoteItem[] = [
  { id: "m1", title: "공작아파트 302동 — “주차가 관건”", score: "78점", hot: true },
  { id: "m2", title: "마포래미안 115동 — “역까지 실측 7분”", score: "82점", hot: true },
  { id: "m3", title: "과천 위버필드 — “경사 심함, 후문 동선”", score: "64점", hot: false },
];

const MOCK_POSTS: HomePostItem[] = [
  { id: "p1", rank: 1, title: "“청년 82.6% 세입자 시대…월세 부담 낮춰야”", comments: 6 },
  { id: "p2", rank: 2, title: "월세 세액공제 30% 상향 발의", comments: 6 },
  { id: "p3", rank: 3, title: "서울 빌라 매매 46% 급증", comments: 7 },
];

const MOCK_MEETINGS: HomeMeetingItem[] = [
  { id: "mt1", label: "과천지식정보타운 · 토 10:00 · 4/6" },
  { id: "mt2", label: "마포 리모델링 스터디 · 일 14:00 · 2/4" },
];

const MOCK_REPORTS: HomeReportItem[] = [
  { id: "r1", title: "관양동 재건축 흐름 분석", priceLabel: "9,900원" },
  { id: "r2", title: "평촌 학원가 실전 가이드", priceLabel: "7,900원" },
];

const deltaClass: Record<DeltaTone, string> = {
  down: "delta-down",
  up: "delta-up",
  flat: "delta-flat",
};

/* 더미데이터 정책: 실데이터 0건일 때만 목업 노출 — 목업 항목엔 작은 "예시" 라벨 */
function ExampleBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-line px-1 py-px text-[9px] font-semibold leading-[1.4] text-text-3">
      예시
    </span>
  );
}

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

  // 실데이터가 1건이라도 있으면 그대로 사용, 0건일 때만 목업(예시 라벨 부착)
  const regionsIsMock = data.regions.length === 0;
  const notesIsMock = data.notes.length === 0;
  const postsIsMock = data.posts.length === 0;
  const meetingsIsMock = data.meetings.length === 0;
  const reportsIsMock = data.reports.length === 0;

  const regions = regionsIsMock ? MOCK_REGIONS : data.regions;
  const notes = notesIsMock ? MOCK_NOTES : data.notes;
  const posts = postsIsMock ? MOCK_POSTS : data.posts;
  const meetings = meetingsIsMock ? MOCK_MEETINGS : data.meetings;
  const reports = reportsIsMock ? MOCK_REPORTS : data.reports;

  // 사실 기반 원칙: 실데이터 없는 수치는 허위 값 대신 "—" 표기
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  const loanRate = data.loanRate ?? "—";
  const notesToday = data.notesToday !== null ? `${data.notesToday}건` : "—";
  // P1-10: 기준금리는 아직 실데이터 소스 미연동 — 하드코딩 수치 대신 "—" 표기 (허위 수치 금지)
  const baseRate = "—";

  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 pb-32 pt-5 md:pb-16">
        {/* S13-13a 홈 이원화 — 로그인 시에만 개인화 섹션 렌더 + 아래 정적 히어로(data-static-hero) 숨김 */}
        <PersonalHome />

        {/* ================= 모바일 히어로 (5b) ================= */}
        <section className="flex flex-col gap-3 md:hidden">
          <h1 data-static-hero className="rise-in mt-2 text-[25px] font-extrabold leading-[1.3] tracking-[-0.5px] text-ink">
            오늘 본 집,
            <br />
            3분 만에 기록하세요
          </h1>
          <p data-static-hero className="rise-in-1 text-sm text-text-2">
            AI가 장단점과 시세 맥락을 정리해 드립니다
          </p>
          <Link
            href="/notes/new"
            data-static-hero
            className="btn-primary rise-in-2 rounded-2xl p-[15px] text-center text-base"
            style={{ boxShadow: "0 10px 26px rgba(29,79,216,.35)" }}
          >
            임장노트 쓰기
          </Link>
          <div data-static-hero className="rise-in-3 flex gap-2">
            <Link href="/map" className="glass flex-1 rounded-xl p-[11px] text-center text-[13px] font-bold text-text-1">
              지도 보기
            </Link>
            <Link href="/discover" className="flex-1 rounded-xl bg-[rgba(29,79,216,.1)] p-[11px] text-center text-[13px] font-bold text-primary">
              샘플 노트
            </Link>
          </div>
          <JourneyBanner />
          <div className="rise-in-4 flex gap-2">
            {[
              { label: "매매지수 서울", value: saleIndexSeoul, accent: false },
              // P1-10: 기준금리 실데이터 소스 미연동 — 허위 수치 대신 "—" (대출금리와 동일 원칙)
              { label: "기준금리", value: baseRate, accent: false },
              { label: "대출금리", value: loanRate, accent: true },
            ].map((s) => (
              <div key={s.label} className="glass min-w-0 flex-1 rounded-[14px] px-3 py-2.5">
                <div className="whitespace-nowrap text-[11px] text-text-3">{s.label}</div>
                <div className={`text-base font-extrabold ${s.accent ? "text-primary" : "text-ink"}`}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <p className="rise-in-4 -mt-1.5 text-[10px] text-text-3">
            공시 데이터 기준 — 미조회 항목은 “—”로 표시됩니다
          </p>
          <div className="rise-in-5 flex flex-col gap-3">
            {regions.slice(0, 2).map((r) => (
              <div key={r.id} className="glass flex items-center justify-between rounded-2xl px-4 py-3.5">
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    {r.name}
                    {regionsIsMock && <ExampleBadge />}
                  </div>
                  <div className="text-xs text-text-3">{r.meta}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold text-ink">{r.price}</div>
                  <div className={`text-xs ${deltaClass[r.tone]}`}>{r.delta}</div>
                </div>
              </div>
            ))}
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
                <>
                  <span className="mr-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[9px] font-semibold text-ai-muted">
                    예시 브리핑
                  </span>
                  수도권 하락 폭 3주 연속 둔화. 거래량 +12% — 관심 지역을 좁힐
                  시기입니다.
                </>
              )}
            </AIPanel>
          </div>
          {/* P1-9: 주간 다이제스트 진입 카드 (고아 라우트 해소) */}
          <Link
            href="/digest"
            className="rise-in-6 glass flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5"
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
        </section>

        {/* ================= 데스크탑 홈 (9a 정보형) ================= */}
        <section className="hidden grid-cols-1 gap-4 md:grid lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {/* 히어로 */}
            <div data-static-hero className="rise-in card flex flex-col items-start justify-between gap-6 rounded-[20px] px-6 py-[22px] xl:flex-row xl:items-center">
              <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-extrabold leading-[1.3] text-ink">
                  임장 기록이 판단 근거가 됩니다
                </h1>
                <p className="text-[13px] text-text-2">
                  3분 기록 → AI 정리 → 지도 비교. 로그인 없이 시작하세요.
                </p>
                <div className="mt-0.5 flex gap-2">
                  <Link href="/notes/new" className="btn-primary btn-cta rounded-xl px-5 py-2.5 text-[13px]">
                    임장노트 쓰기
                  </Link>
                  <Link href="/discover" className="rounded-xl bg-[#f2f4f8] px-5 py-2.5 text-[13px] font-bold text-text-1 transition-colors hover:bg-[#e9edf3]">
                    샘플 보기
                  </Link>
                </div>
              </div>
              <div className="grid w-full shrink-0 grid-cols-2 gap-2 xl:w-[300px]">
                {[
                  { label: "매매지수 서울", value: <>{saleIndexSeoul}</> },
                  // P1-10: 기준금리 미연동 — "—" 표기
                  { label: "기준 / 대출금리", value: <>{baseRate} / <span className="text-primary">{loanRate}</span></> },
                  { label: "오늘 새 노트", value: <span className="text-primary">{notesToday}</span> },
                  // platform_activity_events 최근 15분 집계 — 집계 불가 시 "—"
                  {
                    label: "접속 중",
                    value: (
                      <>{data.activeNow !== null ? `${data.activeNow}명` : "—"}</>
                    ),
                  },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl bg-bg px-[13px] py-[11px]">
                    <div className="text-[10px] text-text-3">{s.label}</div>
                    <div className="text-sm font-extrabold text-ink">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <JourneyBanner />

            {/* 지역 시세 카드 4열 */}
            <div className="rise-in-1 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {regions.slice(0, 4).map((r) => (
                <div key={r.id} className="card card-hover rounded-[14px] px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs text-text-3">
                    <span>
                      {r.name} · {r.meta.split("· ")[1] ?? r.meta}
                    </span>
                    {regionsIsMock && <ExampleBadge />}
                  </div>
                  <div className="mt-[3px] flex items-baseline gap-1.5">
                    <span className="text-[17px] font-extrabold text-ink">{r.price}</span>
                    <span className={`text-[11px] ${deltaClass[r.tone]}`}>
                      {r.delta.replace(" ", "")}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* 데이터 신선도 캡션(#21) — market_ingest_log 최근 성공 기준, null이면 미표시 */}
            {freshness && (
              <p className="t-caption -mt-2 text-text-3">
                실거래 기준: {freshness} (국토교통부)
              </p>
            )}

            {/* 공개 노트 · 동네이야기 */}
            <div className="rise-in-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
              <div className="card flex flex-col gap-2 rounded-2xl px-5 py-[18px]">
                <div className="flex justify-between">
                  <span className="text-sm font-extrabold text-ink">공개 임장노트</span>
                  <Link href="/notes" className="text-[11px] text-text-3 transition-colors hover:text-primary">더보기</Link>
                </div>
                {notes.map((n, i) => (
                  <div
                    key={n.id}
                    className={`flex items-center justify-between gap-3 py-[7px] text-xs ${
                      i < notes.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-semibold text-text-1">{n.title}</span>
                      {notesIsMock && <ExampleBadge />}
                    </span>
                    <span className={`shrink-0 font-extrabold ${n.hot ? "text-primary" : "text-text-3"}`}>
                      {n.score}
                    </span>
                  </div>
                ))}
              </div>
              <div className="card flex flex-col gap-2 rounded-2xl px-5 py-[18px]">
                <div className="flex justify-between">
                  <span className="text-sm font-extrabold text-ink">동네이야기 · 자료</span>
                  <Link href="/town" className="text-[11px] text-text-3 transition-colors hover:text-primary">더보기</Link>
                </div>
                {posts.map((p, i) => (
                  <div
                    key={p.id}
                    className={`py-[7px] text-xs font-semibold text-text-1 ${
                      i < posts.length - 1 ? "border-b border-[#f0f3f8]" : ""
                    }`}
                  >
                    {p.rank} {p.title}{" "}
                    <span className="font-normal text-text-3">댓글 {p.comments}</span>
                    {postsIsMock && (
                      <>
                        {" "}
                        <ExampleBadge />
                      </>
                    )}
                  </div>
                ))}
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
                  <>
                    <span className="mr-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[9px] font-semibold text-ai-muted">
                      예시 브리핑
                    </span>
                    수도권 하락 폭 3주 연속 둔화. 거래량 +12% — 관심 지역을
                    좁힐 시기입니다.
                  </>
                )}
              </AIPanel>
            </div>
            <div className="rise-in-2 card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
              <div className="text-[13px] font-extrabold text-ink">이번 주 임장 모임</div>
              {meetings.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-1.5 py-1.5 text-xs text-text-1 ${
                    i < meetings.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">{m.label}</span>
                  {meetingsIsMock && <ExampleBadge />}
                </div>
              ))}
            </div>
            {/* 전세 안전 진단 진입 카드 (제언-전략 #9) */}
            <Link
              href="/safety"
              className="rise-in-3 card card-hover flex items-center justify-between gap-2 rounded-2xl px-[18px] py-4"
            >
              <span className="text-[13px] font-bold text-ink">
                전세 계약 전 안전 진단 —{" "}
                <span className="text-primary">보증보험 가능 여부 확인</span>
              </span>
              <span className="shrink-0 text-sm font-extrabold text-primary">›</span>
            </Link>
            <div className="rise-in-3 card flex flex-col gap-2 rounded-2xl px-[18px] py-4">
              <div className="text-[13px] font-extrabold text-ink">인기 전문가 리포트</div>
              {reports.map((r) => (
                <div key={r.id} className="flex justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-semibold text-text-1">{r.title}</span>
                    {reportsIsMock && <ExampleBadge />}
                  </span>
                  <span className="shrink-0 font-extrabold text-ink">{r.priceLabel}</span>
                </div>
              ))}
            </div>
            {/* P1-9: 주간 다이제스트 진입 카드 (고아 라우트 해소) */}
            <Link
              href="/digest"
              className="rise-in-4 card card-hover flex flex-col gap-1 rounded-2xl px-[18px] py-4"
            >
              <span className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-ink">
                  주간 다이제스트 · {digest.weekLabel}
                </span>
                <span className="shrink-0 text-sm font-extrabold text-primary">›</span>
              </span>
              <span className="truncate text-xs text-text-3">{digestTeaser}</span>
            </Link>
            {/* P1-10: AdSense 점선 플레이스홀더 제거 — 광고 미송출 시 아무것도 렌더하지 않음
                (실광고는 layout의 AdSenseLoader Auto ads가 담당) */}
          </aside>
        </section>
      </main>

      {/* P0-3: 공통 푸터 컴포넌트 — 사업자 고지·약관 링크·면책, 모바일 포함 */}
      <Footer />

      <TabBar />
    </>
  );
}
