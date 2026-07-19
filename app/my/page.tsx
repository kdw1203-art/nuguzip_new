import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { AIPanel } from "@/app/components/AIPanel";

const CANDIDATES = [
  {
    name: "공작아파트",
    meta: "노트 3 · 마지막 방문 07.12",
    price: "8.4억",
    delta: "▼2.1%",
    deltaTone: "text-primary",
    score: "78점",
    scoreTone: "text-primary",
    active: true,
  },
  {
    name: "동편마을 3단지",
    meta: "노트 1 · 마지막 방문 07.05",
    price: "10.2억",
    delta: "▼1.4%",
    deltaTone: "text-primary",
    score: "82점",
    scoreTone: "text-primary",
    active: true,
  },
  {
    name: "한가람세경",
    meta: "노트 1 · 보류",
    price: "7.9억",
    delta: "▲0.8%",
    deltaTone: "text-danger",
    score: "64점",
    scoreTone: "text-text-3",
    active: false,
  },
] as const;

const TODOS = [
  { label: "겨울철 저층 채광 재확인", important: true },
  { label: "관리비·배관 이력 문의", important: false },
  { label: "등교 시간대 교통 확인", important: false },
] as const;

const MY_NOTES = [
  { title: "공작아파트 302동", meta: "3차 방문 · 07.12 · 비공개", score: "78점" },
  { title: "동편마을 3단지", meta: "1차 방문 · 07.05 · 공개", score: "82점" },
] as const;

export default function MyPage() {
  return (
    <PageShell breadcrumb="내 대시보드">
      {/* ============ 모바일 (6f 마이페이지) ============ */}
      <section className="flex flex-col gap-3 md:hidden">
        <div className="rise-in ai-panel flex flex-col gap-3.5 rounded-[20px] p-[18px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-[repeating-linear-gradient(45deg,#2a3242,#2a3242_5px,#333d4f_5px,#333d4f_10px)]" />
              <div>
                <div className="text-base font-extrabold text-white">대웅님</div>
                <div className="text-xs text-ai-muted">첫 집 준비 중 · 관양동</div>
              </div>
            </div>
            <Link href="/my/settings" className="text-base text-ai-muted" aria-label="설정">
              ⚙
            </Link>
          </div>
          <div className="flex gap-2">
            {[
              { value: "7", label: "임장노트", accent: false },
              { value: "4", label: "임장 단지", accent: false },
              { value: "2", label: "비교 중", accent: true },
            ].map((s) => (
              <div key={s.label} className="flex-1 rounded-xl bg-[rgba(255,255,255,.07)] p-[11px] text-center">
                <div className={`text-[17px] font-extrabold ${s.accent ? "text-[#7ea2ff]" : "text-white"}`}>
                  {s.value}
                </div>
                <div className="text-[11px] text-ai-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/notes/compare"
          className="rise-in-1 flex items-center justify-between rounded-2xl bg-primary-soft px-4 py-[15px]"
        >
          <div>
            <div className="text-sm font-extrabold text-primary">AI 비교 리포트 준비됨</div>
            <div className="mt-0.5 text-xs text-[#5b74b8]">공작 vs 동편3단지 · 노트 4건 기준</div>
          </div>
          <span className="text-[15px] font-extrabold text-primary">›</span>
        </Link>

        <div className="rise-in-2 text-[15px] font-extrabold text-ink">내 임장노트</div>
        {MY_NOTES.map((n) => (
          <Link
            key={n.title}
            href="/notes"
            className="rise-in-2 card card-hover flex items-center justify-between rounded-[14px] px-4 py-3.5"
          >
            <div>
              <div className="text-sm font-bold text-ink">{n.title}</div>
              <div className="text-[11px] text-text-3">{n.meta}</div>
            </div>
            <span className="text-xs font-extrabold text-primary">{n.score}</span>
          </Link>
        ))}

        <div className="rise-in-3 card flex flex-col rounded-[14px] px-4 py-0.5">
          {[
            { label: "관심 지역 관리", href: "/map" },
            { label: "자산 등록 · 대출 상환", href: "/my/assets" },
            { label: "수익률 계산기", href: "/calculator" },
            { label: "구독 관리", href: "/subscription" },
            { label: "고객지원 · 공지", href: "/support" },
          ].map((m, i, arr) => (
            <Link
              key={m.label}
              href={m.href}
              className={`flex justify-between py-[13px] text-sm font-semibold text-text-1 ${
                i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
              }`}
            >
              <span>{m.label}</span>
              <span className="text-[#c3cad6]">›</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ 데스크탑 (6m 내 대시보드) ============ */}
      <section className="hidden flex-col gap-4 md:flex">
        <div className="rise-in flex items-end justify-between px-1">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">대웅님의 내집찾기</h1>
            <p className="mt-1 text-[13px] text-text-2">목표: 내년 상반기 · 예산 9억 · 관양동 중심</p>
          </div>
          <Link
            href="/subscription"
            className="rounded-full bg-ink px-3.5 py-[7px] text-xs font-bold text-[#7ea2ff]"
          >
            플러스 멤버
          </Link>
        </div>

        <div className="rise-in-1 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[
            {
              label: "임장노트",
              value: (
                <>
                  7 <span className="text-xs font-bold text-primary">+2 이번 주</span>
                </>
              ),
              tone: "text-ink",
            },
            { label: "임장한 단지", value: <>4</>, tone: "text-ink" },
            { label: "비교 중인 단지", value: <>2</>, tone: "text-primary" },
            { label: "남은 고려사항", value: <>3</>, tone: "text-danger" },
          ].map((s) => (
            <div key={s.label} className="card rounded-2xl p-[18px]">
              <div className="text-xs text-text-3">{s.label}</div>
              <div className={`mt-1 text-2xl font-extrabold ${s.tone}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className="rise-in-2 card flex flex-col gap-3 rounded-[20px] p-[22px]">
            <div className="flex items-baseline justify-between">
              <div className="text-base font-extrabold text-ink">후보 단지 현황</div>
              <Link href="/map" className="text-xs font-semibold text-primary">
                지도에서 보기
              </Link>
            </div>
            {CANDIDATES.map((c, i) => (
              <div
                key={c.name}
                className={`flex items-center justify-between py-3 ${
                  i < CANDIDATES.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${c.active ? "bg-primary" : "bg-[#c3cad6]"}`} />
                  <div>
                    <div className="text-sm font-bold text-ink">{c.name}</div>
                    <div className="text-[11px] text-text-3">{c.meta}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-ink">
                    {c.price} <span className={`text-[11px] ${c.deltaTone}`}>{c.delta}</span>
                  </div>
                  <div className={`text-[11px] font-bold ${c.scoreTone}`}>{c.score}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rise-in-3">
              <AIPanel title="이번 주 브리핑" className="rounded-[20px]">
                관양동 실거래 4건 발생 — 하락 폭 둔화. 공작 vs 동편3 비교 리포트가 갱신됐어요. 남은
                고려사항 3건 중 &lsquo;겨울 채광&rsquo;은 현장 확인이 필요합니다.
                <Link
                  href="/notes/compare"
                  className="btn-primary mt-2.5 block rounded-[10px] p-2.5 text-center text-xs"
                >
                  리포트 열기
                </Link>
              </AIPanel>
            </div>
            <div className="rise-in-4 card flex flex-col gap-2 rounded-[20px] p-5">
              <div className="text-sm font-extrabold text-ink">남은 고려사항</div>
              {TODOS.map((t) => (
                <div key={t.label} className="flex items-center gap-2 text-[13px] text-text-1">
                  <span className="h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-[#c9d4e5]" />
                  {t.label}
                  {t.important && (
                    <span className="rounded-full bg-danger-soft px-[7px] py-0.5 text-[10px] font-bold text-danger">
                      중요
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
