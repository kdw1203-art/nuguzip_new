const lightCard =
  "flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-5";

const SCHEDULES = [
  {
    badge: "게시 중",
    badgeColor: "#1a7f4e",
    badgeBg: "#e7f5ee",
    title: "7월 실거래 데이터 반영 안내",
    meta: "전체 · 공지센터+홈 배너 · ~7/25",
  },
  {
    badge: "예약",
    badgeColor: "#1d4fd8",
    badgeBg: "rgba(29,79,216,.1)",
    title: "8/1 새벽 점검 (02~04시)",
    meta: "전체 · 7/29 09:00 게시 · D-1 푸시",
  },
  {
    badge: "예약",
    badgeColor: "#1d4fd8",
    badgeBg: "rgba(29,79,216,.1)",
    title: "프로 연간권 프로모션",
    meta: "세그먼트: 이탈 위험 · 마이 탭 배너만",
  },
];

const WEEKLY = [
  { label: "DAU", value: "18.2k", delta: "+4.1%", up: true },
  { label: "노트 작성률", value: "23%", delta: "+1.8%p", up: true },
  { label: "구독 전환", value: "3.4%", delta: "-0.2%p", up: false },
  { label: "D30 리텐션", value: "41%", delta: "+2%p", up: true },
];

const FUNNEL = [
  { flex: 1, bg: "#1d4fd8", color: "#fff", label: "100%" },
  { flex: 0.62, bg: "#4a72e2", color: "#fff", label: "62%" },
  { flex: 0.38, bg: "#7ea2ff", color: "#fff", label: "38%" },
  { flex: 0.2, bg: "#b9cbf5", color: "#33415e", label: "8%" },
];

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

export default function AdminOpsPage() {
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
              {SCHEDULES.map((s) => (
                <div
                  key={s.title}
                  className="flex items-center gap-2.5 rounded-[10px] bg-bg px-3 py-2.5"
                >
                  <span
                    className="rounded-md px-2 py-[3px] text-[9px] font-extrabold"
                    style={{ color: s.badgeColor, background: s.badgeBg }}
                  >
                    {s.badge}
                  </span>
                  <span className="flex-1 font-bold text-ink">{s.title}</span>
                  <span className="hidden text-text-3 sm:block">{s.meta}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-text-3">
              지면(홈 배너·공지센터·마이 탭)과 대상 세그먼트(12n) 지정 · 동시
              배너 최대 1개/지면
            </div>
          </div>

          {/* 운영 지표 */}
          <div className={lightCard}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-extrabold text-ink">
                운영 지표 — 이번 주
              </span>
              <span className="text-[10px] text-text-3">7/13–7/19</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEEKLY.map((m) => (
                <div key={m.label} className="rounded-xl bg-bg p-3">
                  <div className="text-[9px] text-text-3">{m.label}</div>
                  <div className="text-[17px] font-extrabold tabular-nums text-ink">
                    {m.value}
                  </div>
                  <div
                    className={`text-[9px] font-bold ${
                      m.up ? "text-[#1a7f4e]" : "text-danger"
                    }`}
                  >
                    {m.delta}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-extrabold text-text-3">
                전환 퍼널: 가입 → 첫 노트 → AI 분석 → 구독
              </div>
              <div className="flex items-center gap-1">
                {FUNNEL.map((f) => (
                  <div
                    key={f.label}
                    className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-extrabold"
                    style={{ flex: f.flex, background: f.bg, color: f.color }}
                  >
                    {f.label}
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-text-3">
                최대 이탈: 첫 노트 → AI 분석 (-24%p) — 12k 가이드 모드 실험 중
              </div>
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
              <div className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-[9px]">
                <span className="text-text-1">
                  <b>v3.2</b> 개인정보처리방침 · 위치정보 항목 추가
                </span>
                <span className="flex-shrink-0 rounded-md bg-[#e7f5ee] px-2 py-[3px] text-[9px] font-extrabold text-[#1a7f4e]">
                  시행 중
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-[10px] bg-bg px-3 py-[9px]">
                <span className="text-text-1">
                  <b>v3.3</b> 이용약관 · AI 분석 면책 조항 개정
                </span>
                <span className="flex-shrink-0 rounded-md bg-[rgba(29,79,216,.1)] px-2 py-[3px] text-[9px] font-extrabold text-primary">
                  8/20 시행 예약
                </span>
              </div>
            </div>
            <div className="rounded-[10px] bg-bg px-3 py-2.5 text-[10px] leading-[1.6] text-text-1">
              개정 고지 7/20 자동 발송(시행 30일 전) · 시행일부터 로그인 시{" "}
              <b>재동의 모달</b> · 미동의 시 서비스 이용 제한 안내. 사용자별
              동의 이력(버전·시각·채널) 조회 가능.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
