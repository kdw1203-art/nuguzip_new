export type GatePriority = "P0" | "P1" | "P2";
export type GateStatus = "todo" | "doing" | "done" | "blocked";

export type OpenBetaTask = {
  id: string;
  title: string;
  priority: GatePriority;
  status: GateStatus;
  owner?: string;
  dueDate?: string;
  note?: string;
};

/** 오픈베타 직전 실무 체크리스트 (기본 시드; 운영 시 `open_beta_tasks` 테이블과 동기). */
export const OPEN_BETA_TASKS: OpenBetaTask[] = [
  {
    id: "auth-login-fail-rate",
    title: "회원가입/로그인 실패율 모니터링 (소셜/이메일별)",
    priority: "P0",
    status: "done",
    note: "AUTH_LOGIN_OK/FAIL + /admin/ops 성장 레이어 실패율(7일).",
  },
  {
    id: "auth-reset-flow",
    title: "비밀번호 재설정 플로우 완주 테스트",
    priority: "P0",
    status: "done",
    note: "scripts/smoke-auth-reset.mjs — 경로·잘못된 토큰. 실메일 완주는 Resend ops.",
  },
  {
    id: "perf-mobile-lcp",
    title: "모바일 첫 진입 LCP 최적화",
    priority: "P0",
    status: "done",
    note: "Pretendard 비차단 preload+media swap (layout). 추후 Lighthouse 재측정 권장.",
  },
  {
    id: "api-rate-limit",
    title: "핵심 API 레이트리밋 (로그인/AI/댓글/신고)",
    priority: "P0",
    status: "done",
    note: "NextAuth POST·password email·AI·reports WRITE_RATE_LIMIT 연결.",
  },
  {
    id: "error-ux",
    title: "에러 공통 처리 UX (재시도·문의·오류코드)",
    priority: "P0",
    status: "done",
    note: "ErrorState/Toast + AI 쿼터 403→/subscription CTA.",
  },
  {
    id: "empty-seed",
    title: "빈 상태 데이터 시드 (완전 0화면 방지)",
    priority: "P0",
    status: "done",
    note: "공개노트 empty+CTA. 스태프 시드: docs/ops/staff-public-note-seed.md",
  },
  {
    id: "plan-gate-test",
    title: "Free/Pro/Expert 권한 경계 테스트",
    priority: "P0",
    status: "done",
    note: "scripts/smoke-plan-gate.mjs — 미인증 AI 401·구독/체크아웃 경로.",
  },
  {
    id: "business-disclosure",
    title: "사업자 주소·통신판매업 고지 완료 (유료 결제 전제)",
    priority: "P0",
    status: "blocked",
    note: "코드: 고지 미완 시 Stripe/카카오페이 503. 주소·유선번호는 코드 상수(business-info.ts), 남은 env 는 MAIL_ORDER 신고번호뿐.",
  },
  {
    id: "payment-e2e",
    title: "결제 성공/실패/취소/중복결제 점검",
    priority: "P0",
    status: "blocked",
    note: "경로 스모크+해지요청 UX. 실결제: docs/ops/payment-e2e-checklist.md (오너).",
  },
  {
    id: "refund-flow",
    title: "환불/해지 요청 UX + SLA 노출",
    priority: "P0",
    status: "done",
    note: "BillingPanel — CS 경로 + 영업일 1일 접수확인 SLA·약관 링크.",
  },
  {
    id: "privacy-consent",
    title: "개인정보·위치정보 동의/철회 동작 검증",
    priority: "P0",
    status: "done",
    note: "가입 선택동의 + /api/me/consents + 설정 개인정보 탭 철회.",
  },
  {
    id: "sensitive-policy",
    title: "성범죄/민감정보 비저장 정책 점검",
    priority: "P0",
    status: "done",
    note: "docs/ops/sensitive-data-policy.md + npm run check:sensitive-policy.",
  },
  {
    id: "community-moderation",
    title: "커뮤니티 신고/블라인드/제재 운영룰 확정",
    priority: "P0",
    status: "done",
    note: "docs/ops/moderation-runbook.md — SLA 수치는 오너 확정 전 초안.",
  },
  {
    id: "upload-security",
    title: "XSS/파일업로드 검증 (확장자·MIME·사이즈)",
    priority: "P0",
    status: "done",
    note: "upload magic-byte sniff + empty reject + EXIF strip.",
  },
  {
    id: "rls-audit",
    title: "RLS(행단위 권한) 정책 재점검",
    priority: "P0",
    status: "done",
    note: "npm run check:rls-shape (마이그레이션+선택 라이브). Advisor UI는 오너 주기 확인.",
  },
  {
    id: "admin-2fa",
    title: "운영자 계정 2FA 적용",
    priority: "P0",
    status: "blocked",
    note: "docs/ops/admin-2fa.md — 스태프 MFA 등록은 오너 콘솔 작업.",
  },
  {
    id: "event-logging",
    title: "중요 이벤트 로깅 표준화 (가입·저장·노트·결제)",
    priority: "P0",
    status: "done",
    note: "FUNNEL_EVENT + ops funnel(LLM/규칙/지도/피드백/회차비교·로그인).",
  },
  {
    id: "db-backup-drill",
    title: "DB 백업/복구 리허설 1회",
    priority: "P0",
    status: "blocked",
    note: "docs/ops/db-backup-drill.md — 실복구는 오너 Supabase Console.",
  },
  {
    id: "incident-template",
    title: "장애 공지 템플릿/운영 핫라인 준비",
    priority: "P0",
    status: "done",
    note: "docs/ops/incident-template.md",
  },

  {
    id: "funnel-dashboard",
    title: "퍼널 대시보드 구축 (방문→노트→LLM/규칙→지도→결제)",
    priority: "P1",
    status: "done",
    note: "/admin/ops + lib/admin/operating-metrics.ts — AI LLM/규칙·지도 핸드오프 분리.",
  },
  {
    id: "ai-feedback-loop",
    title: "AI 출력 품질 평가 루프 (도움됨/부족함)",
    priority: "P1",
    status: "done",
    note: "POST /api/ai/feedback + AiFeedbackButtons — ai_feedback 이벤트, 실행 KPI와 분리.",
  },
  {
    id: "ai-evidence-guard",
    title: "AI 근거 누락 탐지 루프 (evidence 없는 답변 차단)",
    priority: "P1",
    status: "done",
    note: "/api/inspection/ai — 빈 LLM 응답은 rule-based(evidence-guard)로 강등.",
  },
  { id: "search-quality", title: "검색 품질 개선 (오타·동의어·지역 별칭)", priority: "P1", status: "todo" },
  { id: "filter-preset", title: "필터 프리셋 저장/공유", priority: "P1", status: "todo" },
  {
    id: "compare-ui",
    title: "A/B 단지 비교 화면 고도화",
    priority: "P1",
    status: "done",
    note: "/notes/compare — 지도·단지 A/B 링크 + FIELD_COMPARE_ADD 퍼널.",
  },
  { id: "notification-fatigue", title: "푸시/이메일 알림 피로도 제어 (주기·묶음)", priority: "P1", status: "todo" },
  {
    id: "expert-sla",
    title: "전문가 응답 SLA 공개 (평균 응답시간)",
    priority: "P1",
    status: "done",
    note: "실측 SLA 없을 때 허수 숨김(빈 상태·고지). 실측 연동 후 수치 공개.",
  },

  { id: "seo-audit", title: "SEO 기술점검 (canonical, sitemap, robots, 구조화데이터)", priority: "P2", status: "todo" },
  { id: "mobile-compat", title: "앱웹뷰/모바일 브라우저 호환성 테스트 확대", priority: "P2", status: "todo" },
  { id: "cost-monitor", title: "비용 모니터링 (AI 토큰·지도 API·DB 쿼리)", priority: "P2", status: "todo" },
  { id: "exp-framework", title: "실험체계 정착 (기능 플래그·A/B·롤백)", priority: "P2", status: "todo" },
];

/** 하드 오픈(유료·운영 완료) 전 오너 전용 — 코드만으로 done 처리 금지 */
export const OWNER_ONLY_GATE_IDS = [
  "business-disclosure",
  "payment-e2e",
  "admin-2fa",
  "db-backup-drill",
] as const;

export type GateSummary = {
  total: number;
  totalDone: number;
  blocked: number;
  p0Total: number;
  p0Done: number;
  /** 유료·운영 완료 포함 — blocked 0 && P0 done≥16 */
  releaseReady: boolean;
  /** 무료 소프트 오픈: 오너 전용 블로커만 남고 코드 P0는 완료 */
  softOpenReady: boolean;
  ownerBlocked: number;
};

/** 권장 출시 게이트: P0 중 done≥16, blocked 0. (blocked 있으면 미충족) */
export function summarizeGate(tasks: OpenBetaTask[]): GateSummary {
  const p0 = tasks.filter((t) => t.priority === "P0");
  const p0Done = p0.filter((t) => t.status === "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const totalDone = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const ownerSet = new Set<string>(OWNER_ONLY_GATE_IDS);
  const ownerBlocked = tasks.filter(
    (t) => t.status === "blocked" && ownerSet.has(t.id),
  ).length;
  const nonOwnerBlocked = tasks.filter(
    (t) => t.status === "blocked" && !ownerSet.has(t.id),
  ).length;
  const codeP0 = p0.filter((t) => !ownerSet.has(t.id));
  const codeP0Done = codeP0.filter((t) => t.status === "done").length;

  return {
    total,
    totalDone,
    blocked,
    p0Total: p0.length,
    p0Done,
    releaseReady: blocked === 0 && p0Done >= 16,
    softOpenReady: nonOwnerBlocked === 0 && codeP0Done === codeP0.length,
    ownerBlocked,
  };
}
