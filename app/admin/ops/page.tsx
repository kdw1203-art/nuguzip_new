import { getOperatingMetrics } from "@/lib/admin/operating-metrics";
import { loadAdminKpi } from "@/lib/admin/stats";
import { listBanners, type Banner } from "@/lib/admin/banners";

export const dynamic = "force-dynamic";

const lightCard =
  "flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5";

/** 전환 퍼널 바 색상 (진함 → 옅음) — 기존 정적 퍼널 팔레트 계승 */
const FUNNEL_BAR_COLORS = [
  "#1d4fd8",
  "#3a63de",
  "#4a72e2",
  "#6a8de9",
  "#7ea2ff",
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

const RBAC = [
  { perm: "신고 판정·배지 회수", ops: "✓", cs: "—", fin: "—" },
  { perm: "티켓 응대·환불 요청", ops: "✓", cs: "✓", fin: "—" },
  { perm: "정산 실행·계좌 정보", ops: "—", cs: "—", fin: "✓" },
  { perm: "개인정보 열람", ops: "승인제", cs: "승인제", fin: "—" },
];

function rbacCell(v: string) {
  if (v === "✓")
    return <span className="flex-1 text-center font-extrabold text-[#1a7f4e]">✓</span>;
  if (v === "승인제")
    return (
      <span className="flex-1 text-center font-extrabold text-[#e8a13a]">
        승인제
      </span>
    );
  return <span className="flex-1 text-center text-[#c9d4e5]">—</span>;
}

export default async function AdminOpsPage() {
  // #15 실집계 전환 퍼널 (가입 → 관심 저장 → 첫 임장·노트 → AI 실행 → 글 작성 → 결제).
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
          <div className={lightCard}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">
                공지·배너 스케줄러
              </span>
              <button className="rounded-[9px] bg-primary px-3.5 py-[7px] text-[11px] font-bold text-white">
                + 새 게시
              </button>
            </div>
            <div className="flex flex-col gap-[5px] text-[11px]">
              {banners.length === 0 ? (
                <div className="rounded-[10px] bg-bg px-3 py-4 text-center text-[10px] text-text-3">
                  설정된 공지·배너가 없어요 — 추가하면 지정 지면에 노출됩니다
                </div>
              ) : (
                banners.slice(0, 5).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2.5 rounded-[10px] bg-bg px-3 py-2.5"
                  >
                    <span
                      className={`rounded-md px-2 py-[3px] text-[9px] font-extrabold ${
                        b.isActive
                          ? "bg-[#e7f5ee] text-[#1a7f4e]"
                          : "bg-[rgba(0,0,0,.06)] text-text-3"
                      }`}
                    >
                      {b.isActive ? "게시 중" : "숨김"}
                    </span>
                    <span className="flex-1 truncate font-bold text-ink">{b.title}</span>
                    <span className="hidden text-text-3 sm:block">
                      {PLACEMENT_LABEL[b.placement]} · 우선 {b.priority}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="text-[10px] text-text-3">
              활성 {activeBanners.length} / 전체 {banners.length} · 지면별 우선순위로 노출.
              노출/클릭 실적은 집계 연동 후 표기합니다.
            </div>
          </div>

          {/* 운영 지표 */}
          <div className={lightCard}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-ink">운영 지표</span>
              <span className="text-[10px] text-text-3">실집계</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weekly.map((m) => (
                <div key={m.label} className="rounded-xl bg-bg p-3">
                  <div className="text-[9px] text-text-3">{m.label}</div>
                  <div className="text-[17px] font-extrabold tabular-nums text-ink">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 text-[10px] font-extrabold text-text-3">
                  전환 퍼널: {funnelHeader}
                </div>
                <span className="shrink-0 text-[9px] text-text-3">
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
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-text-3">
                    {funnel.map((step) => (
                      <span key={step.label} className="tabular-nums">
                        {stripParen(step.label)}{" "}
                        <b className="text-text-1">
                          {step.count.toLocaleString("ko-KR")}
                        </b>
                      </span>
                    ))}
                  </div>
                  {maxDrop ? (
                    <div className="text-[9px] text-text-3">
                      최대 이탈: {maxDrop.from} → {maxDrop.to} (−{maxDrop.pp}%p)
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-md bg-bg px-3 py-4 text-center text-[10px] text-text-3">
                  퍼널 데이터 없음 — 집계 이벤트가 쌓이면 표시됩니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 우측 */}
        <div className="flex flex-col gap-4">
          {/* RBAC */}
          <div className={lightCard}>
            <div className="text-sm font-extrabold text-ink">
              역할별 권한 (RBAC)
            </div>
            <div className="flex flex-col text-[10px]">
              <div className="flex rounded-t-lg bg-bg px-2.5 py-[7px] font-extrabold text-text-3">
                <span className="flex-[1.4]">권한</span>
                <span className="flex-1 text-center">운영</span>
                <span className="flex-1 text-center">CS</span>
                <span className="flex-1 text-center">재무</span>
              </div>
              {RBAC.map((r, i) => (
                <div
                  key={r.perm}
                  className={`flex px-2.5 py-[7px] text-text-1 ${
                    i < RBAC.length - 1 ? "border-b border-[#f0f3f8]" : ""
                  }`}
                >
                  <span className="flex-[1.4]">{r.perm}</span>
                  {rbacCell(r.ops)}
                  {rbacCell(r.cs)}
                  {rbacCell(r.fin)}
                </div>
              ))}
            </div>
            <div className="text-[10px] text-text-3">
              개인정보 열람은 건별 사유 입력 + 감사 로그 · 권한 변경은 관리자
              2인 승인
            </div>
          </div>

          {/* 약관 · 개인정보 버전 관리 */}
          <div className={lightCard}>
            <div className="text-sm font-extrabold text-ink">
              약관 · 개인정보 버전 관리
            </div>
            <div className="flex flex-col gap-[5px] text-[11px]">
              <a
                href="/legal/terms"
                className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-[9px] no-underline"
              >
                <span className="text-text-1">이용약관 (현행)</span>
                <span className="flex-shrink-0 rounded-md bg-[#e7f5ee] px-2 py-[3px] text-[9px] font-extrabold text-[#1a7f4e]">
                  보기
                </span>
              </a>
              <a
                href="/legal/privacy"
                className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-[9px] no-underline"
              >
                <span className="text-text-1">개인정보처리방침 (현행)</span>
                <span className="flex-shrink-0 rounded-md bg-[rgba(29,79,216,.1)] px-2 py-[3px] text-[9px] font-extrabold text-primary">
                  보기
                </span>
              </a>
            </div>
            <div className="rounded-[10px] bg-bg px-3 py-2.5 text-[10px] leading-[1.6] text-text-1">
              현행 약관·방침은 각 페이지에 버전·시행일 이력으로 관리됩니다. 개정 시 재동의
              모달·동의 이력 기능은 연동 후 이 자리에서 관리해요.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
