/**
 * 개인정보·컴플라이언스 구현 기준 (개인정보처리방침·UI·ETL 공통)
 */

/** 임장 캡처 동의 버전 — field-capture-consent 와 동기화 */
export const FIELD_CAPTURE_CONSENT_VERSION = "2026-06-19";

/** 보관기간 분리 (일) — UI·cron·방침 표와 동일하게 유지 */
export const DATA_RETENTION_DAYS = {
  /** 원본 음성(STT 전) */
  voiceRaw: 90,
  /** STT·AI 요약 결과 (회원 유지 중) */
  aiTranscript: 365,
  /** 임장 사진 원본 */
  fieldPhoto: 365,
  /** GPS 정밀 좌표 — 구·동 단위로 축소 저장 권장 */
  preciseLocation: 90,
  /** 서비스 이용 로그 */
  accessLog: 365,
} as const;

/** AI API 위탁·국외 이전 (방침 3항과 동일) */
export const AI_PROCESSORS = [
  { name: "OpenAI, L.L.C.", region: "미국", purpose: "STT·비전·텍스트 요약" },
  { name: "Anthropic PBC", region: "미국", purpose: "텍스트 분석(선택)" },
] as const;

/**
 * 성범죄·치안 원자료는 ETL·DB에 있더라도 UI에는 집계형 지표만 노출.
 * @see DistrictSnapshotDocument.safety.crimeRiskIndex
 */
export const SAFETY_UI_POLICY = {
  allowIndividualAddress: false,
  displayMode: "aggregate_index" as const,
  indexLabel: "지역 치안·안전 종합 지수",
  disclaimer:
    "개인을 특정할 수 있는 주소·사건 단위 정보는 표시하지 않으며, 행정구역 단위 집계 지표만 제공합니다.",
};

/**
 * 공식 전문직·기관 데이터 — API·협약 없이 대규모 스크래핑을 기본 전제로 하지 않음.
 */
export const DATA_SOURCING_POLICY = {
  preferOfficialApi: true,
  requireTermsOrPartnershipForBulkScrape: true,
  verifiedRegistrySources: [
    "국토교통부 공공데이터",
    "행정안전부·통계청 공개 API",
    "공인중개사법 시행령상 공개 검색(출처 링크·robots 준수)",
  ],
} as const;

/** 업로드 전 민감 정보 비포함 기본값 안내 */
export const FIELD_CAPTURE_DEFAULTS = {
  excludeIdCards: true,
  excludeThirdPartyFacesDefault: true,
  voiceMemoSelfOnly: true,
  locationGranularity: "district" as const,
};
