import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { ExampleBadge } from "../../components/ExampleBadge";

/* 시안 8l — 마켓 (임장 서비스·리포트) + 8m 리포트 상품 상세 · 데스크탑
   P0-5 목업 정직화: 상품·상세는 예시 데이터 — 예시 배지 + 오픈 준비 중 명시,
   결제로 오해될 죽은 버튼 제거 */

const FILTERS = ["전체", "지역 리포트", "대리 임장", "체크리스트"];

/* 더미 1개 원칙: 테스트용 샘플 상품은 단 1건 — 상세 예시와 동일 상품 */
const PRODUCTS = [
  {
    badge: "지역 리포트",
    badgeStyle: "bg-[#fdf3e7] text-[#c07a3a]",
    meta: "구매 214",
    title: "관양동 재건축 흐름 분석",
    seller: "김OO 중개사 · ★4.9",
    price: "9,900원",
    selected: true,
  },
];

export default function TownMarketPage() {
  return (
    <PageShell breadcrumb="동네이야기 › 마켓">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="rise-in text-[22px] font-extrabold text-ink">
          마켓{" "}
          <span className="align-middle rounded-[6px] bg-[#f2f4f8] px-2 py-[3px] text-[11px] font-extrabold text-text-2">
            오픈 준비 중
          </span>
        </h1>
        <div className="flex gap-1.5 overflow-x-auto text-[13px]">
          {FILTERS.map((f, i) => (
            <span
              key={f}
              className={`chip px-3.5 py-2 ${
                i === 0
                  ? "chip-active"
                  : "bg-[rgba(255,255,255,.7)] text-text-2"
              }`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* 실매물 연결 — 집주인 직접·중개사 등록 매물 */}
      <Link
        href="/listings"
        className="rise-in card card-hover card-pad-sm mb-4 flex items-center justify-between gap-3"
      >
        <div>
          <div className="text-[15px] font-extrabold text-ink">실매물 보기</div>
          <p className="mt-0.5 text-[13px] leading-[1.6] text-text-2">
            집주인 직접 등록·제휴 중개사 매물 — 검수를 통과한 매물만 모았어요.
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-extrabold text-primary">
          바로가기 →
        </span>
      </Link>

      {/* 정직 안내 — 아래 상품·상세는 예시 화면 */}
      <div className="rise-in mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 text-[12px] leading-[1.6] text-[#5b74b8]">
        <ExampleBadge />
        <span>
          아래 상품과 상세 화면은 오픈 준비 중인 마켓의 <b>예시</b>예요. 아직
          실제로 구매할 수 없어요 — 오픈 소식은{" "}
          <Link href="/notifications" className="font-bold text-primary underline">
            알림
          </Link>
          으로 받아보세요.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[380px_1fr]">
        {/* ---------- 상품 목록 ---------- */}
        <div className="flex flex-col gap-3">
          {PRODUCTS.map((p, i) => (
            <div
              key={p.title}
              className={`card-hover rise-in-${i + 1} flex flex-col gap-2 rounded-[18px] bg-surface p-[18px] ${
                p.selected
                  ? "border-[1.5px] border-primary"
                  : "border border-line"
              }`}
            >
              <div className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`rounded-[5px] px-2 py-[3px] text-[11px] font-extrabold ${p.badgeStyle}`}
                  >
                    {p.badge}
                  </span>
                  <ExampleBadge />
                </span>
                <span className="text-[11px] text-text-3">{p.meta}</span>
              </div>
              <div className="text-[15px] font-extrabold text-ink">
                {p.title}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-3">{p.seller}</span>
                <span
                  className={`font-extrabold ${
                    p.price === "받기"
                      ? "text-[13px] text-primary"
                      : "text-[15px] text-ink"
                  }`}
                >
                  {p.price}
                </span>
              </div>
            </div>
          ))}
          {/* 더미 1개 원칙 — 샘플 1건만 유지, 오픈 시 실상품으로 교체 */}
          <p className="px-1 text-[11px] leading-[1.6] text-text-3">
            샘플 상품 1건만 보여드려요 — 마켓이 오픈되면 실제 상품 목록으로
            자동으로 교체됩니다.
          </p>
        </div>

        {/* ---------- 상품 상세 (8m) ---------- */}
        <div className="rise-in-2 card flex flex-col gap-3.5 rounded-[20px] p-[26px]">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                지역 리포트
              </span>{" "}
              <ExampleBadge />
              <h2 className="mt-2 text-[21px] font-extrabold text-ink">
                관양동 재건축 흐름 분석 (2026 상반기판)
              </h2>
              <div className="mt-1 text-xs text-text-3">
                PDF 34p · 07.10 발행 · 구매 후 갱신본 무료
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className="text-[22px] font-extrabold text-ink">9,900원</div>
              <div className="text-[11px] text-text-3">플러스 멤버 -20%</div>
            </div>
          </div>

          {/* 판매자 */}
          <div className="flex items-center gap-2.5 rounded-xl bg-bg px-3.5 py-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#e2e8f2] to-[#eef2f8]" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-extrabold text-ink">
                  김OO 공인중개사
                </span>
                <span className="rounded bg-[#edf2fe] px-1.5 py-px text-[9px] font-extrabold text-primary">
                  인증
                </span>
              </div>
              <div className="text-[11px] text-text-3">
                관양동 12년 · 리포트 8 · ★4.9 (214)
              </div>
            </div>
            <Link
              href="/town/experts"
              className="text-xs font-bold text-primary"
            >
              프로필 ›
            </Link>
          </div>

          {/* 목차 미리보기 */}
          <div className="flex flex-col gap-1.5">
            <div className="text-[13px] font-extrabold text-ink">
              목차 미리보기
            </div>
            <div className="rounded-xl bg-bg px-4 py-3 text-xs leading-loose text-text-1">
              1. 관양동 단지별 재건축 요건 현황 (공작·한가람 외 6곳)
              <br />
              2. 용적률·대지지분으로 본 사업성 순위
              <br />
              3. 1기 신도시 특별법 적용 시나리오
              <br />
              4.{" "}
              <span className="text-[#adb5bd]">
                🔒 추진위 동향과 예상 타임라인 (구매 후 열람)
              </span>
            </div>
          </div>

          <div className="flex gap-2.5">
            {/* 실결제 미연동 — 가짜 구매 버튼 대신 정직한 상태 표기 */}
            <span className="flex-1 cursor-default rounded-[14px] border border-line bg-bg p-[13px] text-center text-sm font-bold text-text-3">
              구매 오픈 준비 중
            </span>
            <Link
              href="/support"
              className="btn-secondary rounded-[14px] px-5 py-[13px] text-center text-sm no-underline"
            >
              문의하기
            </Link>
          </div>

          <p className="text-[11px] text-[#adb5bd]">
            예시 화면입니다 · 오픈 시 리포트는 참고용 정보이며 투자 판단 책임은
            구매자에게 있습니다
          </p>
        </div>
      </div>
    </PageShell>
  );
}
