/**
 * AI 생성물 방침 조항 — 단일 출처.
 *
 * 소유자 방침(2026-08-11): 수익 보장·확정 수익 문구는 사이트에 영구 미기재.
 * AI 답변은 매번 새로 생성되는 표면이라, 화면 고지(ComplianceNotice)만으로는
 * 부족하고 생성 단계에서 막아야 한다. 프롬프트마다 제각각 적으면 한 곳만
 * 고쳐지고 방침이 프롬프트별로 달라지므로, 모든 AI 시스템 프롬프트가 이
 * 상수를 이어 붙인다. 문구를 바꿀 일이 생기면 여기만 고친다.
 */
export const NO_PROFIT_GUARANTEE_AI_CLAUSE =
  "수익 보장·확정 수익·원금 보장 등 수익을 약속하는 표현은 절대 쓰지 마세요(플랫폼 방침·전자상거래법). '무조건 오른다'·'확실한 수익' 같은 단정도 금지이며, 투자 판단과 결과의 책임은 이용자 본인에게 있음을 전제하세요.";

/** 시스템 프롬프트 끝에 방침 조항을 이어 붙인다(공백 정규화). */
export function withComplianceClause(systemPrompt: string): string {
  const base = systemPrompt.trimEnd();
  if (base.includes("수익을 약속하는 표현")) return base; // 이미 포함(중복 방지)
  if (!base) return NO_PROFIT_GUARANTEE_AI_CLAUSE; // 시스템 프롬프트가 없으면 조항이 곧 시스템
  return `${base}\n\n${NO_PROFIT_GUARANTEE_AI_CLAUSE}`;
}
