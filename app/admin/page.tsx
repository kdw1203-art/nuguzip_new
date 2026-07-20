import {
  loadAdminDashboardMetrics,
  loadRecentMembers,
  type AdminDashboardMetrics,
  type AdminMembersData,
  type AdminPendingItem,
} from "@/lib/newui/admin-metrics";

// 실집계(#83): DAU·신규 노트·전환율·구독 매출 4카드와 처리 대기 목록은
// lib/newui/admin-metrics 실데이터 사용 — 조회 실패 시 "—" / 목업 폴백.
export const dynamic = "force-dynamic";

/** content_reports 조회 실패·빈 데이터 시 목업 폴백 */
const PENDING_FALLBACK: AdminPendingItem[] = [
  {
    text: "신고: 커뮤니티 글 “연락처 유도” 외 3건",
    status: "긴급",
    color: "#d64545",
  },
  {
    text: "전문가 전문가 승인: 이OO 세무사 (서류 완료)",
    status: "검토",
    color: "#f2c94c",
  },
  {
    text: "마켓 정산: 7월 1차 (전문가 12명 · 216만원)",
    status: "D-2",
    color: "#9aa6b8",
  },
];

const PIPELINE = [
  {
    name: "국토부 실거래가 API",
    status: "● 정상 · 10분 전 동기화",
    color: "#4ade80",
  },
  {
    name: "뉴스·정책 수집 (32개 소스)",
    status: "● 정상 · 오늘 148건",
    color: "#4ade80",
  },
  {
    name: "청약홈 분양 공고",
    status: "▲ 지연 42분 · 재시도 중",
    color: "#f2c94c",
  },
];

const CONTENTS = [
  {
    title: "공개 노트 — 동·호수 노출 의심 (자동 감지)",
    sub: "공작 302동 노트 · AI 마스킹 실패 가능성 82%",
    primary: "가림 적용",
    secondary: "통과",
  },
  {
    title: "크롤링 뉴스 — 요약 오류 신고 2건",
    sub: "“월세 세액공제 30%” 기사 · 수치 불일치 신고",
    primary: "재요약",
    secondary: "원문 확인",
  },
  {
    title: "마켓 리포트 — 신규 등록 검수",
    sub: "“관양동 재건축 2026 하반기판” · 김OO 프로",
    primary: "승인",
    secondary: "반려",
  },
];

const darkCard =
  "rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.05)]";
const panelCard = "rounded-2xl bg-[#12161f] p-5 border border-[rgba(255,255,255,.06)]";

export default async function AdminDashboardPage() {
  let metrics: AdminDashboardMetrics = { kpis: [], pending: [] };
  let membersData: AdminMembersData = { total: null, members: [] };
  try {
    [metrics, membersData] = await Promise.all([
      loadAdminDashboardMetrics(),
      loadRecentMembers(5),
    ]);
  } catch {
    // 조회 실패 — 아래에서 "—"/목업 폴백
  }
  const kpis =
    metrics.kpis.length > 0
      ? metrics.kpis
      : ([
          { label: "DAU (24h)", value: "—", delta: null, accent: false },
          { label: "신규 임장노트 (24h)", value: "—", delta: null, accent: false },
          { label: "노트 작성 전환율", value: "—", delta: null, accent: true },
          { label: "구독 매출", value: "—", delta: null, accent: false },
        ] satisfies AdminDashboardMetrics["kpis"]);
  const pending = metrics.pending.length > 0 ? metrics.pending : PENDING_FALLBACK;
  const today = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(new Date())
    .replace(/\.\s*/g, ".")
    .replace(/\.$/, "");

  return (
    <>
      {/* 헤더 */}
      <div className="rise-in flex flex-wrap items-center justify-between gap-3">
        <div className="text-[19px] font-extrabold text-white">
          운영 대시보드{" "}
          <span className="text-xs font-medium text-[#9aa6b8]">
            {today} (실시간)
          </span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-[10px] bg-[rgba(255,255,255,.07)] px-3.5 py-[7px] font-semibold text-[#c9d2e0]">
            오늘
          </span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">7일</span>
          <span className="px-3.5 py-[7px] text-[#9aa6b8]">30일</span>
        </div>
      </div>

      {/* KPI 4종 — 실집계 (실패 시 "—") */}
      <div className="rise-in-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`${darkCard} p-4`}>
            <div className="text-[11px] text-[#9aa6b8]">{k.label}</div>
            <div
              className={`mt-1 text-[22px] font-extrabold ${
                k.accent ? "text-[#7ea2ff]" : "text-white"
              }`}
            >
              {k.value}
              {k.delta ? (
                <>
                  {" "}
                  <span className="text-[11px] text-[#4ade80]">{k.delta}</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* 처리 대기 · 크롤링 파이프라인 */}
      <div className="rise-in-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="text-sm font-extrabold text-white">
            처리 대기{" "}
            <span className="text-[10px] font-medium text-[#9aa6b8]">
              {metrics.pending.length > 0 ? "신고 최근 5건" : "예시 데이터"}
            </span>
          </div>
          {pending.map((p, i) => (
            <div
              key={`${i}-${p.text}`}
              className={`flex items-center justify-between gap-3 py-[9px] text-xs ${
                i < pending.length - 1
                  ? "border-b border-[rgba(255,255,255,.06)]"
                  : ""
              }`}
            >
              <span className="text-[#c9d2e0]">{p.text}</span>
              <span className="font-bold" style={{ color: p.color }}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
        <div className={`${darkCard} flex flex-col gap-2.5 p-[18px]`}>
          <div className="text-sm font-extrabold text-white">
            크롤링 파이프라인
          </div>
          {PIPELINE.map((p, i) => (
            <div
              key={p.name}
              className={`flex items-center justify-between py-2 text-xs ${
                i < PIPELINE.length - 1
                  ? "border-b border-[rgba(255,255,255,.06)]"
                  : ""
              }`}
            >
              <span className="text-[#c9d2e0]">{p.name}</span>
              <span className="font-bold" style={{ color: p.color }}>
                {p.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 세부 4종 (9r) — 회원 · 콘텐츠 · 신고 · 전문가 승인 */}
      <div className="rise-in-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 회원 관리 — P2-12: profiles 최근 가입 실데이터 (실패 시 빈 상태) */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              회원 관리
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              {membersData.total !== null
                ? `총 ${membersData.total.toLocaleString("ko-KR")}명`
                : "총 —명"}
            </span>
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-1.5 border-b border-[rgba(255,255,255,.08)] py-1.5 text-[10px] text-[#9aa6b8]">
            <span>최근 가입 회원</span>
            <span className="text-right">가입</span>
          </div>
          {membersData.members.length === 0 ? (
            <div className="py-4 text-center text-[11px] text-[#9aa6b8]">
              회원 데이터를 불러올 수 없습니다 (DB 연결·권한 확인)
            </div>
          ) : (
            membersData.members.map((m, i) => (
              <div
                key={`${i}-${m.name}`}
                className={`grid grid-cols-[1.4fr_1fr] items-center gap-1.5 py-2 text-[11px] ${
                  i < membersData.members.length - 1
                    ? "border-b border-[rgba(255,255,255,.06)]"
                    : ""
                }`}
              >
                <span className="truncate font-bold text-white">{m.name}</span>
                <span className="text-right text-[#9aa6b8]">{m.joined}</span>
              </div>
            ))
          )}
        </div>

        {/* 노트 · 콘텐츠 관리 */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              노트 · 콘텐츠 관리
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              오늘 노트 156 · 글 89 · 크롤링 148
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full bg-[rgba(255,255,255,.1)] px-3 py-[5px] font-bold text-white">
              검수 대기 7
            </span>
            <span className="px-3 py-[5px] text-[#9aa6b8]">공개 노트</span>
            <span className="px-3 py-[5px] text-[#9aa6b8]">커뮤니티</span>
            <span className="px-3 py-[5px] text-[#9aa6b8]">크롤링 뉴스</span>
          </div>
          {CONTENTS.map((c, i) => (
            <div
              key={c.title}
              className={`flex items-center justify-between gap-3 py-[9px] text-[11px] ${
                i < CONTENTS.length - 1
                  ? "border-b border-[rgba(255,255,255,.06)]"
                  : ""
              }`}
            >
              <div>
                <div className="font-bold text-white">{c.title}</div>
                <div className="mt-0.5 text-[#9aa6b8]">{c.sub}</div>
              </div>
              <div className="flex flex-shrink-0 gap-1.5">
                <button className="rounded-lg bg-primary px-2.5 py-[5px] font-bold text-white">
                  {c.primary}
                </button>
                <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-2.5 py-[5px] text-[#c9d2e0]">
                  {c.secondary}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* 신고 처리 */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              신고 처리{" "}
              <span className="ml-1 rounded-full bg-danger px-[7px] py-px text-[10px] font-extrabold text-white">
                4
              </span>
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              SLA: 긴급 2h · 일반 24h
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(214,69,69,.25)] bg-[rgba(214,69,69,.08)] px-3.5 py-3">
              <div>
                <div className="text-xs font-extrabold text-white">
                  연락처 유도 (커뮤니티 글){" "}
                  <span className="rounded bg-danger px-1.5 py-px text-[9px] font-extrabold text-white">
                    긴급
                  </span>
                </div>
                <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                  “직거래 원하시면 010-…” · 신고 3건 · 작성자 전과 1회
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
                <button className="rounded-lg bg-danger px-3 py-1.5 font-bold text-white">
                  삭제+정지 7일
                </button>
                <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-3 py-1.5 text-[#c9d2e0]">
                  보류
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3">
              <div>
                <div className="text-xs font-extrabold text-white">
                  허위 매물 의심 (쪽지 신고)
                </div>
                <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                  급매 7.9억 매물 · 신고 1건 · 중개사 소명 요청됨
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
                <button className="rounded-lg bg-primary px-3 py-1.5 font-bold text-white">
                  소명 대기
                </button>
                <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-3 py-1.5 text-[#c9d2e0]">
                  기각
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] px-3.5 py-3">
              <div>
                <div className="text-xs font-extrabold text-white">
                  비방 댓글 (뉴스 댓글)
                </div>
                <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                  신고 2건 · AI 판정: 경계선 (욕설 없음)
                </div>
              </div>
              <div className="flex flex-shrink-0 gap-1.5 text-[11px]">
                <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-3 py-1.5 text-[#c9d2e0]">
                  블라인드
                </button>
                <button className="rounded-lg bg-[rgba(255,255,255,.08)] px-3 py-1.5 text-[#c9d2e0]">
                  기각
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 전문가 승인 */}
        <div className={`${panelCard} flex flex-col gap-3`}>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-extrabold text-white">
              전문가 승인{" "}
              <span className="ml-1 rounded-full bg-[#f2c94c] px-[7px] py-px text-[10px] font-extrabold text-[#12161f]">
                2
              </span>
            </span>
            <span className="text-[11px] text-[#9aa6b8]">
              승인 시 프로 배지·마켓 발행 권한
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-white">
                이OO 세무사
              </span>
              <span className="text-[10px] font-bold text-[#f2c94c]">
                검토 중 · D-1
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9aa6b8]">세무사 자격증 (제OOOO호)</span>
              <span className="font-bold text-[#4ade80]">국세청 대조 ✓</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9aa6b8]">사업자등록증 · 신분증</span>
              <span className="font-bold text-[#4ade80]">서류 확인 ✓</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-[#9aa6b8]">활동 이력 (답변 24 · 채택 9)</span>
              <span className="font-bold text-[#c9d2e0]">양호</span>
            </div>
            <div className="mt-0.5 flex gap-1.5 text-[11px]">
              <button className="flex-1 rounded-lg bg-primary p-2 text-center font-bold text-white">
                승인
              </button>
              <button className="flex-1 rounded-lg bg-[rgba(255,255,255,.08)] p-2 text-center text-[#c9d2e0]">
                보완 요청
              </button>
              <button className="flex-1 rounded-lg bg-[rgba(214,69,69,.15)] p-2 text-center text-[#d6708b]">
                반려
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.04)] p-3.5">
            <div>
              <div className="text-[13px] font-extrabold text-white">
                박OO 감정평가사
              </div>
              <div className="mt-[3px] text-[10px] text-[#9aa6b8]">
                서류 1건 누락 (자격증 사본) · 보완 요청 발송됨
              </div>
            </div>
            <span className="text-[11px] text-[#9aa6b8]">대기 3일</span>
          </div>
        </div>
      </div>
    </>
  );
}
