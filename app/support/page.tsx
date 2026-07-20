import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { readBoardPosts } from "@/lib/newui/board-posts";
import { SupportContactForm } from "./SupportContactForm";
import { ExampleBadge } from "@/app/components/ExampleBadge";

/* P2-2: 사이드메뉴 실링크 · 문의 폼(/api/support) 연동 · 공지 board_posts(공지 카테고리) 실연동 */

const SIDE_MENU: { label: string; href: string }[] = [
  { label: "지원 허브", href: "/support" },
  { label: "공지사항", href: "#notices" },
  { label: "자주 묻는 질문", href: "#faq" },
  { label: "투자 제휴 문의", href: "#partner" },
  { label: "광고 문의", href: "#ads" },
  { label: "이용약관", href: "/legal/terms" },
  { label: "개인정보처리방침", href: "/legal/privacy" },
];

type NoticeItem = { id: string; title: string; date: string };

/** board_posts 공지 카테고리 최신 3건 — 실패·미존재 시 빈 배열(정직한 빈 상태) */
async function loadNotices(): Promise<NoticeItem[]> {
  try {
    const posts = await readBoardPosts(300);
    return posts
      .filter((p) => p.category.trim() === "공지")
      .slice(0, 3)
      .map((p) => {
        const t = new Date(p.createdAt);
        const date = Number.isFinite(t.getTime())
          ? `${String(t.getMonth() + 1).padStart(2, "0")}.${String(t.getDate()).padStart(2, "0")}`
          : "";
        return { id: p.id, title: p.title, date };
      });
  } catch {
    return [];
  }
}

const FAQ_CATEGORIES = [
  { icon: "📝", label: "노트 · 기록" },
  { icon: "💳", label: "구독 · 결제" },
  { icon: "🤖", label: "AI 분석" },
  { icon: "🔒", label: "계정 · 보안" },
] as const;

/* 더미 1개 원칙: 예시 티켓은 단 1건 — 우측 답변 상세와 동일 건 */
const TICKETS = [
  {
    tag: "결제",
    tagClass: "bg-[#fdf3e7] text-[#c07a3a]",
    status: "답변 완료",
    statusClass: "text-primary",
    title: "플러스 연간 결제 영수증 재발급",
    meta: "#T-4821 · 07.18 접수 · 07.18 답변",
    active: true,
  },
] as const;

export default async function SupportPage() {
  const notices = await loadNotices();
  return (
    <PageShell breadcrumb="고객지원" title="고객지원 허브" wide>
      {/* 검색 (9n / 7g) */}
      <div className="rise-in mb-4 flex items-center gap-2 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-[13px] text-text-3 md:w-[280px]">
        ⌕ 무엇을 도와드릴까요?
      </div>

      {/* 모바일 FAQ 카테고리 (7g) */}
      <div className="rise-in-1 mb-4 grid grid-cols-2 gap-2 md:hidden">
        {FAQ_CATEGORIES.map((c) => (
          <div key={c.label} className="card rounded-[14px] p-3.5 text-center">
            <div className="text-lg">{c.icon}</div>
            <div className="mt-1 text-xs font-bold text-text-1">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* 좌측 메뉴 (9n) */}
        <nav className="rise-in-1 card hidden h-fit flex-col rounded-[18px] py-2 md:flex">
          {SIDE_MENU.map((m, i) =>
            m.href.startsWith("#") ? (
              <a
                key={m.label}
                href={m.href}
                className="px-5 py-3 text-[13px] font-semibold text-text-1 transition-colors hover:text-primary"
              >
                {m.label}
              </a>
            ) : (
              <Link
                key={m.label}
                href={m.href}
                className={`px-5 py-3 text-[13px] ${
                  i === 0
                    ? "border-l-[3px] border-primary bg-primary-soft font-bold text-primary"
                    : "font-semibold text-text-1 transition-colors hover:text-primary"
                }`}
              >
                {m.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex flex-col gap-3.5">
          {/* 지원 3종 카드 (9n) */}
          <div className="rise-in-2 grid gap-3 md:grid-cols-3">
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">1:1 문의</div>
              <div className="text-xs leading-[1.55] text-text-2">평일 10-18시 · 평균 응답 4시간</div>
              <a href="#contact" className="btn-primary mt-1 rounded-[10px] p-[9px] text-center text-xs">
                문의 남기기
              </a>
            </div>
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">자주 묻는 질문</div>
              <div className="text-xs leading-[1.55] text-text-2">노트 · 구독 · 결제 · 전문가 등록</div>
              <a
                href="#faq"
                className="mt-1 rounded-[10px] bg-[#f2f4f8] p-[9px] text-center text-xs font-bold text-text-1"
              >
                FAQ 보기
              </a>
            </div>
            <div className="card flex flex-col gap-2 rounded-2xl p-5">
              <div className="text-[15px] font-extrabold text-ink">오류 · 데이터 신고</div>
              <div className="text-xs leading-[1.55] text-text-2">시세·크롤링 데이터 오류 제보</div>
              <a
                href="#contact"
                className="mt-1 rounded-[10px] bg-[#f2f4f8] p-[9px] text-center text-xs font-bold text-text-1"
              >
                신고하기
              </a>
            </div>
          </div>

          {/* 1:1 문의 폼 (P2-2) — /api/support 실연동 */}
          <div id="contact" className="rise-in-3 card flex flex-col gap-3 scroll-mt-24 rounded-2xl px-5 py-[18px]">
            <div>
              <span className="text-sm font-extrabold text-ink">1:1 문의 남기기</span>
              <span className="ml-2 text-[11px] text-text-3">영업일 기준 24~72시간 이내 답변</span>
            </div>
            <SupportContactForm />
          </div>

          {/* 공지사항 (9n) — board_posts 공지 카테고리 실데이터 (P2-2) */}
          <div id="notices" className="rise-in-3 card flex flex-col gap-1 scroll-mt-24 rounded-2xl px-5 py-[18px]">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-ink">공지사항</span>
              <Link href="/town" className="text-[11px] font-bold text-primary">
                전체 ›
              </Link>
            </div>
            {notices.length === 0 ? (
              <div className="py-4 text-center text-xs text-text-3">
                등록된 공지사항이 아직 없습니다
              </div>
            ) : (
              notices.map((n, i, arr) => (
                <Link
                  key={n.id}
                  href={`/town/news/${n.id}`}
                  className={`flex justify-between gap-3 py-2 text-xs ${
                    i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="min-w-0 truncate font-semibold text-text-1">
                    <span className="mr-1.5 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                      공지
                    </span>
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[#adb5bd]">{n.date}</span>
                </Link>
              ))
            )}
          </div>

          {/* 내 문의 티켓 + 답변 상세 (10b) */}
          <div className="grid gap-3.5 lg:grid-cols-[340px_1fr]">
            <div className="rise-in-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 text-[10px] text-text-3">
                문의 내역 미리보기 <ExampleBadge />
              </div>
              {TICKETS.map((t) => (
                <div
                  key={t.title}
                  className={`flex flex-col gap-[5px] rounded-[14px] bg-surface px-4 py-3.5 ${
                    t.active ? "border-[1.5px] border-primary" : "border border-line"
                  }`}
                >
                  <div className="flex justify-between">
                    <span className={`rounded-[5px] px-2 py-0.5 text-[11px] font-extrabold ${t.tagClass}`}>
                      {t.tag}
                    </span>
                    <span className={`text-[10px] font-bold ${t.statusClass}`}>{t.status}</span>
                  </div>
                  <div className="text-[13px] font-bold text-ink">{t.title}</div>
                  <div className="text-[10px] text-text-3">{t.meta}</div>
                </div>
              ))}
              {/* 더미 1개 원칙 — 샘플 티켓 1건만 유지 */}
              <p className="px-1 text-[10px] leading-[1.6] text-text-3">
                예시 티켓 1건이에요 — 문의를 남기면 내 문의 내역이 여기에
                표시됩니다.
              </p>
            </div>

            <div className="rise-in-4 card flex flex-col gap-3.5 rounded-[20px] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="rounded-[5px] bg-[#fdf3e7] px-2 py-[3px] text-[11px] font-extrabold text-[#c07a3a]">
                    결제
                  </span>
                  <span className="ml-2 text-base font-extrabold text-ink">
                    플러스 연간 결제 영수증 재발급
                  </span>
                </div>
                <span className="flex items-center gap-1.5 text-[11px] text-text-3">
                  #T-4821 <ExampleBadge />
                </span>
              </div>
              <div className="max-w-[420px] self-end rounded-[14px] rounded-br-[4px] bg-primary px-[15px] py-3 text-[13px] leading-[1.6] text-white">
                연간 결제 영수증을 회사 제출용으로 재발급 받고 싶습니다. 사업자 정보 포함 가능한가요?
              </div>
              <div className="flex items-start gap-2.5">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-primary text-[10px] font-extrabold text-white">
                  N
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] text-text-3">
                    누구집 지원팀 · 07.18 14:02 (접수 후 1시간 38분)
                  </div>
                  <div className="max-w-[460px] rounded-[14px] rounded-tl-[4px] bg-bg px-[15px] py-3 text-[13px] leading-[1.65] text-text-1">
                    가능합니다. 설정 › 결제 내역에서 &lsquo;영수증 › 사업자 정보 입력&rsquo; 후
                    재발급하시면 됩니다. 방금 고객님 계정에 해당 메뉴를 활성화해 두었어요. 첨부한
                    가이드 이미지를 참고해 주세요. 📄 receipt-guide.png
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[#f0f3f8] pt-3">
                <span className="text-xs text-text-3">이 답변이 도움이 되었나요?</span>
                <div className="flex gap-2">
                  <span className="rounded-full bg-primary-soft px-4 py-[7px] text-xs font-bold text-primary">
                    도움됐어요
                  </span>
                  <span className="rounded-full bg-[#f2f4f8] px-4 py-[7px] text-xs font-semibold text-text-2">
                    추가 문의
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ (10b + 7g) */}
          <div id="faq" className="rise-in-4 card flex flex-col gap-1 scroll-mt-24 rounded-[20px] px-6 py-[22px]">
            <div className="mb-2 flex flex-col justify-between gap-2 md:flex-row md:items-baseline">
              <span className="text-[15px] font-extrabold text-ink">자주 묻는 질문</span>
              <div className="flex gap-1.5 text-[11px]">
                <span className="rounded-full bg-ink px-3 py-[5px] font-bold text-white">전체</span>
                <span className="rounded-full bg-[#f2f4f8] px-3 py-[5px] text-text-2">노트</span>
                <span className="rounded-full bg-[#f2f4f8] px-3 py-[5px] text-text-2">구독·결제</span>
                <span className="rounded-full bg-[#f2f4f8] px-3 py-[5px] text-text-2">전문가</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-[rgba(29,79,216,.03)] px-4 py-[13px]">
              <div className="flex justify-between text-[13px] font-bold text-ink">
                <span>Q. 공개 노트에서 동·호수는 어떻게 가려지나요?</span>
                <span className="text-primary">▴</span>
              </div>
              <div className="text-xs leading-[1.65] text-text-2">
                AI가 텍스트·사진에서 동·호수, 차량번호, 얼굴을 자동 감지해 가립니다. 가림 실패 신고 시
                24시간 내 검수 후 조치되며, 이 기능은 해제할 수 없습니다.
              </div>
            </div>
            {[
              "Q. 구독 해지하면 남은 기간은 어떻게 되나요?",
              "Q. 전문가 인증에는 어떤 서류가 필요한가요?",
              "Q. 노트가 저장되지 않았어요",
              "Q. AI 요약 횟수는 어떻게 계산되나요?",
            ].map((q, i, arr) => (
              <div
                key={q}
                className={`flex justify-between px-4 py-[13px] text-[13px] font-bold text-text-1 ${
                  i < arr.length - 1 ? "border-b border-[#f0f3f8]" : ""
                }`}
              >
                <span>{q}</span>
                <span className="text-[#c3cad6]">▾</span>
              </div>
            ))}
          </div>

          {/* 해결 안 됐나요 (7g) */}
          <div className="rise-in-5 ai-panel flex items-center justify-between rounded-2xl p-4">
            <div>
              <div className="text-[13px] font-extrabold text-white">해결이 안 되셨나요?</div>
              <div className="mt-0.5 text-[11px] text-ai-muted">평일 10-18시 · 평균 응답 4시간</div>
            </div>
            <a href="#contact" className="btn-primary rounded-full px-4 py-[9px] text-xs">
              1:1 문의
            </a>
          </div>

          {/* 제휴 · 광고 (9n) */}
          <div className="rise-in-5 grid gap-3 md:grid-cols-2">
            <div id="partner" className="ai-panel flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <div className="text-sm font-extrabold text-white">투자 · 제휴 문의</div>
              <div className="text-xs leading-[1.6] text-ai-text">
                IR 자료 요청, 데이터 제휴, 금융사 연동 제안은 별도 채널로 받고 있습니다.
              </div>
              <a href="mailto:partner@nuguzip.com" className="text-xs font-bold text-[#7ea2ff]">
                partner@nuguzip.com
              </a>
            </div>
            <div id="ads" className="card flex scroll-mt-24 flex-col gap-2 rounded-2xl p-5">
              <div className="text-sm font-extrabold text-ink">광고 문의</div>
              <div className="text-xs leading-[1.6] text-text-2">
                지면 소개서(AD 슬롯 위치·단가)를 보내드립니다. 커뮤니티 어뷰징성 광고는 게재하지
                않습니다.
              </div>
              <a href="mailto:ad@nuguzip.com" className="text-xs font-bold text-primary">
                ad@nuguzip.com · 미디어킷 다운로드
              </a>
            </div>
          </div>

          {/* 약관 푸터 (9n) */}
          <div className="rise-in-6 card flex flex-col justify-between gap-2 rounded-2xl px-6 py-[18px] md:flex-row md:items-center">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
              <Link href="/legal/terms" className="font-bold text-text-1 hover:text-primary">
                이용약관
              </Link>
              <Link href="/legal/privacy" className="font-bold text-text-1 hover:text-primary">
                개인정보처리방침
              </Link>
              <Link href="/legal/location" className="hover:text-primary">
                위치기반서비스 약관
              </Link>
              <Link href="/legal/youth" className="hover:text-primary">
                청소년보호정책
              </Link>
            </div>
            <span className="text-[11px] text-[#adb5bd]">시행 2026.07.15 · 이전 버전 보기</span>
          </div>
          <p className="px-1 text-[11px] leading-[1.6] text-[#adb5bd]">
            우리동네이야기 · 대표 고대웅 · 사업자 378-06-02465 · 통신판매업 제2026-안양동안-0000호 ·
            nuguzip@naver.com · 제공 정보는 참고용이며 투자 판단의 책임은 이용자에게 있습니다
          </p>
        </div>
      </div>
    </PageShell>
  );
}
