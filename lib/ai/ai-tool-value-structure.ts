import { CORE_AI_TOOL_IDS, type AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type CoreAiToolId = (typeof CORE_AI_TOOL_IDS)[number];

export const CORE_TOOL_LABEL: Record<CoreAiToolId, string> = {
  "ai-diagnosis": "AI 투자 진단",
  "ai-prediction": "시세 예측 AI",
  "ai-inspection": "맞춤 임장 추천",
  "ai-timing": "AI 매수 타이밍",
};

export function isCoreAiToolId(id: AiAnalysisToolId): id is CoreAiToolId {
  return (CORE_AI_TOOL_IDS as readonly string[]).includes(id);
}

/** 이용자에게 주는 가치 + 자체(내부) 분석 스택 설명 — 4개 핵심 도구 전용 */
export const AI_TOOL_USER_VALUE: Record<
  CoreAiToolId,
  {
    /** 한 줄 가치 제안 */
    promise: string;
    /** 이런 때 쓰면 좋아요 */
    whenToUse: string[];
    /** 실행 후 구체적으로 얻는 것 */
    concreteOutcomes: string[];
    /** 자체 엔진 파이프라인 (외부 LLM과 구분) */
    internalPipeline: { name: string; does: string }[];
    /** 결과를 이렇게 활용하세요 */
    useResultsLike: string[];
  }
> = {
  "ai-diagnosis": {
    promise: "지금 넣은 조건이 ‘살 만한지 / 어디를 더 볼지’ 판단할 근거를 한 번에 정리합니다.",
    whenToUse: [
      "후보 단지가 여러 개라 비교 문장이 필요할 때",
      "호가·전세가율·입지 가중치를 내 기준에 맞게 말로 정리하고 싶을 때",
      "대출·금리 변화가 부담에 얼마나 영향 줄지 감을 잡고 싶을 때",
    ],
    concreteOutcomes: [
      "입력한 시세·면적·거래량이 반영된 내부 스코어·전세가율 요약",
      "워크벤치 샘플 단지군 대비 상대적 위치(참고)",
      "선택 시 외부 LLM 서술로 통과/주의 포인트 문장화",
      "오른쪽 즉석 진단으로 단지 키워드만 바꿔 빠른 시나리오 확인",
    ],
    internalPipeline: [
      { name: "입력 정규화", does: "구·동·단지·시세·가중치를 JSON 스냅샷으로 고정" },
      { name: "워크벤치 스코어", does: "샘플 단지 DB에서 종합점수·전세가율·추세 지표 산출" },
      { name: "민감도 근사", does: "LTV·금리 가정 시 월 상환 변화 1차 근사(참고용)" },
      { name: "스냅샷 → 서술", does: "규칙 기반 마크다우 또는(선택) 외부 LLM 프롬프트에 동일 스냅샷 전달" },
    ],
    useResultsLike: [
      "임장 전 질문 리스트를 본문에서 골라 메모에 옮기기",
      "호가가 샘플과 많이 다르면 실거래·중개 호가로 재입력 후 재실행",
      "즉석 진단으로 부모·배우자에게 짧게 설명할 문장 만들기",
    ],
  },
  "ai-prediction": {
    promise: "같은 단지라도 시나리오(낙관·기본·비관)에 따라 ‘기대 구간’을 나란히 볼 수 있습니다.",
    whenToUse: [
      "몇 년 뒤 시세를 구간으로 보고 싶을 때",
      "거래 유형(매매·전세)을 바꿔가며 감을 비교할 때",
      "외부 LLM에 불확실성 문단까지 포함한 서술을 맡기고 싶을 때",
    ],
    concreteOutcomes: [
      "기간·시나리오별 샘플 기반 추정치(차트·표와 연동)",
      "입력 호가와 워크벤치 호가 대비 %",
      "내부 규칙 요약 + 선택적 외부 LLM의 시나리오별 해석",
    ],
    internalPipeline: [
      { name: "범위 고정", does: "구·동·단지 단위와 거래 유형·예측 연수 확정" },
      { name: "시나리오 계수", does: "낙관/기본/비관에 따른 샘플 추세 가공" },
      { name: "스냅샷 생성", does: "진단과 동일 스키마로 차트·AI 입력 공유" },
      { name: "선택 LLM", does: "동일 스냅샷으로 서술형만 외부 API에서 생성" },
    ],
    useResultsLike: [
      "낙관·비관 두 극단을 모두 읽고 본인 리스크에 맞는 중간 시나리오 잡기",
      "임장·실거래 확인 후 입력 시세만 바꿔 재실행해 민감도 보기",
    ],
  },
  "ai-inspection": {
    promise:
      "‘언제·어디를 어떤 순서로 볼지’를 목표·동선·조건에 맞게 임장 계획 문장으로 받습니다.",
    whenToUse: [
      "처음 가보는 동네라 체크리스트·동선이 필요할 때",
      "실거주 vs 투자 목적이 섞여 우선순위를 정하고 싶을 때",
      "학군·역세권 등 필수 조건을 AI 서술에 녹이고 싶을 때",
    ],
    concreteOutcomes: [
      "목표·이동시간·요일·키워드가 반영된 코스·포인트 서술",
      "프로필 예산과 입력 예산 오버라이드가 스냅샷에 포함",
      "임장 허브·노트 작성으로 바로 이어지는 다음 행동 제안",
    ],
    internalPipeline: [
      { name: "선호 정규화", does: "목표·동선·must-have·메모를 구조화" },
      { name: "프로필 병합", does: "마이페이지 투자 성향·예산 범위와 합성" },
      { name: "스냅샷", does: "임장·진단 도구와 링크 가능한 JSON" },
      { name: "선택 LLM", does: "코스 문장·주의사항만 외부 API에서 생성" },
    ],
    useResultsLike: [
      "결과를 복사해 임장노트 ‘목표’에 붙여 넣기",
      "허브에서 노트를 만들고 현장에서 체크리스트만 켜기",
    ],
  },
  "ai-timing": {
    promise:
      "관심 구·시그널 표를 바탕으로 지금이 관망/진입 중 어디에 가까운지 말로 정리합니다.",
    whenToUse: [
      "여러 구를 동시에 보고 시그널 요약이 필요할 때",
      "관망 기간·분할 매수 등 매수 전략을 조건에 맞게 쓰고 싶을 때",
      "관심 단지 리스트를 넣고 해석 문단을 받고 싶을 때",
    ],
    concreteOutcomes: [
      "선택한 구·필터에 맞춘 시그널 샘플 행이 스냅샷에 포함",
      "관망 개월·긴급도·분할/일시가 서술에 반영",
      "하단 시그널 표로 숫자 확인 + 본문으로 의미 정리",
    ],
    internalPipeline: [
      { name: "필터 병합", does: "구 멀티선택 + 키워드로 TIMING 샘플 행 추출" },
      { name: "전략 필드", does: "기간·긴급도·진입 방식·워치리스트 구조화" },
      { name: "스냅샷", does: "표 일부 + 사용자 조건을 LLM/규칙에 전달" },
      { name: "선택 LLM", does: "시장 타이밍 서술만 외부 API에서 생성" },
    ],
    useResultsLike: [
      "시그널이 WAIT인 구는 실거래 속도·호가 추이를 따로 확인",
      "BUY라도 본인 대출·현금 흐름과 맞는지 진단 도구로 교차 확인",
    ],
  },
};

export function getCoreToolUserValue(tool: AiAnalysisToolId) {
  if (!isCoreAiToolId(tool)) return null;
  return AI_TOOL_USER_VALUE[tool];
}
