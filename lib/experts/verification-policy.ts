/**
 * 전문가 인증·운영 정책 (제품·법무·운영 공통 상수).
 * UI(`/legal/expert`), 접수 API, 관리자 검수 큐에서 동일 정의를 참조합니다.
 */

export type ExpertVerificationStageId =
  | "intake"
  | "auto_check"
  | "doc_review"
  | "source_check"
  | "interview"
  | "approved"
  | "rejected"
  | "suspended";

export type ExpertVerificationStage = {
  id: ExpertVerificationStageId;
  step: number;
  label: string;
  description: string;
  slaHours?: number;
};

/**
 * 실제 워크플로 — 접수 → 자동 검증 → 운영자 검토(서류·출처) → 승인.
 *
 * [965] 예전 목록은 문서 검증(48h)·출처 검증(72h)·인터뷰(120h) 를 따로 적고
 * 각 단계에 "목표 N시간" 을 붙였다. 코드에는 그런 단계가 없다 — 자동 검증
 * 다음은 /admin/quality 의 운영자 승인·반려 하나뿐이고, 인터뷰는 한 번도
 * 구현된 적이 없다. 없는 절차와 지키지 않는 SLA 는 약속이 아니라 잘못된 정보라서,
 * 실제로 일어나는 단계만 적는다. (workflow_stage 컬럼의 과거 값 호환을 위해
 * 타입의 doc_review·source_check·interview 는 남긴다.)
 */
export const EXPERT_VERIFICATION_PIPELINE: ExpertVerificationStage[] = [
  {
    id: "intake",
    step: 1,
    label: "접수",
    description: "실명, 소속, 전문분야, 지역, 자격·등록번호, 증빙 링크 제출",
  },
  {
    id: "auto_check",
    step: 2,
    label: "자동 검증",
    description: "형식 검증, 중복 자격번호·중복 접수 탐지 — 접수 즉시",
  },
  {
    id: "doc_review",
    step: 3,
    label: "운영자 검토",
    description: "증빙 서류와 협회·공식 디렉터리의 등록 상태를 함께 대조",
    slaHours: 72,
  },
  {
    id: "approved",
    step: 4,
    label: "승인",
    description: "인증 배지 부여, 상담 수신·견적 제안 개방, 약관·수수료 정책 적용",
  },
];

export type ExpertFraudRuleId =
  | "duplicate_cert"
  | "duplicate_account"
  | "identity_mismatch"
  | "name_account_mismatch"
  | "off_platform_payment"
  | "contact_leak"
  | "account_leak"
  | "high_refund_rate"
  | "report_threshold";

export type ExpertFraudRule = {
  id: ExpertFraudRuleId;
  label: string;
  description: string;
  autoAction: "warn" | "block" | "review_queue";
};

/** 사기·어뷰징 방지 장치 */
export const EXPERT_FRAUD_RULES: ExpertFraudRule[] = [
  {
    id: "duplicate_cert",
    label: "동일 자격번호 중복",
    description: "승인·대기 중인 동일 정규화 자격번호 차단",
    autoAction: "block",
  },
  {
    id: "duplicate_account",
    label: "중복 계정",
    description: "동일 이메일·CI 기준 중복 접수 탐지",
    autoAction: "review_queue",
  },
  {
    id: "identity_mismatch",
    label: "본인인증 미완료",
    description: "휴대폰 본인인증·실명 불일치",
    autoAction: "review_queue",
  },
  {
    id: "name_account_mismatch",
    label: "명의·계좌 불일치",
    description: "정산 예금주와 실명·본인인증 명의 대조",
    autoAction: "review_queue",
  },
  {
    id: "off_platform_payment",
    label: "외부 결제 유도",
    description: "카카오페이·계좌이체·현금 등 플랫폼 외 결제 유도 금지",
    autoAction: "block",
  },
  {
    id: "contact_leak",
    label: "연락처 유출",
    description: "채팅·상담 본문 내 전화·메신저 ID 자동 탐지",
    autoAction: "warn",
  },
  {
    id: "account_leak",
    label: "계좌번호 유출",
    description: "계좌·카드번호 패턴 자동 탐지·차단",
    autoAction: "block",
  },
  {
    id: "high_refund_rate",
    label: "환불 누적",
    description: "기간 내 환불·분쟁 임계값 초과 시 자동 리뷰 큐",
    autoAction: "review_queue",
  },
  {
    id: "report_threshold",
    label: "신고 누적",
    description: "신고 N건 이상 시 프로필·정산 일시 제한",
    autoAction: "review_queue",
  },
];

/** 사후 관리·재검증 */
export const EXPERT_POST_APPROVAL = {
  revalidationIntervalDays: 365,
  reportReviewThreshold: 3,
  refundReviewThreshold: 2,
  responseRateMinPercent: 70,
  openConsultSlaHours: 48,
} as const;

/** 약관·운영정책에 반드시 명시할 법무 항목 (체크리스트) */
export const EXPERT_LEGAL_DISCLOSURES = [
  "광고·스폰서 표시 의무 (유료 노출·제휴 고지)",
  "자격 검증 범위 (플랫폼이 확인한 항목 vs 전문가 자기 기재)",
  "플랫폼 책임 범위 (중개·정보 제공, 법률·세무 자문 책임 한계)",
  "환불·분쟁 처리 규정 및 처리 기한",
  "오프플랫폼 결제·연락처 교환 금지",
  "개인정보 수집·이용 (자격증 번호, 소속, 인증 서류)",
  "국외 이전 고지 (Stripe·OpenAI 등 수탁)",
] as const;

export function stageLabel(id: ExpertVerificationStageId): string {
  return EXPERT_VERIFICATION_PIPELINE.find((s) => s.id === id)?.label ?? id;
}

export function isTerminalStage(id: ExpertVerificationStageId): boolean {
  return id === "approved" || id === "rejected" || id === "suspended";
}
