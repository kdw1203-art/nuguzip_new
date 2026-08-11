import Link from "next/link";
import type { Session } from "next-auth";
import { getOperatingMetrics } from "@/lib/admin/operating-metrics";
import { loadAdminKpi } from "@/lib/admin/stats";
import { listBanners, type Banner } from "@/lib/admin/banners";
import {
  STAFF_ROLE_LABEL,
  canAccessAdminSection,
  type AdminSection,
  type StaffRole,
} from "@/lib/auth/staff-roles";

export const dynamic = "force-dynamic";

/* 다크 셸(#12161f) 위에 라이트 토큰 카드가 떠 있던 것을 다크 카드로 통일
   (2026-08-02 감사 — 관리자 콘솔 다크 테마 규칙). */
const darkCard =
  "flex flex-col gap-2.5 rounded-[20px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-5";

/** 전환 퍼널 바 색상 (진함 → 옅음) — 기존 정적 퍼널 팔레트 계승 */
const FUNNEL_BAR_COLORS = [
  "#1d4fd8",
  "#3a63de",
  "#4a72e2",
  "#6a8de9",
  "var(--ai-accent)",
  "#b9cbf5",
];

function funnelBarColor(i: number): string {
  return FUNNEL_BAR_COLORS[Math.min(i, FUNNEL_BAR_COLORS.length - 1)];
}

/** 가장 옅은 마지막 색은 대비를 위해 어두운 글자 */
function funnelTextColor(i: number): string {
  return i >= FUNNEL_BAR_COLORS.length - 1 ? "#33415e" : "#fff";
}

/** 라벨의 "(30일)" 등 괄호 보조 문구 제거 */
function stripParen(label: string): string {
  return label.replace(/\s*\(.*?\)\s*/g, "").trim();
}

/** 배너 지면 라벨 */
const PLACEMENT_LABEL: Record<Banner["placement"], string> = {
  home: "홈",
  community: "커뮤니티",
  market: "마켓",
  inspection: "임장",
  global: "전역",
};

/* 2026-07-27: 여기 있던 RBAC 표는 손으로 적은 상수(`신고 판정·배지 회수 / 운영 ✓` 등)였다.
   실집계 지표 바로 옆에서 "콘솔의 현재 권한 설정"처럼 읽혔지만, 실제 접근 제어는
   lib/auth/staff-roles.ts 의 canAccessAdminSection 이 하고 있었고 이 표는 그 함수를
   한 번도 읽지 않았다 — 역할 권한을 고쳐도 표는 옛 값을 계속 보여주는(그래서 아무도
   틀린 걸 모르는) 조용한 드리프트 구조였다. 표를 지우는 대신 실제 판정 함수에서
   셀을 뽑아 오도록 바꿨다. 아래 라벨 맵을 Record<AdminSection|StaffRole, string> 로
   잡아 둔 이유는, 섹션이나 역할이 새로 생기면 이 파일이 컴파일 에러로 먼저 터지게
   해서 표가 조용히 낡지 않게 하려는 것이다. */

/** 콘솔 섹션 한글 라벨 — 키 누락 시 컴파일 에러(드리프트 방지) */
const SECTION_LABEL: Record<AdminSection, string> = {
  overview: "대시보드 개요",
  billing: "결제·정산",
  policy: "정책·금칙어",
  moderation: "신고·블라인드",
  verification: "전문가 인증 심사",
  etl: "데이터 적재(ETL)",
  support: "고객 문의(CS)",
  users: "회원 관리",
  analytics: "통계·유입",
  invest: "투자 지표",
};

/** 표 헤더용 짧은 역할명 (원래 라벨은 title 속성으로 노출) */
const ROLE_SHORT: Record<StaffRole, string> = {
  super_admin: "Super",
  ops_admin: "운영",
  verification_admin: "인증",
  data_admin: "데이터",
  cs_manager: "CS",
};

const RBAC_SECTIONS = Object.keys(SECTION_LABEL) as AdminSection[];
const RBAC_ROLES = Object.keys(ROLE_SHORT) as StaffRole[];

/** 권한 규칙을 표용으로 복제하지 않으려고, 역할만 실은 최소 세션을 실제 판정 함수에
 *  그대로 넣어 본다. resolveStaffRole 이 staffRole 클레임을 그 역할로 해석한다. */
function probeSession(role: StaffRole): Session {
  return {
    user: { email: `rbac-probe+${role}@nuguzip.invalid`, staffRole: role },
  } as unknown as Session;
}

export default async function AdminOpsPage() {
  // 실집계 전환 퍼널 (활성방문 → 임장노트 → AI·LLM / AI·규칙 → 지도 핸드오프 → 결제).
  // 조회 실패·빈 데이터 시 빈 배열 → 아래에서 "데이터 없음" 빈 상태 렌더.
  const [funnel, kpi, banners] = await Promise.all([
    getOperatingMetrics(),
    loadAdminKpi(),
    listBanners().catch(() => [] as Banner[]),
  ]);
  const hasFunnel = funnel.length > 0 && funnel.some((s) => s.count > 0);

  // 운영 지표 — 실집계(loadAdminKpi). 조작 KPI(DAU/리텐션 등) 대신 실 수치만.
  const weekly: { label: string; value: string }[] = [
    { label: "신규 가입(7일)", value: kpi.newUsers7d.toLocaleString("ko-KR") },
    { label: "활성 사용자(7일)", value: kpi.activeUsers7d.toLocaleString("ko-KR") },
    { label: "이번 주 글", value: kpi.postsThisWeek.toLocaleString("ko-KR") },
    { label: "전체 사용자", value: kpi.totalUsers.toLocaleString("ko-KR") },
  ];
  const activeBanners = banners.filter((b) => b.isActive);
  const funnelHeader = hasFunnel
    ? funnel.map((s) => stripParen(s.label)).join(" → ")
    : "가입 → 관심 저장 → 첫 임장·노트 → AI 실행 → 글 작성 → 결제";

  // 최대 이탈 구간 = 연속 스텝 pctOfSignup 차이가 가장 큰 구간 (실집계 기반)
  let maxDrop: { from: string; to: string; pp: number } | null = null;
  for (let i = 1; i < funnel.length; i += 1) {
    const prev = funnel[i - 1];
    const cur = funnel[i];
    if (prev.pctOfSignup != null && cur.pctOfSignup != null) {
      const pp = Math.round((prev.pctOfSignup - cur.pctOfSignup) * 10) / 10;
      if (pp > 0 && (maxDrop === null || pp > maxDrop.pp)) {
        maxDrop = { from: stripParen(prev.label), to: stripParen(cur.label), pp };
      }
    }
  }

  return (
    <>
      <div className="rise-in text-[19px] font-extrabold text-white">
        공지·배너 스케줄러 · 운영 지표 · 권한(RBAC) · 약관 버전 관리
      </div>

      <div className="rise-in-1 grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
        {/* 좌측 */}
        <div className="flex flex-col gap-4">
          {/* 공지·배너 스케줄러 */}
          <div className={darkCard}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-white">
                공지·배너 스케줄러
              </span>
              {/* 2026-07-27: async 서버 컴포넌트 안의 <button> 이라 onClick 을 붙일 수
                  없었고, 실제로 아무것도 안 하는 버튼이었다. 배너 등록·수정은 이미
                  /admin/banners 의 BannersClient 가 담당하므로 그리로 보낸다. */}
              <Link
                href="/admin/banners"
                className="rounded-[9px] bg-primary px-3.5 py-[7px] text-[11px] font-bold text-white no-underline"
              >
                + 새 게시
              </Link>
            </div>
            <div className="flex flex-col gap-[5px] text-[11px]">
              {banners.length === 0 ? (
                <div className="rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-4 text-center text-[10px] text-[#9aa6b8]">
                  설정된 공지·배너가 없어요 — 추가하면 지정 지면에 노출됩니다
                </div>
              ) : (
                banners.slice(0, 5).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-2.5"
                  >
                    <span
                      className={`rounded-md chip-pad text-[9px] font-extrabold ${
                        b.isActive
                          ? "bg-success-soft text-success"
                          : "bg-[rgba(0,0,0,.06)] text-[#9aa6b8]"
                      }`}
                    >
                      {b.isActive ? "게시 중" : "숨김"}
                    </span>
                    <span className="flex-1 truncate font-bold text-white">{b.title}</span>
                    <span className="hidden text-[#9aa6b8] sm:block">
                      {PLACEMENT_LABEL[b.placement]} · 우선 {b.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="text-[10px] text-[#9aa6b8]">
              활성 {activeBanners.length} / 전체 {banners.length} · 지면별 우선순위로 노출.
              노출/클릭 실적은 집계 연동 후 표기합니다.
            </div>
          </div>

          {/* 운영 지표 */}
          <div className={darkCard}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-white">운영 지표</span>
              <span className="text-[10px] text-[#9aa6b8]">실집계</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weekly.map((m) => (
                <div key={m.label} className="rounded-xl bg-[rgba(255,255,255,.05)] p-3">
                  <div className="text-[9px] text-[#9aa6b8]">{m.label}</div>
                  <div className="text-[17px] font-extrabold tabular-nums text-white">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 text-[10px] font-extrabold text-[#9aa6b8]">
                  전환 퍼널: {funnelHeader}
                </div>
                <span className="shrink-0 text-[9px] text-[#9aa6b8]">
                  가입 30일 기준
                </span>
              </div>
              {hasFunnel ? (
                <>
                  <div className="flex items-center gap-1">
                    {funnel.map((step, i) => {
                      const pct = step.pctOfSignup;
                      const flex = Math.max(0.14, Math.min(1, (pct ?? 0) / 100));
                      return (
                        <div
                          key={step.label}
                          title={`${step.label} · ${step.count.toLocaleString(
                            "ko-KR",
                          )}명${pct != null ? ` · ${pct}%` : ""}`}
                          className="flex h-[22px] items-center justify-center overflow-hidden rounded-md px-1 text-[9px] font-extrabold"
                          style={{
                            flex,
                            background: funnelBarColor(i),
                            color: funnelTextColor(i),
                          }}
                        >
                          {pct != null ? `${pct}%` : "—"}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#9aa6b8]">
                    {funnel.map((step) => (
                      <span key={step.label} className="tabular-nums">
                        {stripParen(step.label)}{" "}
                        <b className="text-[#c9d2e0]">
                          {step.count.toLocaleString("ko-KR")}
                        </b>
                      </span>
                    ))}
                  </div>
                  {maxDrop ? (
                    <div className="text-[9px] text-[#9aa6b8]">
                      최대 이탈: {maxDrop.from} → {maxDrop.to} (−{maxDrop.pp}%p)
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-md bg-[rgba(255,255,255,.05)] px-3 py-4 text-center text-[10px] text-[#9aa6b8]">
                  퍼널 데이터 없음 — 집계 이벤트가 쌓이면 표시됩니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 우측 */}
        <div className="flex flex-col gap-4">
          {/* RBAC */}
          <div className={darkCard}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-extrabold text-white">
                역할별 권한 (RBAC)
              </span>
              <span className="shrink-0 text-[10px] text-[#9aa6b8]">
                staff-roles 실제 판정
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-[300px] flex-col text-[10px]">
                <div className="flex rounded-t-lg bg-[rgba(255,255,255,.05)] px-2.5 py-[7px] font-extrabold text-[#9aa6b8]">
                  <span className="flex-[1.6]">콘솔 섹션</span>
                  {RBAC_ROLES.map((role) => (
                    <span
                      key={role}
                      className="flex-1 text-center"
                      title={STAFF_ROLE_LABEL[role]}
                    >
                      {ROLE_SHORT[role]}
                    </span>
                  ))}
                </div>
                {RBAC_SECTIONS.map((section, i) => (
                  <div
                    key={section}
                    className={`flex px-2.5 py-[7px] text-[#c9d2e0] ${
                      i < RBAC_SECTIONS.length - 1
                        ? "border-b border-[#f0f3f8]"
                        : ""
                    }`}
                  >
                    <span className="flex-[1.6]">{SECTION_LABEL[section]}</span>
                    {RBAC_ROLES.map((role) => {
                      const allowed = canAccessAdminSection(
                        probeSession(role),
                        section,
                      );
                      return (
                        <span
                          key={role}
                          className={`flex-1 text-center ${
                            allowed ? "font-extrabold text-success" : "text-[#9aa6b8]"
                          }`}
                        >
                          {allowed ? "✓" : "—"}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-[10px] leading-[1.6] text-[#9aa6b8]">
              위 표는 <b className="text-[#c9d2e0]">lib/auth/staff-roles.ts</b> 의 접근
              판정을 그대로 호출해 그립니다 — 콘솔이 실제로 막는 것과 어긋날 수
              없어요. 아래 두 줄은 아직 코드로 강제되지 않는{" "}
              <b className="text-[#c9d2e0]">운영 정책 문서</b>이며 적용된 설정이
              아닙니다: 개인정보 열람은 건별 사유 입력 + 감사 로그 · 권한 변경은
              관리자 2인 승인.
            </div>
          </div>

          {/* 약관 · 개인정보 버전 관리 */}
          <div className={darkCard}>
            <div className="text-sm font-extrabold text-white">
              약관 · 개인정보 버전 관리
            </div>
            <div className="flex flex-col gap-[5px] text-[11px]">
              <a
                href="/legal/terms"
                className="flex items-center justify-between gap-2 rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-[9px] no-underline"
              >
                <span className="text-[#c9d2e0]">이용약관 (현행)</span>
                <span className="flex-shrink-0 rounded-md bg-success-soft chip-pad text-[9px] font-extrabold text-success">
                  보기
                </span>
              </a>
              <a
                href="/legal/privacy"
                className="flex items-center justify-between gap-2 rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-[9px] no-underline"
              >
                <span className="text-[#c9d2e0]">개인정보처리방침 (현행)</span>
                <span className="flex-shrink-0 rounded-md bg-[rgba(126,162,255,.14)] chip-pad text-[9px] font-extrabold text-ai-accent">
                  보기
                </span>
              </a>
            </div>
            <div className="rounded-[10px] bg-[rgba(255,255,255,.05)] px-3 py-2.5 text-[10px] leading-[1.6] text-[#c9d2e0]">
              현행 약관·방침은 각 페이지에 버전·시행일 이력으로 관리됩니다. 개정 시 재동의
              모달·동의 이력 기능은 연동 후 이 자리에서 관리해요.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
