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
  { id: "auth-login-fail-rate", title: "회원가입/로그인 실패율 모니터링 (소셜/이메일별)", priority: "P0", status: "todo" },
  { id: "auth-reset-flow", title: "비밀번호 재설정 플로우 완주 테스트", priority: "P0", status: "todo" },
  { id: "perf-mobile-lcp", title: "모바일 첫 진입 LCP 최적화", priority: "P0", status: "todo" },
  { id: "api-rate-limit", title: "핵심 API 레이트리밋 (로그인/AI/댓글/신고)", priority: "P0", status: "todo" },
  { id: "error-ux", title: "에러 공통 처리 UX (재시도·문의·오류코드)", priority: "P0", status: "todo" },
  { id: "empty-seed", title: "빈 상태 데이터 시드 (완전 0화면 방지)", priority: "P0", status: "todo" },
  { id: "plan-gate-test", title: "Free/Pro/Expert 권한 경계 테스트", priority: "P0", status: "todo" },
  { id: "payment-e2e", title: "결제 성공/실패/취소/중복결제 점검", priority: "P0", status: "todo" },
  { id: "refund-flow", title: "환불/해지 요청 UX + SLA 노출", priority: "P0", status: "todo" },
  { id: "privacy-consent", title: "개인정보·위치정보 동의/철회 동작 검증", priority: "P0", status: "todo" },
  { id: "sensitive-policy", title: "성범죄/민감정보 비저장 정책 점검", priority: "P0", status: "todo" },
  { id: "community-moderation", title: "커뮤니티 신고/블라인드/제재 운영룰 확정", priority: "P0", status: "todo" },
  { id: "upload-security", title: "XSS/파일업로드 검증 (확장자·MIME·사이즈)", priority: "P0", status: "todo" },
  { id: "rls-audit", title: "RLS(행단위 권한) 정책 재점검", priority: "P0", status: "todo" },
  { id: "admin-2fa", title: "운영자 계정 2FA 적용", priority: "P0", status: "todo" },
  { id: "event-logging", title: "중요 이벤트 로깅 표준화 (가입·저장·노트·결제)", priority: "P0", status: "todo" },
  { id: "db-backup-drill", title: "DB 백업/복구 리허설 1회", priority: "P0", status: "todo" },
  { id: "incident-template", title: "장애 공지 템플릿/운영 핫라인 준비", priority: "P0", status: "todo" },

  { id: "funnel-dashboard", title: "퍼널 대시보드 구축 (방문→관심지역→노트→저장→결제)", priority: "P1", status: "todo" },
  { id: "ai-feedback-loop", title: "AI 출력 품질 평가 루프 (도움됨/부족함)", priority: "P1", status: "todo" },
  { id: "ai-evidence-guard", title: "AI 근거 누락 탐지 루프 (evidence 없는 답변 차단)", priority: "P1", status: "todo" },
  { id: "search-quality", title: "검색 품질 개선 (오타·동의어·지역 별칭)", priority: "P1", status: "todo" },
  { id: "filter-preset", title: "필터 프리셋 저장/공유", priority: "P1", status: "todo" },
  { id: "compare-ui", title: "A/B 단지 비교 화면 고도화", priority: "P1", status: "todo" },
  { id: "notification-fatigue", title: "푸시/이메일 알림 피로도 제어 (주기·묶음)", priority: "P1", status: "todo" },
  { id: "expert-sla", title: "전문가 응답 SLA 공개 (평균 응답시간)", priority: "P1", status: "todo" },

  { id: "seo-audit", title: "SEO 기술점검 (canonical, sitemap, robots, 구조화데이터)", priority: "P2", status: "todo" },
  { id: "mobile-compat", title: "앱웹뷰/모바일 브라우저 호환성 테스트 확대", priority: "P2", status: "todo" },
  { id: "cost-monitor", title: "비용 모니터링 (AI 토큰·지도 API·DB 쿼리)", priority: "P2", status: "todo" },
  { id: "exp-framework", title: "실험체계 정착 (기능 플래그·A/B·롤백)", priority: "P2", status: "todo" },
];

export type GateSummary = {
  total: number;
  totalDone: number;
  blocked: number;
  p0Total: number;
  p0Done: number;
  releaseReady: boolean;
};

/** 권장 출시 게이트: P0 18개 중 16개 이상 완료, blocked 0. */
export function summarizeGate(tasks: OpenBetaTask[]): GateSummary {
  const p0 = tasks.filter((t) => t.priority === "P0");
  const p0Done = p0.filter((t) => t.status === "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const totalDone = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;

  return {
    total,
    totalDone,
    blocked,
    p0Total: p0.length,
    p0Done,
    releaseReady: blocked === 0 && p0Done >= 16,
  };
}
